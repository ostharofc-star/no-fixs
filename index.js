require("dotenv").config();

const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./sessions/main");

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

  sock.ev.on("creds.update", saveCreds);

  // =========================
  // MESSAGE COMMAND SYSTEM
  // =========================
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;

        if (!jid) continue;

        // Ignore WhatsApp Status
        if (jid === "status@broadcast") continue;

        let text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          "";

        text = text.trim();

        if (!text) continue;

        console.log(
          "MESSAGE:",
          text,
          "| FROM:",
          jid,
          "| FROM ME:",
          msg.key.fromMe
        );

        const command = text.toLowerCase();

        // =========================
        // PING
        // =========================
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

        // =========================
        // ALIVE
        // =========================
        else if (command === ".alive") {
          await sock.sendMessage(
            jid,
            {
              text:
                "╭━━━〔 *OSTHAR MINI BOT* 〕━━━╮\n\n" +
                "✅ Status: Online\n" +
                "⚡ System: Active\n" +
                "🔗 Connection: Established\n" +
                "🚀 Performance: Running\n\n" +
                "The bot is online and ready to use.\n\n" +
                "╰━━━━━━━━━━━━━━━━━━━━╯"
            },
            { quoted: msg }
          );
        }

        // =========================
        // MENU / HELP
        // =========================
        else if (
          command === ".menu" ||
          command === ".help"
        ) {
          await sock.sendMessage(
            jid,
            {
              text:
                "╭━━━〔 *OSTHAR MINI BOT* 〕━━━╮\n\n" +

                "⚡ *GENERAL*\n" +
                "│ .menu\n" +
                "│ .help\n" +
                "│ .ping\n" +
                "│ .alive\n" +
                "│ .owner\n\n" +

                "⬇️ *DOWNLOADS*\n" +
                "│ .song <YouTube URL>\n" +
                "│ .video <YouTube URL>\n" +
                "│ .tiktok <URL>\n" +
                "│ .facebook <URL>\n" +
                "│ .instagram <URL>\n" +
                "│ .apk <App Name>\n\n" +

                "🛡️ *AUTOMATION*\n" +
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

        // =========================
        // OWNER
        // =========================
        else if (command === ".owner") {
          await sock.sendMessage(
            jid,
            {
              text:
                "👤 *OSTHAR MINI BOT*\n\n" +
                "Developer: OSTHAR\n" +
                "System: Multi-Feature WhatsApp Bot\n" +
                "Status: Active"
            },
            { quoted: msg }
          );
        }
      }

    } catch (error) {
      console.error("MESSAGE ERROR:", error);
    }
  });

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
      qr
    } = update;

    if (qr) {
      console.clear();

      console.log("============================");
      console.log("      OSTHAR MINI BOT");
      console.log("============================");
      console.log("Scan the QR code below:\n");

      qrcode.generate(qr, {
        small: true
      });

      console.log(
        "\nWhatsApp > Linked Devices > Link a Device"
      );
    }

    if (connection === "open") {
      console.clear();

      console.log("============================");
      console.log("      OSTHAR MINI BOT");
      console.log("============================");
      console.log("STATUS: CONNECTED");
      console.log(
        "WhatsApp connection established successfully."
      );
      console.log("");
      console.log("Available test commands:");
      console.log(".ping");
      console.log(".alive");
      console.log(".menu");
      console.log(".owner");
      console.log("============================");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log("Connection closed:", statusCode);

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");

        setTimeout(() => {
          startBot();
        }, 3000);

      } else {
        console.log(
          "Session logged out. Delete the old session and scan a new QR code."
        );
      }
    }
  });
}

app.get("/", (req, res) => {
  res.send("OSTHAR MINI BOT - Server Online");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

startBot();