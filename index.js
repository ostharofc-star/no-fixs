require("dotenv").config();

const express = require("express");
const pino = require("pino");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const activeBots = new Map();
const qrCodes = new Map();
const connectionStatus = new Map();

// ===============================
// START USER BOT
// ===============================
async function startUserBot(number) {
  if (activeBots.has(number)) {
    return activeBots.get(number);
  }

  const sessionPath = path.join(
    __dirname,
    "sessions",
    number
  );

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: "silent" })
      )
    },

    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false
  });

  activeBots.set(number, sock);

  connectionStatus.set(
    number,
    state.creds.registered
      ? "connecting"
      : "waiting"
  );

  sock.ev.on("creds.update", saveCreds);

  // ===============================
  // COMMAND SYSTEM
  // ===============================
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;

        if (!jid) continue;
        if (jid === "status@broadcast") continue;
        if (jid.endsWith("@newsletter")) continue;

        let text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          "";

        text = text.trim();

        if (!text) continue;

        const command = text
          .toLowerCase()
          .replace(/^\.\s+/, ".");

        console.log(`[${number}] ${command}`);

        // ===============================
        // PING
        // ===============================
        if (command === ".ping") {
          await sock.sendMessage(
            jid,
            {
              text:
                "⚡ *OSTHAR MINI BOT*\n\n" +
                "Status: Online\n" +
                "Response: Successful\n" +
                "Connection: Stable\n\n" +
                "The bot is running successfully."
            },
            { quoted: msg }
          );
        }

        // ===============================
        // ALIVE
        // ===============================
        else if (command === ".alive") {
          await sock.sendMessage(
            jid,
            {
              text:
                "╭━━━〔 *OSTHAR MINI BOT* 〕━━━╮\n\n" +
                "Status: Online\n" +
                "System: Active\n" +
                "Connection: Established\n" +
                "Performance: Running\n\n" +
                "The bot is online and ready to use.\n\n" +
                "╰━━━━━━━━━━━━━━━━━━━━╯"
            },
            { quoted: msg }
          );
        }

        // ===============================
        // MENU
        // ===============================
        else if (
          command === ".menu" ||
          command === ".help"
        ) {
          await sock.sendMessage(
            jid,
            {
              text:
                "╭━━━〔 *OSTHAR MINI BOT* 〕━━━╮\n\n" +

                "*GENERAL*\n" +
                "│ .menu\n" +
                "│ .help\n" +
                "│ .ping\n" +
                "│ .alive\n" +
                "│ .owner\n\n" +

                "*DOWNLOADS*\n" +
                "│ .song <YouTube URL>\n" +
                "│ .video <YouTube URL>\n" +
                "│ .tiktok <URL>\n" +
                "│ .facebook <URL>\n" +
                "│ .instagram <URL>\n" +
                "│ .apk <App Name>\n\n" +

                "*AUTOMATION*\n" +
                "│ Anti Delete\n" +
                "│ Auto React\n" +
                "│ Auto Status Seen\n" +
                "│ Auto Reply\n\n" +

                "Powered by OSTHAR\n" +
                "╰━━━━━━━━━━━━━━━━━━━━╯"
            },
            { quoted: msg }
          );
        }

        // ===============================
        // OWNER
        // ===============================
        else if (command === ".owner") {
          await sock.sendMessage(
            jid,
            {
              text:
                "*OSTHAR MINI BOT*\n\n" +
                "Developer: OSTHAR\n" +
                "System: Advanced WhatsApp Mini Bot\n" +
                "Status: Active"
            },
            { quoted: msg }
          );
        }
      }

    } catch (error) {
      console.log(`[${number}] Message Error:`, error);
    }
  });

  // ===============================
  // CONNECTION
  // ===============================
  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
      qr
    } = update;

    if (qr) {
      try {
        const image = await QRCode.toDataURL(qr);

        qrCodes.set(number, image);
        connectionStatus.set(number, "waiting");

        console.log(`[${number}] QR generated`);
      } catch (error) {
        console.log("QR Error:", error);
      }
    }

    if (connection === "open") {
      console.log(`[${number}] CONNECTED`);

      qrCodes.delete(number);
      connectionStatus.set(number, "connected");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log(`[${number}] Closed:`, statusCode);

      activeBots.delete(number);

      if (statusCode === DisconnectReason.loggedOut) {
        connectionStatus.set(number, "loggedout");

        try {
          fs.rmSync(sessionPath, {
            recursive: true,
            force: true
          });
        } catch {}

        qrCodes.delete(number);

      } else {
        connectionStatus.set(number, "reconnecting");

        setTimeout(() => {
          startUserBot(number);
        }, 3000);
      }
    }
  });

  return sock;
}

// ===============================
// WEBSITE HOME
// ===============================
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
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
  font-family:Arial,sans-serif;
  background:#080b10;
  color:#ffffff;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:100vh;
  padding:20px;
}

.card{
  width:100%;
  max-width:420px;
  background:#11151c;
  border:1px solid #232933;
  border-radius:20px;
  padding:30px;
  box-shadow:0 20px 60px rgba(0,0,0,.5);
}

.logo{
  font-size:26px;
  font-weight:700;
  margin-bottom:6px;
}

.subtitle{
  color:#9ca3af;
  font-size:14px;
  margin-bottom:28px;
  line-height:1.6;
}

