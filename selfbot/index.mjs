import { Client } from "discord.js-selfbot-v13";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "config.json");

function loadConfig() {
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function saveConfig(cfg) {
  writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

function isAllowed(userId) {
  const cfg = loadConfig();
  if (cfg.owner && cfg.owner.trim() === userId) return true;
  if (cfg.allowed && cfg.allowed.trim() !== "") {
    const ids = cfg.allowed.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.includes(userId)) return true;
  }
  return false;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function fmtShortDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const FIELDS = [
  { label: "source server", get: (c) => c.source?.guildId, set: (c, v) => { c.source = c.source || {}; c.source.guildId = v; } },
  { label: "source channel", get: (c) => c.source?.channelId, set: (c, v) => { c.source = c.source || {}; c.source.channelId = v; } },
  { label: "log server", get: (c) => c.log?.guildId, set: (c, v) => { c.log = c.log || {}; c.log.guildId = v; } },
  { label: "log channel", get: (c) => c.log?.channelId, set: (c, v) => { c.log = c.log || {}; c.log.channelId = v; } },
  { label: "owner", get: (c) => c.owner, set: (c, v) => { c.owner = v; } },
  { label: "allowed", get: (c) => c.allowed, set: (c, v) => { c.allowed = v; } },
];

const HELP_TEXT = [
  "cmdpass:abztx  shows ts",
  "config — show current config",
  "config edit <number> <value>  edit niga",
  "server <S> member(int) optional icl nga",
  "view <S> <query>",
  "message view <U> <C> <S>  last 1k msgs from user U in channel C of server S, 50 per page 20 pages max",
  "message view <U> <C> <S> <page>  same shi",
  "",
  "S = server id  C = channel id  U = user id",
].join("\n");

const client = new Client({ checkUpdate: false });

// In-memory content cache to recover old message content before edits/deletes
// Keyed by message id, stores the last known content string
const contentCache = new Map();
const CACHE_MAX = 3000;

function cacheSet(id, content) {
  if (!contentCache.has(id) && contentCache.size >= CACHE_MAX) {
    contentCache.delete(contentCache.keys().next().value);
  }
  contentCache.set(id, content ?? "");
}

async function getLogChannel() {
  const cfg = loadConfig();
  try {
    let guild = client.guilds.cache.get(cfg.log.guildId);
    if (!guild) guild = await client.guilds.fetch(cfg.log.guildId);
    if (!guild) return null;
    let channel = guild.channels.cache.get(cfg.log.channelId);
    if (!channel) channel = await guild.channels.fetch(cfg.log.channelId);
    return channel || null;
  } catch (e) {
    console.error("[error] getLogChannel failed:", e.message);
    return null;
  }
}

function resolveAuthor(message) {
  if (message.author) {
    return `${message.author.username}#${message.author.discriminator} (${message.author.id})`;
  }
  return "(not cached)";
}

function resolveContent(message) {
  if (message.content) return message.content;
  if (message.attachments?.size > 0) return null;
  if (message.stickers?.size > 0) return "(sticker)";
  if (message.embeds?.length > 0) return "(embed only)";
  return "(no content)";
}

// Format a message view line: #num, bold content, date prefix M/D only if full line fits under 95 chars
function fmtViewLine(num, ts, rawContent) {
  const date = fmtShortDate(ts);
  const numStr = `#${num} `;
  const bold = `**${rawContent}**`;
  const withDate = `${numStr}[${date}] ${bold}`;
  const withoutDate = `${numStr}${bold}`;
  return withDate.length <= 95 ? withDate : withoutDate;
}

async function logNewMessage(message) {
  const ch = await getLogChannel();
  if (!ch) return;

  const date = fmtDate(message.createdTimestamp);
  const author = resolveAuthor(message);
  const content = resolveContent(message);

  let out = `[${date}] ${author}`;
  if (content) out += `\n${content}`;
  if (message.attachments.size > 0) {
    out += "\natt:\n" + message.attachments.map((a) => a.url).join("\n");
  }
  if (message.embeds.length > 0 && !message.content) {
    out += `\n(${message.embeds.length} embed(s))`;
  }
  if (out.length > 2000) out = out.slice(0, 1997) + "...";
  try { await ch.send(out); } catch (e) { console.error("[error] log send failed:", e.message); }
}

client.on("ready", async () => {
  const cfg = loadConfig();
  console.log(`[INFO] logged in as ${client.user.tag}`);
  console.log(`[INFO] source: ${cfg.source.guildId} / ${cfg.source.channelId}`);
  console.log(`[INFO] log: ${cfg.log.guildId} / ${cfg.log.channelId}`);

  // Pre-fetch recent source channel messages into cache so edit logs
  // can show original content even for messages sent before bot started
  try {
    let srcGuild = client.guilds.cache.get(cfg.source.guildId);
    if (!srcGuild) srcGuild = await client.guilds.fetch(cfg.source.guildId);
    let srcChannel = srcGuild?.channels.cache.get(cfg.source.channelId);
    if (!srcChannel) srcChannel = await srcGuild?.channels.fetch(cfg.source.channelId);
    if (srcChannel) {
      const recent = await srcChannel.messages.fetch({ limit: 100 });
      recent.forEach((m) => cacheSet(m.id, m.content));
      console.log(`[INFO] pre-cached ${recent.size} source messages`);
    }
  } catch (e) {
    console.error("[warn] failed to pre-cache source messages:", e.message);
  }
});

client.on("messageCreate", async (message) => {
  const cfg = loadConfig();

  const isSource =
    message.guild?.id === cfg.source.guildId &&
    message.channel.id === cfg.source.channelId;

  if (isSource) {
    // Cache all source channel messages for edit tracking
    cacheSet(message.id, message.content);
    if (message.author.id !== client.user.id) {
      await logNewMessage(message);
    }
  }

  if (!isAllowed(message.author.id)) return;

  const raw = message.content.trim();

  if (raw === "cmdpass:abztx") {
    await message.channel.send(HELP_TEXT);
    return;
  }

  if (raw === "config") {
    const lines = FIELDS.map((f, i) => {
      const val = f.get(cfg) || "not set";
      return `${i + 1}. ${f.label}: ${val}`;
    });
    await message.channel.send(lines.join("\n"));
    return;
  }

  if (raw.startsWith("config edit ")) {
    const rest = raw.slice("config edit ".length).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) {
      await message.channel.send("rly zro? E1");
      return;
    }
    const numStr = rest.slice(0, spaceIdx);
    const value = rest.slice(spaceIdx + 1).trim();
    const num = parseInt(numStr);
    if (isNaN(num) || num < 1 || num > FIELDS.length || !value) {
      await message.channel.send("rly zro? E1");
      return;
    }
    const newCfg = loadConfig();
    FIELDS[num - 1].set(newCfg, value);
    saveConfig(newCfg);
    await message.channel.send(`${FIELDS[num - 1].label} set to ${value}`);
    return;
  }

  const memberMatch = raw.match(/^server (\S+) member(\d*)$/);
  if (memberMatch) {
    const guildId = memberMatch[1];
    const pageRaw = memberMatch[2];
    const page = pageRaw === "" ? 1 : parseInt(pageRaw);

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await message.channel.send("rly zro? E2");
      return;
    }

    let members;
    try {
      const fetched = await guild.members.fetch();
      members = [...fetched.values()].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
    } catch {
      await message.channel.send("rly zro? E3");
      return;
    }

    const perPage = 20;
    const maxPage = Math.ceil(members.length / perPage) || 1;

    if (!Number.isInteger(page) || page < 1 || page > maxPage) {
      await message.channel.send("really jro");
      return;
    }

    const slice = members.slice((page - 1) * perPage, page * perPage);
    const lines = [`${maxPage}`];
    for (const m of slice) {
      const role = m.roles.highest.name === "@everyone" ? "no role" : m.roles.highest.name;
      lines.push(`**${m.displayName}** - ${role}`);
    }
    await message.channel.send(lines.join("\n").slice(0, 2000));
    return;
  }

  const viewMatch = raw.match(/^view (\S+) (.+)$/);
  if (viewMatch) {
    const guildId = viewMatch[1];
    const query = viewMatch[2].trim();

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await message.channel.send("rly zro? E2");
      return;
    }

    let members;
    try {
      const fetched = await guild.members.fetch();
      members = [...fetched.values()];
    } catch {
      await message.channel.send("rly zro? E3");
      return;
    }

    const q = query.toLowerCase();
    const results = members
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.displayName.toLowerCase();
        const bName = b.displayName.toLowerCase();
        if (aName === q && bName !== q) return -1;
        if (bName === q && aName !== q) return 1;
        if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
        if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
        return aName.localeCompare(bName);
      })
      .slice(0, 10);

    if (results.length === 0) {
      await message.channel.send("no results found");
      return;
    }

    const lines = results.map((m) => {
      const role = m.roles.highest.name === "@everyone" ? "no role" : m.roles.highest.name;
      return `${m.displayName} (\`${m.user?.id ?? m.id}\`) - ${role}`;
    });
    await message.channel.send(lines.join("\n").slice(0, 2000));
    return;
  }

  const msgViewMatch = raw.match(/^message view (\S+) (\S+) (\S+)(?:\s+(\d+))?$/);
  if (msgViewMatch) {
    const userId = msgViewMatch[1];
    const channelId = msgViewMatch[2];
    const guildId = msgViewMatch[3];
    const pageRaw = msgViewMatch[4];
    const page = pageRaw ? parseInt(pageRaw) : 1;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await message.channel.send("rly zro? E2");
      return;
    }

    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
      try { channel = await guild.channels.fetch(channelId); } catch { channel = null; }
    }
    if (!channel || !channel.isText()) {
      await message.channel.send("rly zro? E4");
      return;
    }

    let userMessages = [];
    let lastId = null;

    try {
      while (userMessages.length < 1000) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts);
        if (batch.size === 0) break;
        batch.forEach((m) => {
          if (m.author.id === userId && userMessages.length < 1000) {
            userMessages.push(m);
          }
        });
        lastId = batch.last().id;
        if (batch.size < 100) break;
      }
    } catch {
      await message.channel.send("rly zro? E5");
      return;
    }

    userMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const perPage = 50;
    const totalPages = Math.ceil(userMessages.length / perPage) || 1;
    const maxPage = Math.min(totalPages, 20);

    if (!Number.isInteger(page) || page < 1 || page > maxPage) {
      await message.channel.send("really jro");
      return;
    }

    const slice = userMessages.slice((page - 1) * perPage, page * perPage);
    const lines = [`${maxPage}`];
    const offset = (page - 1) * perPage;
    for (let i = 0; i < slice.length; i++) {
      const m = slice[i];
      const globalNum = offset + i + 1;
      const rawTxt = (m.content || resolveContent(m) || "(no content)");
      lines.push(fmtViewLine(globalNum, m.createdTimestamp, rawTxt));
    }

    let out = lines.join("\n");
    if (out.length > 2000) out = out.slice(0, 1997) + "...";
    await message.channel.send(out);
    return;
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  // Pull from our own cache first — Discord often doesn't have oldMessage.content
  const cachedOld = contentCache.get(newMessage.id);
  const oldContent = (oldMessage.content || cachedOld) ?? "";
  const newContent = newMessage.content ?? "";

  // Update cache with new content
  if (newMessage.guild) cacheSet(newMessage.id, newMessage.content);

  if (oldContent === newContent) return;

  const cfg = loadConfig();
  if (
    newMessage.guild?.id !== cfg.source.guildId ||
    newMessage.channel.id !== cfg.source.channelId
  ) return;

  const ch = await getLogChannel();
  if (!ch) return;

  const date = fmtDate(newMessage.editedTimestamp || newMessage.createdTimestamp);
  const author = resolveAuthor(newMessage);
  const displayOld = oldContent || "(unavailable)";
  const displayNew = newContent || "(cleared)";

  const out = `[${date}] ${author} edit\nold ahh: ${displayOld}\nnew: ${displayNew}`.slice(0, 2000);
  try { await ch.send(out); } catch (e) { console.error("[error] edit log failed:", e.message); }
});

client.on("messageDelete", async (message) => {
  const cfg = loadConfig();
  if (
    message.guild?.id !== cfg.source.guildId ||
    message.channel.id !== cfg.source.channelId
  ) return;

  // Try our own cache before Discord's partial
  const cachedContent = contentCache.get(message.id);
  contentCache.delete(message.id);

  const ch = await getLogChannel();
  if (!ch) return;

  const date = fmtDate(message.createdTimestamp || Date.now());
  const author = resolveAuthor(message);
  const content = message.content || cachedContent || (message.attachments?.size > 0 ? "(attachment only)" : "(not cached)");

  let out = `[${date}] ${author} deleted ts\n${content}`;
  if (message.attachments?.size > 0) {
    out += "\natt:\n" + message.attachments.map((a) => a.url).join("\n");
  }
  out = out.slice(0, 2000);
  try { await ch.send(out); } catch (e) { console.error("[error] delete log failed:", e.message); }
});

const cfg = loadConfig();
if (!cfg.token || cfg.token === "YOUR_DISCORD_TOKEN_HERE") {
  console.error("[ERROR] set your token in config.json");
  process.exit(1);
}

client.login(cfg.token);
