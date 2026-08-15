require("dotenv").config();

const express = require("express");
const pino = require("pino");
const QRCode = require("qrcode");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

// ======================================================
// DATABASE
// ======================================================

const {
  connectMongoDB
} = require("./database/mongo");

const {
  getUserSettings
} = require("./database/settings");

// ======================================================
// COMMAND SYSTEM
// ======================================================

const {
  loadCommands,
  getCommand
} = require("./lib/commandLoader");

const {
  reactToCommand
} = require("./lib/reactions");

// ======================================================
// HELPERS
// ======================================================

const {
  cleanPhoneNumber,
  isValidPhoneNumber,
  getMessageText,
  getCommandParts,
  isStatusJid,
  isNewsletterJid,
  safeDelete
} = require("./lib/helpers");

// ======================================================
// DESTINATION SYSTEM
// ======================================================

const {
  getAntiDeleteDestination
} = require("./lib/destination");

// ======================================================
// AUTOMATION
// ======================================================

const {
  cacheMessage,
  getCachedMessage,
  handleAutoRead,
  startTyping,
  stopTyping,
  handleAutoReply,
  handleStatusMessage,
  registerAntiCall
} = require("./lib/automation");

// ======================================================
// GROUP SYSTEM
// ======================================================

const {
  registerGroupEvents,
  handleAntiLink,
  handleAntiSpam
} = require("./lib/groups");

// ======================================================
// CONNECTION MESSAGE
// ======================================================

const {
  sendConnectionSuccessMessage
} = require("./lib/connection");

// ======================================================
// WEB DASHBOARD
// ======================================================

const webRoutes =
  require("./web/routes");

// ======================================================
// APP CONFIG
// ======================================================

const app = express();

const PORT =
  Number(process.env.PORT) || 3000;

const START_TIME = Date.now();

const logger = pino({
  level: "silent"
});

const SESSION_ROOT =
  process.env.SESSION_DIR ||
  path.join(__dirname, "sessions");

if (!fs.existsSync(SESSION_ROOT)) {
  fs.mkdirSync(
    SESSION_ROOT,
    {
      recursive: true
    }
  );
}

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

// ======================================================
// STORES
// ======================================================

const commands = loadCommands();

const activeBots =
  new Map();

const qrCodes =
  new Map();

const connectionStatus =
  new Map();

const webSessions =
  new Map();

const newLinkPending =
  new Set();

// ======================================================
// WEB TOKEN
// ======================================================

function createWebToken(phone) {
  const token =
    crypto
      .randomBytes(24)
      .toString("hex");

  webSessions.set(
    token,
    {
      phone,

      expiresAt:
        Date.now() +
        15 * 60 * 1000
    }
  );

  return token;
}

// ======================================================
// WEB TOKEN CLEANUP
// ======================================================

setInterval(
  () => {
    const now =
      Date.now();

    for (
      const [token, data]
      of webSessions.entries()
    ) {
      if (
        data.expiresAt <
        now
      ) {
        webSessions.delete(
          token
        );
      }
    }
  },

  5 * 60 * 1000
);

// ======================================================
// MEDIA DOWNLOAD HELPER
// ======================================================

function attachMediaDownloader(sock) {
  sock.downloadMediaMessage =
    async (message) => {
      return downloadMediaMessage(
        message,
        "buffer",
        {},
        {
          logger,

          reuploadRequest:
            sock.updateMediaMessage
        }
      );
    };
}

// ======================================================
// ANTI DELETE
// ======================================================

