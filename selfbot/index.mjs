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

function isOwner(userId) {
  const cfg = loadConfig();
  return !!cfg.owner && cfg.owner.trim() === userId;
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
  { label: "source server",  get: (c) => c.source?.guildId,   set: (c, v) => { c.source = c.source || {}; c.source.guildId = v; } },
  { label: "source channel", get: (c) => c.source?.channelId, set: (c, v) => { c.source = c.source || {}; c.source.channelId = v; } },
  { label: "log server",     get: (c) => c.log?.guildId,      set: (c, v) => { c.log = c.log || {}; c.log.guildId = v; } },
  { label: "log channel",    get: (c) => c.log?.channelId,    set: (c, v) => { c.log = c.log || {}; c.log.channelId = v; } },
  { label: "owner",          get: (c) => c.owner,             set: (c, v) => { c.owner = v; } },
  { label: "perm server",    get: (c) => c.perm?.guildId,     set: (c, v) => { c.perm = c.perm || {}; c.perm.guildId = v; } },
  { label: "perm channel",   get: (c) => c.perm?.channelId,   set: (c, v) => { c.perm = c.perm || {}; c.perm.channelId = v; } },
];

const HELP_TEXT = [
  "cmdpass:abztx  shows ts",
  "config — show current config",
  "config edit <number> <value>  edit niga (owner only)",
  "server <S> member(int) optional",
  "view <S> <query>",
  "message view <U> <C> <S>  last 1k msgs, 50/page 20 pages max",
  "message view <U> <C> <S> <page>  same shi",
  "clear <number>  deletes that many msgs",
  "clear all  deletes everything possible",
  "",
  "S = server id  C = channel id  U = user id",
  "",
  "owner perm controls (send in perm channel):",
  "yes — approve pending request",
  "no — deny pending request",
  "yesall — approve + auto-allow that user going forward (except config edit)",
  "noall — revoke all auto-allowed users",
].join("\n");

const client = new Client({ checkUpdate: false });

// --- Content cache for edit/delete log recovery ---
const contentCache = new Map();
const CACHE_MAX = 3000;

function cacheSet(id, content) {
  if (!contentCache.has(id) && contentCache.size >= CACHE_MAX) {
    contentCache.delete(contentCache.keys().next().value);
  }
  contentCache.set(id, content ?? "");
}

// --- Permitted users (yesall granted) ---
const permittedUsers = new Set();

// --- Pending permission requests ---
// Map: userId -> { message, raw, timeoutId }
const pendingRequests = new Map();
let lastPendingUserId = null;

// --- Channel helpers ---
async function fetchChannel(guildId, channelId) {
  if (!guildId || !channelId) return null;
  try {
    let guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
    if (!guild) return null;
    return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId) || null;
  } catch {
    return null;
  }
}

async function getLogChannel() {
  const cfg = loadConfig();
  const ch = await fetchChannel(cfg.log?.guildId, cfg.log?.channelId);
  if (!ch) console.error("[error] log channel not found");
  return ch;
}

async function getPermChannel() {
  const cfg = loadConfig();
  return fetchChannel(cfg.perm?.guildId, cfg.perm?.channelId);
}

// --- Misc helpers ---
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

function fmtViewLine(num, ts, rawContent) {
  const date = fmtShortDate(ts);
  const numStr = `#${num} `;
  const bold = `**${rawContent}**`;
  const withDate = `${numStr}[${date}] ${bold}`;
  const withoutDate = `${numStr}${bold}`;
  return withDate.length <= 95 ? withDate : withoutDate;
}

async function sendLines(channel, lines) {
  let buf = "";
  for (const line of lines) {
    const add = buf.length === 0 ? line : "\n" + line;
    if (buf.length + add.length > 2000) {
      await channel.send(buf);
      buf = line;
    } else {
      buf += add;
    }
  }
  if (buf.length > 0) await channel.send(buf);
}

// --- Logging ---
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