label{
  display:block;
  font-size:13px;
  margin-bottom:8px;
  color:#cbd5e1;
}

input{
  width:100%;
  padding:15px 16px;
  border-radius:12px;
  border:1px solid #2a313d;
  background:#0b0f14;
  color:white;
  outline:none;
  font-size:16px;
  margin-bottom:14px;
}

input:focus{
  border-color:#21c063;
}

button{
  width:100%;
  border:none;
  padding:15px;
  border-radius:12px;
  background:#21c063;
  color:#07110b;
  font-weight:700;
  font-size:15px;
  cursor:pointer;
}

button:hover{
  opacity:.92;
}

.info{
  font-size:12px;
  color:#7f8a99;
  margin-top:20px;
  line-height:1.6;
}

.status{
  margin-top:20px;
  padding:13px;
  border-radius:10px;
  background:#0b0f14;
  display:none;
  font-size:13px;
}
</style>

</head>

<body>

<div class="card">

<div class="logo">
OSTHAR MINI BOT
</div>

<div class="subtitle">
Connect your WhatsApp account and activate your personal mini bot.
</div>

<label>
WhatsApp Number
</label>

<input
id="number"
placeholder="94771234567"
inputmode="numeric">

<button onclick="connectBot()">
CONNECT DEVICE
</button>

<div
id="status"
class="status">
</div>

<div class="info">
Enter your WhatsApp number with country code.
Example: 94771234567
</div>

</div>

<script>

async function connectBot(){

  const number =
    document
    .getElementById("number")
    .value
    .replace(/[^0-9]/g,"");

  const status =
    document.getElementById("status");

  if(!number){

    status.style.display="block";

    status.innerText =
    "Please enter your WhatsApp number.";

    return;
  }

  status.style.display="block";

  status.innerText =
  "Creating your secure session...";

  try{

    const r =
      await fetch(
        "/connect?number="+number
      );

    const d =
      await r.json();

    if(d.success){

      window.location.href =
      "/device/"+number;

    }else{

      status.innerText =
      d.message ||
      "Unable to create session.";

    }

  }catch(e){

    status.innerText =
    "Connection error. Please try again.";

  }
}

</script>

</body>
</html>
`);
});

// ===============================
// CREATE USER SESSION
// ===============================
app.get("/connect", async (req, res) => {
  try {
    let number = req.query.number;

    if (!number) {
      return res.json({
        success: false,
        message: "Phone number is required."
      });
    }

    number = number.replace(/[^0-9]/g, "");

    if (
      number.length < 8 ||
      number.length > 15
    ) {
      return res.json({
        success: false,
        message: "Invalid phone number."
      });
    }

    await startUserBot(number);

    return res.json({
      success: true
    });

  } catch (error) {
    console.log(error);

    return res.json({
      success: false,
      message: "Failed to create session."
    });
  }
});

// ===============================
// QR DEVICE PAGE
// ===============================
app.get("/device/:number", (req, res) => {

  const number = req.params.number;

  res.send(`
<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Connect Device</title>

<style>
body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#080b10;
  color:#fff;
  display:flex;
  justify-content:center;
  align-items:center;
  min-height:100vh;
  padding:20px;
}

.card{
  width:100%;
  max-width:430px;
  background:#11151c;
  border:1px solid #232933;
  border-radius:20px;
  padding:28px;
  text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,.45);
}

h2{
  margin-top:0;
}

p{
  color:#9ca3af;
  line-height:1.6;
}

.qr{
  width:260px;
  max-width:100%;
  border-radius:14px;
  background:white;
  padding:10px;
  margin-top:15px;
}

.status{
  margin-top:20px;
  font-weight:600;
}

.success{
  color:#26d366;
}
</style>

</head>

<body>

<div class="card">

<h2>
OSTHAR MINI BOT
</h2>

<p>
Open WhatsApp → Linked Devices → Link a Device and scan the QR code.
</p>

<div id="content">
Preparing QR code...
</div>

<div
id="status"
class="status">
</div>

</div>

<script>

const number = "${number}";

async function check(){

  try{

    const r =
      await fetch(
        "/status/"+number
      );

    const d =
      await r.json();

    const content =
      document.getElementById("content");

    const status =
      document.getElementById("status");

    if(d.status === "connected"){

      content.innerHTML = "";

      status.className =
      "status success";

      status.innerText =
      "WhatsApp connected successfully.";

      return;
    }

    if(d.qr){

      content.innerHTML =
      '<img class="qr" src="'+
      d.qr+
      '">';

      status.innerText =
      "Waiting for QR scan...";

    }else{

      status.innerText =
      "Preparing connection...";

    }

    setTimeout(check,1500);

  }catch(e){

    setTimeout(check,2500);

  }
}

check();

</script>

</body>
</html>
`);
});

// ===============================
// STATUS API
// ===============================
app.get("/status/:number", (req, res) => {

  const number = req.params.number;

  res.json({
    status:
      connectionStatus.get(number)
      || "unknown",

    qr:
      qrCodes.get(number)
      || null
  });
});

// ===============================
// START SERVER
// ===============================
app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "=============================="
    );

    console.log(
      "OSTHAR MINI BOT SERVER"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      "=============================="
    );
  }
);