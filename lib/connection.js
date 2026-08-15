const {
  createWebPin
} = require("../database/webAuth");

async function sendConnectionSuccessMessage({
  sock,
  phone,
  settings
}) {
  try {
    const cleanPhone =
      String(phone || "")
        .replace(/[^0-9]/g, "");

    if (!cleanPhone) {
      throw new Error(
        "Invalid linked phone number."
      );
    }

    const jid =
      `${cleanPhone}@s.whatsapp.net`;

    const botName =
      settings?.botName ||
      "OSTHAR MINI BOT";

    const prefix =
      settings?.prefix ||
      ".";

    const webUrl =
      process.env.WEB_URL ||
      "https://osthar-mini-bot-production.up.railway.app/";

    // ==========================================
    // CREATE 5-DIGIT WEB PIN
    // ==========================================

    let webPin = null;
    let pinExpiresAt = null;

    try {
      const pinData =
        await createWebPin(
          cleanPhone,
          30
        );

      webPin =
        pinData.pin;

      pinExpiresAt =
        pinData.expiresAt;

    } catch (error) {
      console.log(
        "Web PIN Creation Error:",
        error?.message || error
      );
    }

    // ==========================================
    // PIN SECTION
    // ==========================================

    let webSection =
      `🌐 *WEB DASHBOARD*\n` +
      `│ Website: ${webUrl}\n` +
      `│ Phone: +${cleanPhone}\n`;

    if (webPin) {
      webSection +=
        `│ Web PIN: *${webPin}*\n` +
        `│ PIN Expiry: 30 minutes\n`;
    } else {
      webSection +=
        `│ Web PIN: Unavailable\n`;
    }

    // ==========================================
    // CONNECTION MESSAGE
    // ==========================================

    const message =
      `╭━━━〔 *${botName}* 〕━━━╮\n\n` +

      `✅ *CONNECTED SUCCESSFULLY*\n\n` +

      `Your WhatsApp account has been successfully connected to ${botName}.\n\n` +

      `The bot is now active and ready to use.\n\n` +

      `*SYSTEM STATUS*\n` +
      `│ Status: Connected\n` +
      `│ Service: Online\n` +
      `│ Connection: Stable\n` +
      `│ Commands: Ready\n\n` +

      `${webSection}\n` +

      (
        webPin
          ? `Use your phone number and Web PIN to sign in to the dashboard.\n\n`
          : `The dashboard PIN could not be generated. Bot commands are still available.\n\n`
      ) +

      `Type *${prefix}menu* to view all available commands and features.\n\n` +

      `Thank you for using ${botName}.\n\n` +

      `*Mini Bot Created by Pamoda Nethsara*\n` +

      `╰━━━━━━━━━━━━━━━━━━━━╯`;

    await sock.sendMessage(
      jid,
      {
        text: message
      }
    );

    console.log(
      `[CONNECTION] Welcome sent to ${cleanPhone}`
    );

    if (webPin) {
      console.log(
        `[WEB AUTH] PIN created for ${cleanPhone}`
      );
    }

    return true;

  } catch (error) {
    console.log(
      "Connection Welcome Error:",
      error?.message || error
    );

    return false;
  }
}

module.exports = {
  sendConnectionSuccessMessage
};