async function resendDeletedMessage(
  sock,
  phone,
  deletedKey
) {
  try {
    const settings =
      await getUserSettings(
        phone
      );

    if (!settings.antiDelete) {
      return;
    }

    const cached =
      getCachedMessage(
        deletedKey.id
      );

    if (!cached?.message) {
      return;
    }

    const originalJid =
      deletedKey.remoteJid ||
      cached.key.remoteJid;

    if (!originalJid) {
      return;
    }

    const destinationJid =
      getAntiDeleteDestination({
        settings,
        ownerPhone: phone,
        currentJid: originalJid
      });

    if (!destinationJid) {
      return;
    }

    const message =
      cached.message;

    const sender =
      cached.key.participant ||
      cached.key.remoteJid ||
      "Unknown";

    const header =
      "🛡️ *ANTI DELETE*\n\n" +
      `Sender: ${sender}\n` +
      `Original Chat: ${originalJid}\n\n`;

    // TEXT
    const text =
      message.conversation ||
      message
        .extendedTextMessage
        ?.text;

    if (text) {
      await sock.sendMessage(
        destinationJid,
        {
          text:
            header +
            "*Deleted Message:*\n" +
            text
        }
      );

      return;
    }

    // IMAGE
    if (message.imageMessage) {
      const buffer =
        await sock.downloadMediaMessage({
          key: cached.key,

          message: {
            imageMessage:
              message.imageMessage
          }
        });

      await sock.sendMessage(
        destinationJid,
        {
          image: buffer,

          caption:
            header +
            (
              message
                .imageMessage
                .caption ||
              "Deleted image recovered."
            )
        }
      );

      return;
    }

    // VIDEO
    if (message.videoMessage) {
      const buffer =
        await sock.downloadMediaMessage({
          key: cached.key,

          message: {
            videoMessage:
              message.videoMessage
          }
        });

      await sock.sendMessage(
        destinationJid,
        {
          video: buffer,

          caption:
            header +
            (
              message
                .videoMessage
                .caption ||
              "Deleted video recovered."
            )
        }
      );

      return;
    }

    // AUDIO
    if (message.audioMessage) {
      const buffer =
        await sock.downloadMediaMessage({
          key: cached.key,

          message: {
            audioMessage:
              message.audioMessage
          }
        });

      await sock.sendMessage(
        destinationJid,
        {
          audio: buffer,

          mimetype:
            message
              .audioMessage
              .mimetype ||
            "audio/ogg; codecs=opus",

          ptt:
            !!message
              .audioMessage
              .ptt
        }
      );

      await sock.sendMessage(
        destinationJid,
        {
          text:
            header +
            "Deleted audio recovered."
        }
      );

      return;
    }

    // STICKER
    if (message.stickerMessage) {
      const buffer =
        await sock.downloadMediaMessage({
          key: cached.key,

          message: {
            stickerMessage:
              message.stickerMessage
          }
        });

      await sock.sendMessage(
        destinationJid,
        {
          sticker: buffer
        }
      );

      await sock.sendMessage(
        destinationJid,
        {
          text:
            header +
            "Deleted sticker recovered."
        }
      );

      return;
    }

    // DOCUMENT
    if (message.documentMessage) {
      const buffer =
        await sock.downloadMediaMessage({
          key: cached.key,

          message: {
            documentMessage:
              message.documentMessage
          }
        });

      await sock.sendMessage(
        destinationJid,
        {
          document: buffer,

          mimetype:
            message
              .documentMessage
              .mimetype ||
            "application/octet-stream",

          fileName:
            message
              .documentMessage
              .fileName ||
            "recovered-file"
        }
      );

      await sock.sendMessage(
        destinationJid,
        {
          text:
            header +
            "Deleted document recovered."
        }
      );

      return;
    }

  } catch (error) {
    console.log(
      `[${phone}] Anti Delete Error:`,
      error?.message || error
    );
  }
}

// ======================================================
// START USER BOT
// ======================================================

