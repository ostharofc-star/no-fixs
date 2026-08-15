const {
  getUserSettings
} = require("../database/settings");

const {
  isGroupJid,
  isStatusJid
} = require("./helpers");

// ==========================================
// MESSAGE CACHE - ANTI DELETE
// ==========================================

const messageCache = new Map();

const MAX_CACHE = 1000;

function cacheMessage(msg) {
  try {
    if (!msg?.key?.id) return;

    messageCache.set(
      msg.key.id,
      {
        msg,
        savedAt: Date.now()
      }
    );

    // Prevent unlimited memory growth
    if (messageCache.size > MAX_CACHE) {
      const firstKey =
        messageCache.keys().next().value;

      if (firstKey) {
        messageCache.delete(firstKey);
      }
    }
  } catch (error) {
    console.log(
      "Message Cache Error:",
      error?.message || error
    );
  }
}

function getCachedMessage(messageId) {
  const item =
    messageCache.get(messageId);

  return item?.msg || null;
}

function deleteCachedMessage(messageId) {
  if (!messageId) return;

  messageCache.delete(messageId);
}

// ==========================================
// AUTO READ
// ==========================================

async function handleAutoRead(
  sock,
  msg,
  settings
) {
  try {
    if (!settings?.autoRead) return;

    if (!msg?.key) return;

    await sock.readMessages([
      msg.key
    ]);
  } catch (error) {
    console.log(
      "Auto Read Error:",
      error?.message || error
    );
  }
}

// ==========================================
// AUTO TYPING
// ==========================================

async function startTyping(
  sock,
  jid,
  settings
) {
  try {
    if (!settings?.autoTyping) return;

    await sock.sendPresenceUpdate(
      "composing",
      jid
    );
  } catch {}
}

async function stopTyping(
  sock,
  jid,
  settings
) {
  try {
    if (!settings?.autoTyping) return;

    await sock.sendPresenceUpdate(
      "paused",
      jid
    );
  } catch {}
}

// ==========================================
// AUTO REPLY
// ==========================================

async function handleAutoReply({
  sock,
  msg,
  jid,
  text,
  settings,
  isCommand = false
}) {
  try {
    if (!settings?.autoReply) return;

    if (isCommand) return;

    if (msg?.key?.fromMe) return;

    if (isGroupJid(jid)) return;

    if (isStatusJid(jid)) return;

    if (!text) return;

    await sock.sendMessage(
      jid,
      {
        text:
          settings.autoReplyMessage ||
          "Thank you for your message. OSTHAR MINI BOT is currently active."
      },
      {
        quoted: msg
      }
    );

  } catch (error) {
    console.log(
      "Auto Reply Error:",
      error?.message || error
    );
  }
}

// ==========================================
// STATUS SEEN / REACTION / REPLY
// ==========================================

async function handleStatusMessage({
  sock,
  msg,
  settings
}) {
  try {
    const jid =
      msg?.key?.remoteJid;

    if (
      jid !== "status@broadcast"
    ) {
      return;
    }

    // Auto Status Seen
    if (settings?.autoStatusSeen) {
      try {
        await sock.readMessages([
          msg.key
        ]);
      } catch {}
    }

    // Status Reaction
    if (
      settings?.statusReact &&
      !msg.key.fromMe
    ) {
      try {
        await sock.sendMessage(
          jid,
          {
            react: {
              text: "💚",
              key: msg.key
            }
          }
        );
      } catch {}
    }

    // Status Reply
    if (
      settings?.statusReply &&
      !msg.key.fromMe
    ) {
      const participant =
        msg.key.participant;

      if (participant) {
        try {
          await sock.sendMessage(
            participant,
            {
              text:
                "Your status has been viewed by OSTHAR MINI BOT."
            }
          );
        } catch {}
      }
    }

  } catch (error) {
    console.log(
      "Status Automation Error:",
      error?.message || error
    );
  }
}

// ==========================================
// ANTI CALL
// ==========================================

function registerAntiCall(
  sock,
  phone
) {
  sock.ev.on(
    "call",
    async (calls) => {
      try {
        const settings =
          await getUserSettings(phone);

        if (!settings?.antiCall) {
          return;
        }

        for (const call of calls) {
          if (
            call.status !== "offer"
          ) {
            continue;
          }

          try {
            if (
              typeof sock.rejectCall ===
              "function"
            ) {
              await sock.rejectCall(
                call.id,
                call.from
              );
            }
          } catch (error) {
            console.log(
              "Reject Call Error:",
              error?.message || error
            );
          }

          try {
            await sock.sendMessage(
              call.from,
              {
                text:
                  "📵 *CALL REJECTED*\n\n" +
                  "This WhatsApp account does not accept incoming calls while Anti Call is enabled.\n\n" +
                  "*Mini Bot Created by Pamoda Nethsara*"
              }
            );
          } catch {}
        }

      } catch (error) {
        console.log(
          "Anti Call Error:",
          error?.message || error
        );
      }
    }
  );
}

// ==========================================
// CLEAN OLD CACHE
// ==========================================

function cleanMessageCache(
  maxAgeHours = 24
) {
  const maxAge =
    maxAgeHours *
    60 *
    60 *
    1000;

  const now = Date.now();

  for (
    const [id, item]
    of messageCache.entries()
  ) {
    if (
      now - item.savedAt >
      maxAge
    ) {
      messageCache.delete(id);
    }
  }
}

// Auto cleanup every 30 minutes
setInterval(
  () => {
    cleanMessageCache(24);
  },
  30 * 60 * 1000
);

module.exports = {
  cacheMessage,
  getCachedMessage,
  deleteCachedMessage,

  handleAutoRead,

  startTyping,
  stopTyping,

  handleAutoReply,
  handleStatusMessage,

  registerAntiCall,

  cleanMessageCache
};