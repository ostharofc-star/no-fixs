const { setSetting } = require("../database/settings");

const TOGGLES = {
  antidelete: "antiDelete",
  anticall: "antiCall",
  autostatus: "autoStatusSeen",
  autoreact: "autoReact",
  autoreply: "autoReply",
  autoread: "autoRead",
  autotyping: "autoTyping",
  statusreact: "statusReact",
  statusreply: "statusReply",
  antilink: "antiLink",
  antispam: "antiSpam",
  welcome: "welcome",
  goodbye: "goodbye"
};

module.exports = {
  name: "toggle",
  aliases: Object.keys(TOGGLES),
  description: "Enable or disable bot features.",
  reaction: "⚙️",

  async execute({
    sock,
    msg,
    jid,
    command,
    args,
    phone
  }) {
    const settingKey = TOGGLES[command];

    if (!settingKey) {
      return;
    }

    const value = String(args[0] || "").toLowerCase();

    if (!["on", "off"].includes(value)) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚙️ *${command.toUpperCase()}*\n\n` +
            `Usage: .${command} on\n` +
            `Usage: .${command} off`
        },
        { quoted: msg }
      );
    }

    const enabled = value === "on";

    await setSetting(
      phone,
      settingKey,
      enabled
    );

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ *SETTING UPDATED*\n\n` +
          `${command}: ${enabled ? "ON" : "OFF"}\n\n` +
          "Your preference has been saved successfully."
      },
      { quoted: msg }
    );
  }
};