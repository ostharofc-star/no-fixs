// ======================================================
// OSTHAR MINI BOT - LEGAL FILM DOWNLOADER
// Public-domain / open-license content only
// ======================================================

function cleanText(value = "") {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

// ======================================================
// FETCH JSON
// ======================================================

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OSTHAR-MINI-BOT/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.json();
}

// ======================================================
// LICENSE CHECK
// ======================================================

function isLegalOpenItem(metadata = {}) {
  const data = [
    metadata.licenseurl,
    metadata.rights,
    metadata.subject,
    metadata.description
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();

  const allowed = [
    "public domain",
    "creativecommons.org/publicdomain",
    "creativecommons.org/licenses/by/",
    "creativecommons.org/licenses/by-sa/",
    "cc0"
  ];

  return allowed.some(
    item => data.includes(item)
  );
}

// ======================================================
// SEARCH
// ======================================================

async function searchMovie(query) {
  const safeQuery =
    query.replace(/"/g, "");

  const searchQuery =
    `title:("${safeQuery}") AND mediatype:movies`;

  const url =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(searchQuery)}` +
    "&fl[]=identifier,title,year" +
    "&rows=20" +
    "&page=1" +
    "&output=json";

  const data =
    await fetchJson(url);

  const results =
    data?.response?.docs || [];

  for (const result of results) {
    if (!result.identifier) {
      continue;
    }

    try {
      const item =
        await fetchJson(
          `https://archive.org/metadata/${encodeURIComponent(
            result.identifier
          )}`
        );

      if (
        !isLegalOpenItem(
          item?.metadata || {}
        )
      ) {
        continue;
      }

      return {
        result,
        item
      };

    } catch (error) {
      console.error(
        "FILM ITEM ERROR:",
        error.message
      );
    }
  }

  throw new Error(
    "No legal public-domain/open-license copy was found."
  );
}

// ======================================================
// SIZE
// ======================================================

function getSize(file) {
  const size =
    Number(file?.size || 0);

  return Number.isFinite(size)
    ? size
    : 0;
}

function formatSize(bytes) {
  if (!bytes) {
    return "Unknown";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB"
  ];

  let value = bytes;
  let unit = 0;

  while (
    value >= 1024 &&
    unit <
      units.length - 1
  ) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(
    unit >= 2 ? 2 : 0
  )} ${units[unit]}`;
}

// ======================================================
// QUALITY
// ======================================================

function detectQuality(file = {}) {
  const name =
    String(file.name || "")
      .toLowerCase();

  const height =
    Number(
      file.height ||
      file?.video_height ||
      0
    );

  if (height >= 2160) {
    return "2160p / 4K";
  }

  if (height >= 1440) {
    return "1440p";
  }

  if (height >= 1080) {
    return "1080p Full HD";
  }

  if (height >= 720) {
    return "720p HD";
  }

  if (height >= 480) {
    return "480p";
  }

  if (height >= 360) {
    return "360p";
  }

  const qualities = [
    ["2160p", "2160p / 4K"],
    ["4k", "2160p / 4K"],
    ["1440p", "1440p"],
    ["1080p", "1080p Full HD"],
    ["720p", "720p HD"],
    ["480p", "480p"],
    ["360p", "360p"]
  ];

  for (const [
    search,
    label
  ] of qualities) {
    if (name.includes(search)) {
      return label;
    }
  }

  return "Unknown";
}

// ======================================================
// VIDEO SCORE
// ======================================================

function qualityScore(file) {
  const quality =
    detectQuality(file);

  if (
    quality.includes("2160")
  ) {
    return 2160;
  }

  if (
    quality.includes("1440")
  ) {
    return 1440;
  }

  if (
    quality.includes("1080")
  ) {
    return 1080;
  }

  if (
    quality.includes("720")
  ) {
    return 720;
  }

  if (
    quality.includes("480")
  ) {
    return 480;
  }

  if (
    quality.includes("360")
  ) {
    return 360;
  }

  return 0;
}

// ======================================================
// FIND BEST VIDEO
// ======================================================

function findBestVideo(files = []) {
  const videos =
    files.filter(file => {
      const name =
        String(
          file?.name || ""
        ).toLowerCase();

      if (
        !/\.(mp4|m4v|webm|mkv)$/i.test(
          name
        )
      ) {
        return false;
      }

      const size =
        getSize(file);

      // Ignore tiny previews
      if (
        size &&
        size <
          10 * 1024 * 1024
      ) {
        return false;
      }

      return true;
    });

  if (!videos.length) {
    return null;
  }

  // Prefer MP4
  const mp4 =
    videos.filter(file =>
      /\.mp4$/i.test(
        file.name
      )
    );

  const candidates =
    mp4.length
      ? mp4
      : videos;

  candidates.sort(
    (a, b) => {
      const qa =
        qualityScore(a);

      const qb =
        qualityScore(b);

      if (qa !== qb) {
        return qb - qa;
      }

      return (
        getSize(b) -
        getSize(a)
      );
    }
  );

  return candidates[0];
}

