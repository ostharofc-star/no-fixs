const {
  getUserSettings
} = require("../database/settings");

const spamTracker = new Map();

// ==========================================
// GROUP PARTICIPANT UPDATE
// Welcome / Goodbye
// ==========================================

function registerGroupEvents(
  sock,
  phone
) {
  sock.ev.on(
    "group-participants.update",
    async (update) => {
      try {
        const settings =
          await getUserSettings(phone);

        const {
          id,
          participants,
          action
        } = update;

        if (!id || !participants?.length) {
          return;
        }

        // ===============================
        // WELCOME
        // ===============================
        if (
          action === "add" &&
          settings?.welcome
        ) {
          for (const participant of participants) {
            const number =
              participant.split("@")[0];

            await sock.sendMessage(
              id,
              {
                text:
                  `👋 *WELCOME*\n\n` +
                  `@${number}\n\n` +
                  `${settings.welcomeMessage || "Welcome to the group."}`,
                mentions: [participant]
              }
            );
          }
        }

        // ===============================
        // GOODBYE
        // ===============================
        if (
          action === "remove" &&
          settings?.goodbye
        ) {
          for (const participant of participants) {
            const number =
              participant.split("@")[0];

            await sock.sendMessage(
              id,
              {
                text:
                  `👋 *GOODBYE*\n\n` +
                  `@${number}\n\n` +
                  `${settings.goodbyeMessage || "Goodbye and take care."}`,
                mentions: [participant]
              }
            );
          }
        }

      } catch (error) {
        console.log(
          "Group Event Error:",
          error?.message || error
        );
      }
    }
  );
}

// ==========================================
// LINK DETECTION
// ==========================================

function containsLink(text = "") {
  const linkRegex =
    /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+)/i;

  return linkRegex.test(text);
}

// ==========================================
// ANTI LINK
// ==========================================

async function handleAntiLink({
  sock,
  msg,
  jid,
  text,
  settings
}) {
  try {
    if (!settings?.antiLink) {
      return false;
    }

    if (!jid?.endsWith("@g.us")) {
      return false;
    }

    if (!containsLink(text)) {
      return false;
    }

    const sender =
      msg.key.participant ||
      msg.key.remoteJid;

    const metadata =
      await sock.groupMetadata(jid);

    const participant =
      metadata.participants.find(
        (p) => p.id === sender
      );

    const isAdmin =
      participant?.admin === "admin" ||
      participant?.admin === "superadmin";

    if (isAdmin) {
      return false;
    }

    // Try deleting the link message
    try {
      await sock.sendMessage(
        jid,
        {
          delete: msg.key
        }
      );
    } catch {}

    await sock.sendMessage(
      jid,
      {
        text:
          "🔗 *ANTI LINK*\n\n" +
          "Links are not allowed in this group.",
        mentions: sender
          ? [sender]
          : []
      }
    );

    return true;

  } catch (error) {
    console.log(
      "Anti Link Error:",
      error?.message || error
    );

    return false;
  }
}

// ==========================================
// ANTI SPAM
// ==========================================

async function handleAntiSpam({
  sock,
  msg,
  jid,
  settings
}) {
  try {
    if (!settings?.antiSpam) {
      return false;
    }

    const sender =
      msg.key.participant ||
      msg.key.remoteJid;

    if (!sender) {
      return false;
    }

    const key =
      `${jid}:${sender}`;

    const now = Date.now();

    let data =
      spamTracker.get(key);

    if (!data) {
      data = {
        count: 0,
        firstAt: now
      };
    }

    // reset after 10 seconds
    if (
      now - data.firstAt >
      10000
    ) {
      data = {
        count: 0,
        firstAt: now
      };
    }

    data.count++;

    spamTracker.set(
      key,
      data
    );

    // 6 messages inside 10 seconds
    if (data.count >= 6) {
      await sock.sendMessage(
        jid,
        {
          text:
            "🛡️ *ANTI SPAM*\n\n" +
            "Please avoid sending messages too quickly."
        },
        {
          quoted: msg
        }
      );

      spamTracker.set(
        key,
        {
          count: 0,
          firstAt: now
        }
      );

      return true;
    }

    return false;

  } catch (error) {
    console.log(
      "Anti Spam Error:",
      error?.message || error
    );

    return false;
  }
}

// ==========================================
// CLEAN SPAM TRACKER
// ==========================================

setInterval(
  () => {
    const now = Date.now();

    for (
      const [key, data]
      of spamTracker.entries()
    ) {
      if (
        now - data.firstAt >
        60000
      ) {
        spamTracker.delete(key);
      }
    }
  },
  60000
);

module.exports = {
  registerGroupEvents,
  containsLink,
  handleAntiLink,
  handleAntiSpam
};