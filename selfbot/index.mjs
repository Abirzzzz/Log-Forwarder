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

const FIELDS = [
  { label: "source server", get: (c) => c.source?.guildId, set: (c, v) => { c.source = c.source || {}; c.source.guildId = v; } },
  { label: "source channel", get: (c) => c.source?.channelId, set: (c, v) => { c.source = c.source || {}; c.source.channelId = v; } },
  { label: "log server", get: (c) => c.log?.guildId, set: (c, v) => { c.log = c.log || {}; c.log.guildId = v; } },
  { label: "log channel", get: (c) => c.log?.channelId, set: (c, v) => { c.log = c.log || {}; c.log.channelId = v; } },
  { label: "owner", get: (c) => c.owner, set: (c, v) => { c.owner = v; } },
  { label: "allowed", get: (c) => c.allowed, set: (c, v) => { c.allowed = v; } },
];

const client = new Client({ checkUpdate: false });

async function getLogChannel() {
  const cfg = loadConfig();
  return client.guilds.cache.get(cfg.log.guildId)?.channels.cache.get(cfg.log.channelId) || null;
}

function resolveAuthor(message) {
  if (message.author) {
    return `${message.author.username}#${message.author.discriminator} (${message.author.id})`;
  }
  const cached = message.author?.id ? client.users.cache.get(message.author.id) : null;
  if (cached) {
    return `${cached.username}#${cached.discriminator} (${cached.id})`;
  }
  return `(not cached)`;
}

function resolveContent(message) {
  if (message.content) return message.content;
  if (message.attachments?.size > 0) return null;
  if (message.embeds?.length > 0) return "(embed only)";
  if (message.stickers?.size > 0) return "(sticker)";
  return "(no content)";
}

async function logNewMessage(message) {
  const ch = await getLogChannel();
  if (!ch || !ch.isText()) return;

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

client.on("ready", () => {
  const cfg = loadConfig();
  console.log(`[INFO] logged in as ${client.user.tag}`);
  console.log(`[INFO] source: ${cfg.source.guildId} / ${cfg.source.channelId}`);
  console.log(`[INFO] log: ${cfg.log.guildId} / ${cfg.log.channelId}`);
});

client.on("messageCreate", async (message) => {
  const cfg = loadConfig();

  const isSource =
    message.guild?.id === cfg.source.guildId &&
    message.channel.id === cfg.source.channelId;

  if (isSource && message.author.id !== client.user.id) {
    await logNewMessage(message);
  }

  if (!isAllowed(message.author.id)) return;

  const raw = message.content.trim();

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

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isText()) {
      await message.channel.send("rly zro? E4");
      return;
    }

    let userMessages = [];
    let lastId = null;
    let done = false;

    try {
      while (!done) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts);
        if (batch.size === 0) break;
        batch.filter((m) => m.author.id === userId).forEach((m) => userMessages.push(m));
        lastId = batch.last().id;
        if (batch.size < 100) done = true;
        if (userMessages.length >= 500) done = true;
      }
    } catch {
      await message.channel.send("rly zro? E5");
      return;
    }

    userMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    const perPage = 20;
    const maxPage = Math.ceil(userMessages.length / perPage) || 1;

    if (!Number.isInteger(page) || page < 1 || page > maxPage) {
      await message.channel.send("really jro");
      return;
    }

    const slice = userMessages.slice((page - 1) * perPage, page * perPage);
    const lines = [`${maxPage}`];
    for (const m of slice) {
      const date = fmtDate(m.createdTimestamp);
      const txt = (m.content || resolveContent(m) || "(no content)").slice(0, 80);
      lines.push(`[${date}] ${txt}`);
    }
    await message.channel.send(lines.join("\n").slice(0, 2000));
    return;
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  const oldContent = oldMessage.content ?? "";
  const newContent = newMessage.content ?? "";
  if (oldContent === newContent) return;

  const cfg = loadConfig();
  if (
    newMessage.guild?.id !== cfg.source.guildId ||
    newMessage.channel.id !== cfg.source.channelId
  ) return;

  const ch = await getLogChannel();
  if (!ch || !ch.isText()) return;

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

  const ch = await getLogChannel();
  if (!ch || !ch.isText()) return;

  const date = fmtDate(message.createdTimestamp || Date.now());
  const author = resolveAuthor(message);
  const content = message.content || (message.attachments?.size > 0 ? "(attachment only)" : "(not cached)");

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