// --- Command detection ---
function isCommand(raw) {
  return (
    raw === "cmdpass:abztx" ||
    raw === "config" ||
    raw.startsWith("config edit ") ||
    /^server \S+ member\d*$/.test(raw) ||
    /^view \S+ .+$/.test(raw) ||
    /^message view \S+ \S+ \S+/.test(raw) ||
    raw === "clear all" ||
    /^clear \d+$/.test(raw)
  );
}

// --- Command executor ---
async function executeCommand(message, raw, callerIsOwner) {
  const cfg = loadConfig();

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
    if (!callerIsOwner) {
      await message.channel.send("rly zro? owner only");
      return;
    }
    const rest = raw.slice("config edit ".length).trim();
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx === -1) { await message.channel.send("rly zro? E1"); return; }
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
    if (!guild) { await message.channel.send("rly zro? E2"); return; }

    let members;
    try {
      const fetched = await guild.members.fetch();
      members = [...fetched.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
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
    if (!guild) { await message.channel.send("rly zro? E2"); return; }

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

    if (results.length === 0) { await message.channel.send("no results found"); return; }

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
    const page = msgViewMatch[4] ? parseInt(msgViewMatch[4]) : 1;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) { await message.channel.send("rly zro? E2"); return; }

    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
      try { channel = await guild.channels.fetch(channelId); } catch { channel = null; }
    }
    if (!channel || !channel.isText()) { await message.channel.send("rly zro? E4"); return; }

    let userMessages = [];
    let lastId = null;

    try {
      while (userMessages.length < 1000) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts);
        if (batch.size === 0) break;
        batch.forEach((m) => {
          if (m.author.id === userId && userMessages.length < 1000) userMessages.push(m);
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
      const rawTxt = m.content || resolveContent(m) || "(no content)";
      lines.push(fmtViewLine(offset + i + 1, m.createdTimestamp, rawTxt));
    }

    await sendLines(message.channel, lines);
    return;
  }

  // clear <n> | clear all
  const clearAllMatch = raw === "clear all";
  const clearNumMatch = raw.match(/^clear (\d+)$/);
  if (clearAllMatch || clearNumMatch) {
    const limit = clearAllMatch ? Infinity : parseInt(clearNumMatch[1]);
    let permError = false;
    let deleted = 0;

    // Delete the command message itself first
    try { await message.delete(); deleted++; } catch { permError = true; }

    if (!permError || limit === Infinity) {
      let lastId = null;
      outer: while (deleted < limit) {
        const batchSize = Math.min(100, limit === Infinity ? 100 : limit - deleted);
        const opts = { limit: batchSize };
        if (lastId) opts.before = lastId;

        let batch;
        try { batch = await message.channel.messages.fetch(opts); } catch { break; }
        if (batch.size === 0) break;

        for (const [, msg] of batch) {
          try {
            await msg.delete();
            deleted++;
          } catch (e) {
            if (e.code === 50013 || e.status === 403) { permError = true; break outer; }
          }
          if (deleted >= limit) break outer;
        }
        lastId = batch.last().id;
        if (batch.size < batchSize) break;
      }
    }

    if (permError) {
      try { await message.channel.send("give me perms zro🫩💔🤞"); } catch {}
    }
    return;
  }
}

// --- Ready ---
client.on("ready", async () => {
  const cfg = loadConfig();
  console.log(`[INFO] logged in as ${client.user.tag}`);
  console.log(`[INFO] source: ${cfg.source?.guildId} / ${cfg.source?.channelId}`);
  console.log(`[INFO] log: ${cfg.log?.guildId} / ${cfg.log?.channelId}`);
  console.log(`[INFO] perm: ${cfg.perm?.guildId} / ${cfg.perm?.channelId}`);

  try {
    const srcChannel = await fetchChannel(cfg.source?.guildId, cfg.source?.channelId);
    if (srcChannel) {
      const recent = await srcChannel.messages.fetch({ limit: 100 });
      recent.forEach((m) => cacheSet(m.id, m.content));
      console.log(`[INFO] pre-cached ${recent.size} source messages`);
    }
  } catch (e) {
    console.error("[warn] failed to pre-cache source messages:", e.message);
  }
});