async function startUserBot(phone) {
  phone =
    cleanPhoneNumber(phone);

  if (
    !isValidPhoneNumber(phone)
  ) {
    throw new Error(
      "Invalid phone number."
    );
  }

  if (
    activeBots.has(phone)
  ) {
    return activeBots.get(
      phone
    );
  }

  const sessionPath =
    path.join(
      SESSION_ROOT,
      phone
    );

  const {
    state,
    saveCreds
  } =
    await useMultiFileAuthState(
      sessionPath
    );

  const {
    version
  } =
    await fetchLatestBaileysVersion();

  const sock =
    makeWASocket({
      version,

      logger,

      auth: {
        creds:
          state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            logger
          )
      },

      printQRInTerminal:
        false,

      markOnlineOnConnect:
        false,

      syncFullHistory:
        false
    });

  attachMediaDownloader(
    sock
  );

  activeBots.set(
    phone,
    sock
  );

  connectionStatus.set(
    phone,

    state.creds.registered
      ? "connecting"
      : "waiting"
  );

  // SAVE CREDS
  sock.ev.on(
    "creds.update",
    async () => {
      try {
        await saveCreds();
      } catch (error) {
        console.log(
          `[${phone}] Save Creds Error:`,
          error?.message || error
        );
      }
    }
  );

  // ANTI CALL
  registerAntiCall(
    sock,
    phone
  );

  // GROUP EVENTS
  registerGroupEvents(
    sock,
    phone
  );

  // ==================================================
  // MESSAGE HANDLER
  // ==================================================

  sock.ev.on(
    "messages.upsert",
    async ({
      messages,
      type
    }) => {
      if (
        type !== "notify"
      ) {
        return;
      }

      for (
        const msg of messages
      ) {
        try {
          if (
            !msg?.message
          ) {
            continue;
          }

          const jid =
            msg.key.remoteJid;

          if (!jid) {
            continue;
          }

          cacheMessage(
            msg
          );

          const settings =
            await getUserSettings(
              phone
            );

          // STATUS
          if (
            isStatusJid(jid)
          ) {
            await handleStatusMessage({
              sock,
              msg,
              settings
            });

            continue;
          }

          // Ignore channels
          if (
            isNewsletterJid(jid)
          ) {
            continue;
          }

          const text =
            getMessageText(
              msg
            );

          // AUTO READ
          await handleAutoRead(
            sock,
            msg,
            settings
          );

          // PARSE COMMAND
          const parsed =
            getCommandParts(
              text,
              settings.prefix ||
              "."
            );

          // ANTI LINK
          const linkHandled =
            await handleAntiLink({
              sock,
              msg,
              jid,
              text,
              settings
            });

          if (
            linkHandled
          ) {
            continue;
          }

          // ANTI SPAM
          await handleAntiSpam({
            sock,
            msg,
            jid,
            settings
          });

          // AUTO REPLY
          if (
            !parsed.isCommand
          ) {
            await handleAutoReply({
              sock,
              msg,
              jid,
              text,
              settings,
              isCommand: false
            });

            continue;
          }

          const {
            command,
            args,
            query
          } = parsed;

          const commandFile =
            getCommand(
              commands,
              command
            );

          if (
            !commandFile
          ) {
            continue;
          }

          console.log(
            `[${phone}] ${settings.prefix}${command}`
          );

          // COMMAND AUTO REACTION
          if (
            settings.autoReact
          ) {
            await reactToCommand(
              sock,
              msg,
              command
            );
          }

          // AUTO TYPING
          await startTyping(
            sock,
            jid,
            settings
          );

          try {
            await commandFile.execute({
              sock,
              msg,
              jid,
              phone,
              command,
              args,
              query,
              settings,
              startTime:
                START_TIME
            });

          } catch (error) {
            console.log(
              `[${phone}] Command Error (${command}):`,
              error?.message || error
            );

            try {
              await sock.sendMessage(
                jid,
                {
                  text:
                    "❌ *COMMAND ERROR*\n\n" +
                    "Unable to complete this command right now.\n\n" +
                    `Error: ${error?.message || "Unknown error"}`
                },
                {
                  quoted: msg
                }
              );
            } catch {}
          }

          await stopTyping(
            sock,
            jid,
            settings
          );

        } catch (error) {
          console.log(
            `[${phone}] Message Handler Error:`,
            error?.message || error
          );
        }
      }
    }
  );

  // ==================================================
  // DELETE EVENT
  // ==================================================

  sock.ev.on(
    "messages.delete",
    async (event) => {
      try {
        if (
          event?.all
        ) {
          return;
        }

        const keys =
          event?.keys ||
          [];

        for (
          const key of keys
        ) {
          await resendDeletedMessage(
            sock,
            phone,
            key
          );
        }

      } catch (error) {
        console.log(
          `[${phone}] Delete Event Error:`,
          error?.message || error
        );
      }
    }
  );

  // ==================================================
  // CONNECTION UPDATE
  // ==================================================

  sock.ev.on(
    "connection.update",
    async (update) => {
      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      // QR
      if (qr) {
        try {
          const image =
            await QRCode.toDataURL(
              qr,
              {
                width: 600,
                margin: 2
              }
            );

          qrCodes.set(
            phone,
            image
          );

          connectionStatus.set(
            phone,
            "waiting"
          );

          newLinkPending.add(
            phone
          );

          console.log(
            `[${phone}] QR generated`
          );

        } catch (error) {
          console.log(
            `[${phone}] QR Error:`,
            error?.message || error
          );
        }
      }

      // CONNECTED
      if (
        connection ===
        "open"
      ) {
        console.log(
          `[${phone}] CONNECTED`
        );

        qrCodes.delete(
          phone
        );

        connectionStatus.set(
          phone,
          "connected"
        );

        if (
          newLinkPending.has(
            phone
          )
        ) {
          newLinkPending.delete(
            phone
          );

          try {
            const settings =
              await getUserSettings(
                phone
              );

            await sendConnectionSuccessMessage({
              sock,
              phone,
              settings
            });

          } catch (error) {
            console.log(
              `[${phone}] Welcome Error:`,
              error?.message || error
            );
          }
        }
      }

      // CLOSED
      if (
        connection ===
        "close"
      ) {
        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          `[${phone}] Connection Closed:`,
          statusCode
        );

        activeBots.delete(
          phone
        );

        // LOGGED OUT
        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {
          connectionStatus.set(
            phone,
            "loggedout"
          );

          qrCodes.delete(
            phone
          );

          newLinkPending.delete(
            phone
          );

          try {
            safeDelete(
              sessionPath
            );
          } catch {}

          console.log(
            `[${phone}] Session logged out`
          );

          return;
        }

        // AUTO RECONNECT
        connectionStatus.set(
          phone,
          "reconnecting"
        );

        setTimeout(
          () => {
            startUserBot(
              phone
            ).catch(
              (error) => {
                console.log(
                  `[${phone}] Reconnect Error:`,
                  error?.message || error
                );
              }
            );
          },
          2500
        );
      }
    }
  );

  return sock;
}

