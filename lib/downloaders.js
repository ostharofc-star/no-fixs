const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const ytSearch = require("yt-search");
const ffmpegPath = require("ffmpeg-static");

// ======================================================
// DIRECTORIES
// ======================================================

const BIN_DIR = path.join(
  __dirname,
  "..",
  "bin"
);

const TEMP_DIR = path.join(
  __dirname,
  "..",
  "temp"
);

fs.mkdirSync(
  BIN_DIR,
  {
    recursive: true
  }
);

fs.mkdirSync(
  TEMP_DIR,
  {
    recursive: true
  }
);

// ======================================================
// YT-DLP PATH
// ======================================================

function getYtDlpPath() {
  if (process.platform === "win32") {
    return path.join(
      BIN_DIR,
      "yt-dlp.exe"
    );
  }

  return path.join(
    BIN_DIR,
    "yt-dlp"
  );
}

// ======================================================
// YT-DLP DOWNLOAD URL
// ======================================================

function getYtDlpDownloadUrl() {
  if (process.platform === "win32") {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  }

  if (
    process.platform === "linux" &&
    process.arch === "x64"
  ) {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
  }

  return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
}

// ======================================================
// BINARY DOWNLOAD
// ======================================================

function downloadBinary(
  url,
  destination
) {
  return new Promise(
    (resolve, reject) => {
      const request =
        https.get(
          url,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0"
            }
          },
          (response) => {
            if (
              response.statusCode >= 300 &&
              response.statusCode < 400 &&
              response.headers.location
            ) {
              response.resume();

              return downloadBinary(
                response.headers.location,
                destination
              )
                .then(resolve)
                .catch(reject);
            }

            if (
              response.statusCode !== 200
            ) {
              response.resume();

              return reject(
                new Error(
                  `yt-dlp binary download failed: HTTP ${response.statusCode}`
                )
              );
            }

            const file =
              fs.createWriteStream(
                destination
              );

            response.pipe(file);

            file.on(
              "finish",
              () => {
                file.close(
                  () =>
                    resolve(destination)
                );
              }
            );

            file.on(
              "error",
              reject
            );
          }
        );

      request.on(
        "error",
        reject
      );
    }
  );
}

// ======================================================
// ENSURE YT-DLP
// ======================================================

async function ensureYtDlp() {
  const binary =
    getYtDlpPath();

  if (
    fs.existsSync(binary)
  ) {
    return binary;
  }

  console.log(
    "[YT-DLP] Downloading binary..."
  );

  await downloadBinary(
    getYtDlpDownloadUrl(),
    binary
  );

  if (
    process.platform !== "win32"
  ) {
    fs.chmodSync(
      binary,
      0o755
    );
  }

  console.log(
    "[YT-DLP] Ready."
  );

  return binary;
}

// ======================================================
// PROCESS RUNNER
// ======================================================

function runProcess(
  executable,
  args
) {
  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          executable,
          args,
          {
            windowsHide: true
          }
        );

      let stdout = "";
      let stderr = "";

      child.stdout?.on(
        "data",
        (data) => {
          stdout +=
            data.toString();
        }
      );

      child.stderr?.on(
        "data",
        (data) => {
          stderr +=
            data.toString();
        }
      );

      child.on(
        "error",
        reject
      );

      child.on(
        "close",
        (code) => {
          if (
            code === 0
          ) {
            return resolve({
              stdout,
              stderr
            });
          }

          reject(
            new Error(
              stderr.trim() ||
              stdout.trim() ||
              `yt-dlp exited with code ${code}`
            )
          );
        }
      );
    }
  );
}

// ======================================================
// TEMP
// ======================================================

