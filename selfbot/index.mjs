import { Client } from "discord.js-selfbot-v13";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf-8"));

const { token, source, log: logDest } = config;

if (!token || token === "YOUR_DISCORD_TOKEN_HERE") {
  console.error("[ERROR] Please set your Discord token in config.json");
  process.exit(1);
}
if (!source.guildId || !source.channelId) {
  console.error("[ERROR] Please set source guildId and channelId in config.json");
  process.exit(1);
}
if (!logDest.guildId || !logDest.channelId) {
  console.error("[ERROR] Please set log guildId and channelId in config.json");
  process.exit(1);
}

const client = new Client({ checkUpdate: false });

client.on("ready", () => {
  console.log(`[INFO] Logged in as ${client.user.tag}`);
  console.log(`[INFO] Monitoring guild: ${source.guildId}, channel: ${source.channelId}`);
  console.log(`[INFO] Forwarding to guild: ${logDest.guildId}, channel: ${logDest.channelId}`);
});

client.on("messageCreate", async (message) => {
  if (
    message.guild?.id !== source.guildId ||
    message.channel.id !== source.channelId
  ) {
    return;
  }

  const logChannel = client.guilds.cache
    .get(logDest.guildId)
    ?.channels.cache.get(logDest.channelId);

  if (!logChannel || !logChannel.isText()) {
    console.error("[ERROR] Log channel not found or not a text channel.");
    return;
  }

  const timestamp = new Date(message.createdTimestamp).toISOString();
  const author = `${message.author.username}#${message.author.discriminator} (${message.author.id})`;
  const content = message.content || "(no text content)";

  let logMessage = `\`[${timestamp}]\` **${author}**\n${content}`;

  if (message.attachments.size > 0) {
    const attachmentLinks = message.attachments.map((a) => a.url).join("\n");
    logMessage += `\nAttachments:\n${attachmentLinks}`;
  }

  if (message.embeds.length > 0) {
    logMessage += `\n*(${message.embeds.length} embed(s) not shown)*`;
  }

  if (logMessage.length > 2000) {
    logMessage = logMessage.slice(0, 1997) + "...";
  }

  try {
    await logChannel.send(logMessage);
  } catch (err) {
    console.error("[ERROR] Failed to send log message:", err.message);
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (
    newMessage.guild?.id !== source.guildId ||
    newMessage.channel.id !== source.channelId
  ) {
    return;
  }

  const logChannel = client.guilds.cache
    .get(logDest.guildId)
    ?.channels.cache.get(logDest.channelId);

  if (!logChannel || !logChannel.isText()) return;

  const timestamp = new Date(newMessage.editedTimestamp || newMessage.createdTimestamp).toISOString();
  const author = `${newMessage.author?.username}#${newMessage.author?.discriminator} (${newMessage.author?.id})`;
  const oldContent = oldMessage.content || "(unavailable)";
  const newContent = newMessage.content || "(no text content)";

  const logMessage = `\`[${timestamp}]\` ✏️ **${author}** edited a message\n**Before:** ${oldContent}\n**After:** ${newContent}`.slice(0, 2000);

  try {
    await logChannel.send(logMessage);
  } catch (err) {
    console.error("[ERROR] Failed to send edit log:", err.message);
  }
});

client.on("messageDelete", async (message) => {
  if (
    message.guild?.id !== source.guildId ||
    message.channel.id !== source.channelId
  ) {
    return;
  }

  const logChannel = client.guilds.cache
    .get(logDest.guildId)
    ?.channels.cache.get(logDest.channelId);

  if (!logChannel || !logChannel.isText()) return;

  const timestamp = new Date().toISOString();
  const author = message.author
    ? `${message.author.username}#${message.author.discriminator} (${message.author.id})`
    : "(unknown user)";
  const content = message.content || "(no text content)";

  const logMessage = `\`[${timestamp}]\` 🗑️ **${author}** deleted a message\n${content}`.slice(0, 2000);

  try {
    await logChannel.send(logMessage);
  } catch (err) {
    console.error("[ERROR] Failed to send delete log:", err.message);
  }
});

client.login(token);