// ======================================================
// RESTORE SAVED SESSIONS
// ======================================================

async function restoreSessions() {
  try {
    if (
      !fs.existsSync(
        SESSION_ROOT
      )
    ) {
      return;
    }

    const folders =
      fs.readdirSync(
        SESSION_ROOT,
        {
          withFileTypes: true
        }
      );

    const sessions =
      folders.filter(
        (item) =>
          item.isDirectory()
      );

    console.log(
      `Found ${sessions.length} saved session(s).`
    );

    for (
      const session
      of sessions
    ) {
      const phone =
        cleanPhoneNumber(
          session.name
        );

      if (
        !isValidPhoneNumber(
          phone
        )
      ) {
        continue;
      }

      console.log(
        `Restoring: ${phone}`
      );

      startUserBot(
        phone
      ).catch(
        (error) => {
          console.log(
            `[${phone}] Restore Error:`,
            error?.message || error
          );
        }
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            800
          )
      );
    }

  } catch (error) {
    console.log(
      "Session Restore Error:",
      error?.message || error
    );
  }
}

// ======================================================
// WEBSITE HOME
// ======================================================

app.get(
  "/",
  (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0">

<title>OSTHAR MINI BOT</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  min-height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  padding:20px;

  background:
    radial-gradient(
      circle at top,
      #14261d,
      #080b10 45%
    );

  font-family:
    Arial,
    sans-serif;

  color:#ffffff;
}

.card{
  width:100%;
  max-width:440px;

  background:
    rgba(16,20,27,.96);

  border:
    1px solid #28302e;

  border-radius:24px;

  padding:32px;

  box-shadow:
    0 30px 80px
    rgba(0,0,0,.55);
}

.badge{
  display:inline-block;

  padding:7px 11px;

  border-radius:999px;

  background:
    rgba(37,211,102,.12);

  color:#25d366;

  font-size:12px;

  font-weight:700;

  margin-bottom:18px;
}

h1{
  margin:0 0 10px;
  font-size:27px;
}

.subtitle{
  color:#aab3bf;
  font-size:14px;
  line-height:1.6;
  margin-bottom:26px;
}

label{
  display:block;
  font-size:13px;
  font-weight:600;
  margin-bottom:9px;
  color:#d9e0e7;
}

input{
  width:100%;
  height:54px;
  padding:0 16px;
  border-radius:13px;
  border:1px solid #303842;
  outline:none;
  background:#090d12;
  color:#fff;
  font-size:16px;
}

input:focus{
  border-color:#25d366;
}

button{
  width:100%;
  height:54px;
  border:0;
  border-radius:13px;
  margin-top:14px;
  background:#25d366;
  color:#06110a;
  font-size:15px;
  font-weight:800;
  cursor:pointer;
}

button:hover{
  opacity:.92;
}

.status{
  display:none;
  margin-top:18px;
  padding:14px;
  border-radius:12px;
  background:#090d12;
  border:1px solid #232b32;
  color:#bec7d1;
  font-size:13px;
  line-height:1.5;
}

.info{
  margin-top:20px;
  color:#737f8c;
  font-size:12px;
  line-height:1.6;
}

.footer{
  margin-top:25px;
  text-align:center;
  color:#59636e;
  font-size:11px;
}

.dashboard-link{
  display:block;
  text-align:center;
  margin-top:16px;
  color:#25d366;
  text-decoration:none;
  font-size:13px;
  font-weight:700;
}

</style>

</head>

<body>

<div class="card">

<div class="badge">
ONLINE SERVICE
</div>

<h1>
OSTHAR MINI BOT
</h1>

<div class="subtitle">
Connect your WhatsApp account and activate your personal mini bot.
</div>

<label>
WhatsApp Number
</label>

<input
id="number"
inputmode="numeric"
autocomplete="off"
placeholder="94771234567">

<button
id="connectButton"
onclick="connectDevice()">
CONNECT DEVICE
</button>

<div
id="status"
class="status">
</div>

<div class="info">
Enter your WhatsApp number with the country code.
Do not include the + symbol.<br><br>
Example: 94771234567
</div>

<a
class="dashboard-link"
href="/login">
Already connected? Open Web Dashboard
</a>

<div class="footer">
Mini Bot Created by Pamoda Nethsara
</div>

</div>

<script>

async function connectDevice(){

  const input =
    document.getElementById(
      "number"
    );

  const status =
    document.getElementById(
      "status"
    );

  const button =
    document.getElementById(
      "connectButton"
    );

  const number =
    input.value.replace(
      /[^0-9]/g,
      ""
    );

  status.style.display =
    "block";

  if(!number){

    status.innerText =
      "Please enter your WhatsApp number.";

    return;
  }

  button.disabled =
    true;

  button.innerText =
    "PREPARING...";

  status.innerText =
    "Creating your secure WhatsApp session...";

  try{

    const response =
      await fetch(
        "/api/connect",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              number
            })
        }
      );

    const data =
      await response.json();

    if(
      !data.success
    ){
      throw new Error(
        data.message ||
        "Unable to create session."
      );
    }

    window.location.href =
      "/device/" +
      data.token;

  }catch(error){

    status.innerText =
      error.message ||
      "Unable to connect.";

    button.disabled =
      false;

    button.innerText =
      "CONNECT DEVICE";
  }
}

