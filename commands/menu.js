module.exports = {
  name: "menu",
  aliases: ["help"],
  description: "Show all available commands.",
  reaction: "📋",

  async execute({ sock, msg, jid, settings }) {
    const prefix = settings?.prefix || ".";
    const botName =
      settings?.botName || "OSTHAR MINI BOT";

    const menu =
`╭━━━━━━━━━━━━━━━━━━╮
   *${botName}*
╰━━━━━━━━━━━━━━━━━━╯

🤖 *GENERAL*
━━━━━━━━━━━━━━━━━━
${prefix}menu
${prefix}help
${prefix}ping
${prefix}alive
${prefix}owner
${prefix}runtime
${prefix}speed
${prefix}jid

⬇️ *DOWNLOADS*
━━━━━━━━━━━━━━━━━━
${prefix}yts <query>
${prefix}song <name/url>
${prefix}video <name/url>
${prefix}tiktok <url>
${prefix}facebook <url>
${prefix}instagram <url>
${prefix}pinterest <url>
${prefix}twitter <url>
${prefix}snapchat <url>
${prefix}apk <app name>
${prefix}film <movie name>

🎨 *MEDIA*
━━━━━━━━━━━━━━━━━━
${prefix}sticker
${prefix}toimg
${prefix}mp3
${prefix}vv
${prefix}tts <text>
${prefix}compress
${prefix}resize <width>x<height>
${prefix}gif
${prefix}voice
${prefix}photo
${prefix}audio

🤖 *AI PRO*
━━━━━━━━━━━━━━━━━━
${prefix}ai <question>
${prefix}define <word>
${prefix}grammar <text>
${prefix}summarize <text>
${prefix}code <question>

🔎 *TOOLS*
━━━━━━━━━━━━━━━━━━
${prefix}weather <city>
${prefix}translate <lang> <text>
${prefix}google <query>
${prefix}image <query>
${prefix}wiki <query>
${prefix}calc <expression>
${prefix}shorturl <url>
${prefix}qr <text>
${prefix}ss <url>

🌐 *INTERNET TOOLS*
━━━━━━━━━━━━━━━━━━
${prefix}ip <ip>
${prefix}whois <domain>
${prefix}dns <domain> [type]
${prefix}time <city>
${prefix}currency <from> <to> <amount>
${prefix}unit <value> <from> <to>

👥 *GROUP PRO*
━━━━━━━━━━━━━━━━━━
${prefix}groupinfo
${prefix}admins
${prefix}tagall <message>
${prefix}hidetag <message>
${prefix}kick
${prefix}add <number>
${prefix}promote
${prefix}demote
${prefix}mute
${prefix}unmute
${prefix}lock
${prefix}unlock
${prefix}setsubject <name>
${prefix}setdesc <text>
${prefix}invite
${prefix}revoke

🛡️ *AUTOMATION*
━━━━━━━━━━━━━━━━━━
${prefix}antidelete on/off
${prefix}anticall on/off
${prefix}autostatus on/off
${prefix}autoreact on/off
${prefix}autoreply on/off
${prefix}autoread on/off
${prefix}autotyping on/off
${prefix}statusreact on/off
${prefix}statusreply on/off
${prefix}welcome on/off
${prefix}goodbye on/off
${prefix}antilink on/off
${prefix}antispam on/off
${prefix}settings

⚙️ *CUSTOMIZATION*
━━━━━━━━━━━━━━━━━━
${prefix}setprefix <prefix>
${prefix}setname <name>
${prefix}setwelcome <message>
${prefix}setgoodbye <message>
${prefix}setautoreply <message>

⚡ *PRO UTILITIES*
━━━━━━━━━━━━━━━━━━
${prefix}password <length>
${prefix}uuid
${prefix}base64 encode <text>
${prefix}base64 decode <text>
${prefix}hash <text>
${prefix}random <min> <max>
${prefix}dice
${prefix}coin
${prefix}quote
${prefix}fact
${prefix}joke
${prefix}truth
${prefix}dare

📊 *BOT SYSTEM*
━━━━━━━━━━━━━━━━━━
${prefix}botinfo
${prefix}version
${prefix}uptime
${prefix}memory
${prefix}cpu
${prefix}status
${prefix}commands
${prefix}cmdinfo <command>

📱 *WHATSAPP TOOLS*
━━━━━━━━━━━━━━━━━━
${prefix}getpp
${prefix}profile
${prefix}savecontact
${prefix}poll <question | options>
${prefix}readmore <text | hidden>

📩 *SUPPORT*
━━━━━━━━━━━━━━━━━━
${prefix}report <problem>
${prefix}feedback <message>

🔐 *OWNER*
━━━━━━━━━━━━━━━━━━
${prefix}block
${prefix}unblock
${prefix}restart
${prefix}logout

━━━━━━━━━━━━━━━━━━
*Mini Bot Created by Pamoda Nethsara*
━━━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(
      jid,
      { text: menu },
      { quoted: msg }
    );
  }
};