function createTempBase(
  type = "media"
) {
  return path.join(
    TEMP_DIR,
    `${type}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );
}

function findDownloadedFiles(
  basePath
) {
  const directory =
    path.dirname(basePath);

  const base =
    path.basename(basePath);

  return fs
    .readdirSync(directory)
    .filter(
      (file) =>
        file.startsWith(base)
    )
    .map(
      (file) =>
        path.join(
          directory,
          file
        )
    )
    .filter(
      (file) => {
        try {
          return (
            fs.statSync(file).size >
            0
          );
        } catch {
          return false;
        }
      }
    );
}

// ======================================================
// MIME TYPE
// ======================================================

function getMimeType(file) {
  const ext =
    path
      .extname(file)
      .toLowerCase();

  if (
    ext === ".jpg" ||
    ext === ".jpeg"
  ) {
    return "image/jpeg";
  }

  if (
    ext === ".png"
  ) {
    return "image/png";
  }

  if (
    ext === ".webp"
  ) {
    return "image/webp";
  }

  if (
    ext === ".mp3"
  ) {
    return "audio/mpeg";
  }

  if (
    ext === ".m4a"
  ) {
    return "audio/mp4";
  }

  if (
    ext === ".webm"
  ) {
    return "video/webm";
  }

  return "video/mp4";
}

// ======================================================
// FAST SETTINGS
// ======================================================

function fastArgs() {
  return [
    "--no-playlist",

    "--no-warnings",

    "--retries",
    "2",

    "--fragment-retries",
    "2",

    "--extractor-retries",
    "1",

    "--socket-timeout",
    "15",

    "--concurrent-fragments",
    "4",

    "--force-ipv4",

    "--ffmpeg-location",
    ffmpegPath
  ];
}

// ======================================================
// YOUTUBE SETTINGS
// ======================================================

function youtubeArgs() {
  return [
    ...fastArgs(),

    "--js-runtimes",
    "node",

    "--remote-components",
    "ejs:npm",

    "--extractor-args",
    "youtube:player-client=default,-web_safari"
  ];
}

// ======================================================
// YOUTUBE URL CHECK
// ======================================================

function isYouTubeUrl(
  input = ""
) {
  return /youtube\.com|youtu\.be/i
    .test(
      String(input)
    );
}

// ======================================================
// YOUTUBE SEARCH
// ======================================================

async function searchYouTube(
  query,
  limit = 5
) {
  const result =
    await ytSearch(query);

  return result.videos
    .slice(
      0,
      limit
    )
    .map(
      (video) => ({
        id:
          video.videoId,

        title:
          video.title,

        author:
          video.author?.name ||
          "Unknown",

        duration:
          video.timestamp ||
          "Unknown",

        views:
          video.views ||
          0,

        url:
          video.url,

        thumbnail:
          video.thumbnail
      })
    );
}

// ======================================================
// RESOLVE YOUTUBE
// ======================================================

async function resolveYouTubeInput(
  input
) {
  if (
    isYouTubeUrl(input)
  ) {
    return input;
  }

  const results =
    await searchYouTube(
      input,
      1
    );

  if (
    !results.length
  ) {
    throw new Error(
      "No YouTube results found."
    );
  }

  return results[0].url;
}

// ======================================================
// YOUTUBE INFO
// ======================================================

async function getYouTubeInfo(
  input
) {
  const binary =
    await ensureYtDlp();

  const url =
    await resolveYouTubeInput(
      input
    );

  const {
    stdout
  } =
    await runProcess(
      binary,
      [
        ...youtubeArgs(),

        "--skip-download",

        "--dump-single-json",

        url
      ]
    );

  const info =
    JSON.parse(stdout);

  return {
    url,

    title:
      info.title ||
      "YouTube Media",

    author:
      info.uploader ||
      info.channel ||
      "Unknown",

    thumbnail:
      info.thumbnail ||
      null
  };
}

// ======================================================
// YOUTUBE AUDIO
// ======================================================

async function downloadYouTubeAudio(
  input
) {
  const binary =
    await ensureYtDlp();

  const url =
    await resolveYouTubeInput(
      input
    );

  const base =
    createTempBase(
      "song"
    );

  console.log(
    `[YT-DLP] Audio: ${url}`
  );

  await runProcess(
    binary,
    [
      ...youtubeArgs(),

      "-f",
      "bestaudio[ext=m4a]/bestaudio/best",

      "-x",

      "--audio-format",
      "mp3",

      "--audio-quality",
      "5",

      "-o",
      `${base}.%(ext)s`,

      url
    ]
  );

  const files =
    findDownloadedFiles(
      base
    );

  if (
    !files.length
  ) {
    throw new Error(
      "Audio file was not created."
    );
  }

  return {
    path:
      files[0],

    title:
      "OSTHAR Audio",

    mimetype:
      "audio/mpeg"
  };
}

// ======================================================
// YOUTUBE VIDEO
// ======================================================

async function downloadYouTubeVideo(
  input
) {
  const binary =
    await ensureYtDlp();

  const url =
    await resolveYouTubeInput(
      input
    );

  const formats = [
    "b[height<=720][ext=mp4]",
    "best[height<=720]",
    "bv*[height<=720]+ba/b[height<=720]"
  ];

  let lastError =
    null;

  for (
    let i = 0;
    i < formats.length;
    i++
  ) {
    const base =
      createTempBase(
        `youtube-video-${i}`
      );

    try {
      console.log(
        `[YT-DLP] YouTube video attempt ${i + 1}`
      );

      await runProcess(
        binary,
        [
          ...youtubeArgs(),

          "-f",
          formats[i],

          "--merge-output-format",
          "mp4",

          "-o",
          `${base}.%(ext)s`,

          url
        ]
      );

      const files =
        findDownloadedFiles(
          base
        );

      if (
        files.length
      ) {
        return {
          path:
            files[0],

          title:
            "YouTube Video",

          author:
            "YouTube",

          mimetype:
            getMimeType(
              files[0]
            )
        };
      }

    } catch (error) {
      lastError =
        error;

      console.log(
        `[YT-DLP] YouTube attempt ${i + 1} failed.`
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "YouTube video download failed."
    )
  );
}

// ======================================================
// SOCIAL DOWNLOADER
// ======================================================

async function downloadSocialMedia(
  url,
  platform
) {
  if (
    !/^https?:\/\//i.test(
      String(url || "")
    )
  ) {
    throw new Error(
      "Please provide a valid URL."
    );
  }

  const binary =
    await ensureYtDlp();

  const formats = [
    "b[height<=720]/best[height<=720]/best",
    "bv*[height<=720]+ba/b[height<=720]"
  ];

  let lastError =
    null;

  for (
    let i = 0;
    i < formats.length;
    i++
  ) {
    const base =
      createTempBase(
        `${platform}-${i}`
      );

    try {
      console.log(
        `[YT-DLP] ${platform} attempt ${i + 1}`
      );

      await runProcess(
        binary,
        [
          ...fastArgs(),

          "-f",
          formats[i],

          "--merge-output-format",
          "mp4",

          "-o",
          `${base}.%(ext)s`,

          url
        ]
      );

      const files =
        findDownloadedFiles(
          base
        );

      if (
        files.length
      ) {
        return {
          path:
            files[0],

          title:
            `${platform} Media`,

          mimetype:
            getMimeType(
              files[0]
            )
        };
      }

    } catch (error) {
      lastError =
        error;

      console.log(
        `[YT-DLP] ${platform} attempt ${i + 1} failed.`
      );
    }
  }

  throw (
    lastError ||
    new Error(
      `${platform} download failed.`
    )
  );
}

// ======================================================
// SOCIAL FUNCTIONS
// ======================================================

async function tiktokDownload(
  url
) {
  return downloadSocialMedia(
    url,
    "TikTok"
  );
}

async function facebookDownload(
  url
) {
  return downloadSocialMedia(
    url,
    "Facebook"
  );
}

async function instagramDownload(
  url
) {
  return downloadSocialMedia(
    url,
    "Instagram"
  );
}

async function pinterestDownload(
  url
) {
  return downloadSocialMedia(
    url,
    "Pinterest"
  );
}

async function twitterDownload(
  url
) {
  return downloadSocialMedia(
    url,
    "Twitter"
  );
}

async function snapchatDownload(
  url
) {
  return downloadSocialMedia(
    url,
    "Snapchat"
  );
}

// ======================================================
// APK
// ======================================================

async function apkSearch(
  query
) {
  if (
    !process.env.APK_API
  ) {
    throw new Error(
      "APK API is not configured."
    );
  }

  const separator =
    process.env.APK_API.includes(
      "?"
    )
      ? "&"
      : "?";

  const url =
    `${process.env.APK_API}${separator}` +
    `q=${encodeURIComponent(query)}`;

  const response =
    await fetch(url);

  if (
    !response.ok
  ) {
    throw new Error(
      `APK API failed: HTTP ${response.status}`
    );
  }

  return response.json();
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  searchYouTube,

  resolveYouTubeInput,

  getYouTubeInfo,

  downloadYouTubeAudio,

  downloadYouTubeVideo,

  downloadSocialMedia,

  tiktokDownload,

  facebookDownload,

  instagramDownload,

  pinterestDownload,

  twitterDownload,

  snapchatDownload,

  apkSearch
};