</script>

</body>

</html>
`);
  }
);

// ======================================================
// CONNECT API
// ======================================================

app.post(
  "/api/connect",
  async (req, res) => {
    try {
      const phone =
        cleanPhoneNumber(
          req.body?.number
        );

      if (
        !isValidPhoneNumber(
          phone
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please enter a valid WhatsApp number with country code."
          });
      }

      await getUserSettings(
        phone
      );

      await startUserBot(
        phone
      );

      const token =
        createWebToken(
          phone
        );

      return res.json({
        success: true,
        token
      });

    } catch (error) {
      console.log(
        "Connect API Error:",
        error?.message || error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            error?.message ||
            "Unable to create WhatsApp session."
        });
    }
  }
);

// ======================================================
// DEVICE PAGE
// ======================================================

app.get(
  "/device/:token",
  (req, res) => {
    const token =
      String(
        req.params.token ||
        ""
      );

    const webSession =
      webSessions.get(
        token
      );

    if (
      !webSession ||
      webSession.expiresAt <
      Date.now()
    ) {
      return res
        .status(404)
        .send(
          "This connection session has expired. Please return to the homepage and try again."
        );
    }

    res.send(`
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Connect WhatsApp</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  min-height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  padding:20px;
  background:#080b10;
  font-family:Arial,sans-serif;
  color:#fff;
}

.card{
  width:100%;
  max-width:440px;
  padding:30px;
  text-align:center;
  background:#11161d;
  border:1px solid #283039;
  border-radius:24px;
  box-shadow:
    0 30px 80px
    rgba(0,0,0,.5);
}

h2{
  margin-top:0;
}

.description{
  color:#9ba6b3;
  font-size:14px;
  line-height:1.6;
}

.qr{
  width:270px;
  max-width:100%;
  margin:20px auto 10px;
  padding:10px;
  border-radius:16px;
  background:#fff;
}