// ======================================================
// SUBTITLE
// ======================================================

function findSinhalaSubtitle(
  files = []
) {
  const subtitles =
    files.filter(file =>
      /\.(srt|vtt)$/i.test(
        String(file?.name || "")
      )
    );

  const patterns = [
    "sinhala",
    "sinhalese",
    ".si.",
    "_si.",
    "-si.",
    ".sin.",
    "_sin.",
    "-sin."
  ];

  return (
    subtitles.find(file => {
      const name =
        String(file.name)
          .toLowerCase();

      return patterns.some(
        word =>
          name.includes(word)
      );
    }) || null
  );
}

// ======================================================
// URL
// ======================================================

function getArchiveUrl(
  identifier,
  filename
) {
  return (
    "https://archive.org/download/" +
    `${encodeURIComponent(identifier)}/` +
    `${encodeURIComponent(filename)}`
  );
}

// ======================================================
// MESSAGE TEXT
// ======================================================

function getMessageText(message) {
  if (!message) {
    return "";
  }

  return (
    message.conversation ||
    message
      .extendedTextMessage
      ?.text ||
    message
      .imageMessage
      ?.caption ||
    message
      .videoMessage
      ?.caption ||
    ""
  ).trim();
}

// ======================================================
// WAIT FOR "1" REPLY
// ======================================================

function waitForConfirmation({
  sock,
  jid,
  requester,
  messageId,
  timeout = 120000
}) {
  return new Promise(resolve => {
    let finished = false;

    const cleanup = () => {
      if (finished) {
        return;
      }

      finished = true;

      try {
        if (
          typeof sock.ev.off ===
          "function"
        ) {
          sock.ev.off(
            "messages.upsert",
            listener
          );
        } else if (
          typeof sock.ev
            .removeListener ===
          "function"
        ) {
          sock.ev.removeListener(
            "messages.upsert",
            listener
          );
        }
      } catch {}
    };

    const timer =
      setTimeout(() => {
        cleanup();

        resolve(false);
      }, timeout);

    const listener =
      async update => {
        try {
          const messages =
            update?.messages || [];

          for (const reply of messages) {
            if (
              reply.key.remoteJid !==
              jid
            ) {
              continue;
            }

            const replySender =
              reply.key.participant ||
              reply.key.remoteJid;

            if (
              requester &&
              replySender !== requester
            ) {
              continue;
            }

            const context =
              reply.message
                ?.extendedTextMessage
                ?.contextInfo ||
              reply.message
                ?.imageMessage
                ?.contextInfo ||
              reply.message
                ?.videoMessage
                ?.contextInfo;

            if (
              context?.stanzaId !==
              messageId
            ) {
              continue;
            }

            const text =
              getMessageText(
                reply.message
              );

            if (text === "1") {
              clearTimeout(timer);

              cleanup();

              resolve(true);

              return;
            }
          }
        } catch (error) {
          console.error(
            "FILM CONFIRM ERROR:",
            error
          );
        }
      };

    sock.ev.on(
      "messages.upsert",
      listener
    );
  });
}

// ======================================================
// COMMAND
// ======================================================