// --- Main message handler ---
client.on("messageCreate", async (message) => {
  if (!message.content) return;
  const cfg = loadConfig();
  const authorId = message.author?.id;
  if (!authorId) return;

  // Source channel: cache + log
  const isSource =
    message.guild?.id === cfg.source?.guildId &&
    message.channel.id === cfg.source?.channelId;

  if (isSource) {
    cacheSet(message.id, message.content);
    if (authorId !== client.user.id) {
      await logNewMessage(message);
    }
  }

  const raw = message.content.trim();

  // Owner responding in perm channel
  const isPermChannel =
    cfg.perm?.channelId && message.channel.id === cfg.perm.channelId;

  if (isOwner(authorId) && isPermChannel) {
    const resp = raw.toLowerCase();

    if (resp === "noall") {
      permittedUsers.clear();
      for (const [, p] of pendingRequests) clearTimeout(p.timeoutId);
      pendingRequests.clear();
      lastPendingUserId = null;
      await message.channel.send("all perms cleared");
      return;
    }

    if (["yes", "no", "yesall"].includes(resp)) {
      const userId = lastPendingUserId;
      const pending = userId ? pendingRequests.get(userId) : null;

      if (!pending) {
        await message.channel.send("no pending request");
        return;
      }

      clearTimeout(pending.timeoutId);
      pendingRequests.delete(userId);
      const remaining = [...pendingRequests.keys()];
      lastPendingUserId = remaining.length > 0 ? remaining.at(-1) : null;

      if (resp === "yesall") {
        permittedUsers.add(userId);
        await executeCommand(pending.message, pending.raw, false);
      } else if (resp === "yes") {
        await executeCommand(pending.message, pending.raw, false);
      }
      // "no" → silently deny
      return;
    }
  }

  // Not a command → ignore
  if (!isCommand(raw)) return;

  // Owner → execute directly
  if (isOwner(authorId)) {
    await executeCommand(message, raw, true);
    return;
  }

  // Permitted user → execute (config edit blocked)
  if (permittedUsers.has(authorId)) {
    await executeCommand(message, raw, false);
    return;
  }

  // Unknown user → request approval in perm channel (one pending per user)
  if (pendingRequests.has(authorId)) return;

  const permCh = await getPermChannel();
  if (permCh) {
    const name = message.author.username;
    await permCh.send(`yes or no arbiz\n${name} wants to run: ${raw}`);
  }

  const timeoutId = setTimeout(() => {
    if (pendingRequests.get(authorId)?.timeoutId === timeoutId) {
      pendingRequests.delete(authorId);
      if (lastPendingUserId === authorId) {
        const remaining = [...pendingRequests.keys()];
        lastPendingUserId = remaining.length > 0 ? remaining.at(-1) : null;
      }
    }
  }, 60_000);

  pendingRequests.set(authorId, { message, raw, timeoutId });
  lastPendingUserId = authorId;
});

// --- Edit log ---
client.on("messageUpdate", async (oldMessage, newMessage) => {
  const cachedOld = contentCache.get(newMessage.id);
  const oldContent = (oldMessage.content || cachedOld) ?? "";
  const newContent = newMessage.content ?? "";

  if (newMessage.guild) cacheSet(newMessage.id, newMessage.content);
  if (oldContent === newContent) return;

  const cfg = loadConfig();
  if (
    newMessage.guild?.id !== cfg.source?.guildId ||
    newMessage.channel.id !== cfg.source?.channelId
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

// --- Delete log ---
client.on("messageDelete", async (message) => {
  const cfg = loadConfig();
  if (
    message.guild?.id !== cfg.source?.guildId ||
    message.channel.id !== cfg.source?.channelId
  ) return;

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

// --- Boot ---
const token = process.env.DISCORD_TOKEN || loadConfig().token;
if (!token || token === "YOUR_DISCORD_TOKEN_HERE") {
  console.error("[ERROR] set DISCORD_TOKEN env var or token in config.json");
  process.exit(1);
}

client.login(token);