.loader{
  margin:30px 0;
  color:#9ba6b3;
}

.success{
  color:#25d366;
  font-weight:700;
  margin-top:25px;
  line-height:1.6;
}

.error{
  color:#ff6b6b;
  font-weight:600;
  margin-top:20px;
}

.footer{
  margin-top:30px;
  color:#5f6974;
  font-size:11px;
}

.dashboard-link{
  display:inline-block;
  margin-top:18px;
  color:#25d366;
  text-decoration:none;
}

</style>

</head>

<body>

<div class="card">

<h2>
OSTHAR MINI BOT
</h2>

<div class="description">
Open WhatsApp → Linked Devices → Link a Device and scan the QR code below.
</div>

<div
id="content"
class="loader">
Preparing your QR code...
</div>

<div
id="result">
</div>

<div class="footer">
Mini Bot Created by Pamoda Nethsara
</div>

</div>

<script>

const token =
  ${JSON.stringify(token)};

async function checkStatus(){

  try{

    const response =
      await fetch(
        "/api/status/" +
        token,
        {
          cache:"no-store"
        }
      );

    const data =
      await response.json();

    const content =
      document.getElementById(
        "content"
      );

    const result =
      document.getElementById(
        "result"
      );

    if(
      data.status ===
      "connected"
    ){

      content.innerHTML =
        "";

      result.innerHTML =
        '<div class="success">' +
        'WhatsApp Connected Successfully.<br><br>' +
        'Your OSTHAR MINI BOT is now online and ready to use.<br><br>' +
        '<a class="dashboard-link" href="/login">Open Web Dashboard</a>' +
        '</div>';

      return;
    }

    if(
      data.status ===
      "loggedout"
    ){

      content.innerHTML =
        "";

      result.innerHTML =
        '<div class="error">' +
        'The WhatsApp session was logged out. Please reconnect.' +
        '</div>';

      return;
    }

    if(data.qr){

      content.innerHTML =
        '<img class="qr" src="' +
        data.qr +
        '">';

      result.innerHTML =
        '<div class="description">' +
        'Waiting for QR scan...' +
        '</div>';

    }else{

      content.innerHTML =
        "Preparing connection...";
    }

    setTimeout(
      checkStatus,
      1500
    );

  }catch(error){

    setTimeout(
      checkStatus,
      2500
    );
  }
}

checkStatus();

</script>

</body>

</html>
`);
  }
);

// ======================================================
// STATUS API
// ======================================================

app.get(
  "/api/status/:token",
  (req, res) => {
    const token =
      String(
        req.params.token ||
        ""
      );

    const webSession =
      webSessions.get(
        token
      );

    if (
      !webSession ||
      webSession.expiresAt <
      Date.now()
    ) {
      return res
        .status(404)
        .json({
          success: false,
          status: "expired"
        });
    }

    const phone =
      webSession.phone;

    return res.json({
      success: true,

      status:
        connectionStatus.get(
          phone
        ) ||
        "unknown",

      qr:
        qrCodes.get(
          phone
        ) ||
        null
    });
  }
);

// ======================================================
// WEB DASHBOARD LOGIN
// ======================================================

app.get(
  "/login",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// Dashboard pages + APIs
app.use(webRoutes);

// ======================================================
// HEALTH
// ======================================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      status: "online",

      bot:
        "OSTHAR MINI BOT",

      activeBots:
        activeBots.size,

      uptime:
        process.uptime()
    });
  }
);

// ======================================================
// BOOT
// ======================================================

async function bootstrap() {
  try {
    console.log(
      "================================="
    );

    console.log(
      "       OSTHAR MINI BOT"
    );

    console.log(
      "================================="
    );

    await connectMongoDB();

    console.log(
      "MongoDB: Connected"
    );

    await restoreSessions();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          "================================="
        );

        console.log(
          `Server running on port ${PORT}`
        );

        console.log(
          `Loaded Commands: ${commands.size}`
        );

        console.log(
          `Session Directory: ${SESSION_ROOT}`
        );

        console.log(
          "OSTHAR MINI BOT is ready."
        );

        console.log(
          "================================="
        );
      }
    );

  } catch (error) {
    console.error(
      "BOOT ERROR:",
      error
    );

    process.exit(1);
  }
}

bootstrap();

// ======================================================
// PROCESS ERRORS
// ======================================================

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);