module.exports = {
  name: "film",

  aliases: [
    "film",
    "movie"
  ],

  description:
    "Download legal public-domain/open-license films.",

  reaction: "🎬",

  async execute({
    sock,
    msg,
    jid,
    query,
    settings
  }) {
    const prefix =
      settings?.prefix || ".";

    if (!query) {
      return sock.sendMessage(
        jid,
        {
          text:
            "🎬 *FILM DOWNLOADER*\n\n" +
            `Usage: ${prefix}film <movie name>\n\n` +
            `Example:\n${prefix}film Night of the Living Dead\n\n` +
            "Public-domain/open-license films only."
        },
        {
          quoted: msg
        }
      );
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            "🔎 Searching for the film..."
        },
        {
          quoted: msg
        }
      );

      const {
        result,
        item
      } =
        await searchMovie(
          query
        );

      const metadata =
        item.metadata || {};

      const identifier =
        metadata.identifier ||
        result.identifier;

      const title =
        cleanText(
          metadata.title ||
          result.title ||
          query
        );

      const year =
        cleanText(
          metadata.year ||
          metadata.date ||
          result.year ||
          "Unknown"
        );

      const creator =
        cleanText(
          metadata.creator ||
          "Unknown"
        );

      const files =
        Array.isArray(
          item.files
        )
          ? item.files
          : [];

      const video =
        findBestVideo(files);

      if (!video) {
        throw new Error(
          "No downloadable video file was found."
        );
      }

      const subtitle =
        findSinhalaSubtitle(
          files
        );

      const quality =
        detectQuality(video);

      const size =
        formatSize(
          getSize(video)
        );

      const extension =
        String(
          video.name
            .split(".")
            .pop() ||
          "Unknown"
        ).toUpperCase();

      const details =
        await sock.sendMessage(
          jid,
          {
            text:
              "╭━━━〔 🎬 *FILM FOUND* 〕━━━╮\n\n" +

              `🎞️ *Name:* ${title}\n` +
              `📅 *Year:* ${year}\n` +
              `🎥 *Quality:* ${quality}\n` +
              `📦 *Size:* ${size}\n` +
              `📁 *Format:* ${extension}\n` +
              `🎬 *Creator:* ${creator}\n` +
              `🇱🇰 *Sinhala Subtitle:* ${
                subtitle
                  ? "Available ✅"
                  : "Not Available ❌"
              }\n\n` +

              "━━━━━━━━━━━━━━━━━━\n\n" +

              "⬇️ *DOWNLOAD FILM*\n\n" +
              "Reply to this message with:\n\n" +
              "*1*\n\n" +

              "⏱️ This request expires in 2 minutes.\n\n" +
              "╰━━━━━━━━━━━━━━━━━━━━╯"
          },
          {
            quoted: msg
          }
        );

      const requester =
        msg.key.participant ||
        msg.key.remoteJid;

      const confirmed =
        await waitForConfirmation({
          sock,
          jid,
          requester,
          messageId:
            details.key.id,
          timeout:
            120000
        });

      if (!confirmed) {
        return sock.sendMessage(
          jid,
          {
            text:
              "⌛ *DOWNLOAD EXPIRED*\n\n" +
              "The film download request expired.\n\n" +
              `Search again using:\n${prefix}film ${query}`
          },
          {
            quoted: msg
          }
        );
      }

      await sock.sendMessage(
        jid,
        {
          text:
            "⬇️ *DOWNLOADING FILM*\n\n" +
            `${title}\n` +
            `${quality} • ${size}\n\n` +
            "Please wait while the film is being prepared..."
        }
      );

      const filmUrl =
        getArchiveUrl(
          identifier,
          video.name
        );

      // ==================================================
      // SEND FILM
      // ==================================================

      try {
        if (
          /\.mp4$/i.test(
            video.name
          )
        ) {
          await sock.sendMessage(
            jid,
            {
              video: {
                url: filmUrl
              },

              mimetype:
                "video/mp4",

              caption:
                "🎬 *FILM DOWNLOAD*\n\n" +
                `${title}\n` +
                `Quality: ${quality}\n` +
                `Size: ${size}\n\n` +
                "*Mini Bot Created by Pamoda Nethsara*"
            }
          );

        } else {
          await sock.sendMessage(
            jid,
            {
              document: {
                url: filmUrl
              },

              fileName:
                video.name,

              mimetype:
                "application/octet-stream",

              caption:
                `🎬 ${title}`
            }
          );
        }

      } catch (sendError) {
        console.error(
          "FILM SEND ERROR:",
          sendError
        );

        // Fallback direct download link
        await sock.sendMessage(
          jid,
          {
            text:
              "⚠️ *FILM FILE TOO LARGE OR UPLOAD FAILED*\n\n" +
              "You can download the film directly using this legal source:\n\n" +
              `${filmUrl}`
          }
        );
      }

      // ==================================================
      // SEND SINHALA SUBTITLE
      // ==================================================

      if (subtitle) {
        const subtitleUrl =
          getArchiveUrl(
            identifier,
            subtitle.name
          );

        try {
          await sock.sendMessage(
            jid,
            {
              document: {
                url:
                  subtitleUrl
              },

              fileName:
                subtitle.name,

              mimetype:
                /\.vtt$/i.test(
                  subtitle.name
                )
                  ? "text/vtt"
                  : "application/x-subrip",

              caption:
                "🇱🇰 *SINHALA SUBTITLE*\n\n" +
                title
            }
          );

        } catch (error) {
          console.error(
            "SUBTITLE ERROR:",
            error
          );
        }
      }

    } catch (error) {
      console.error(
        "FILM ERROR:",
        error
      );

      return sock.sendMessage(
        jid,
        {
          text:
            "❌ *FILM SEARCH FAILED*\n\n" +
            `${
              error?.message ||
              "Unknown error"
            }\n\n` +
            "Only public-domain/open-license films are supported."
        },
        {
          quoted: msg
        }
      );
    }
  }
};