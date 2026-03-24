# Discord Selfbot Logger

## Setup

1. Install dependencies:
   ```
   cd selfbot
   npm install
   ```

2. Fill in config.json with your token, source server/channel, log server/channel, owner id, and allowed ids.

3. Run:
   ```
   node index.mjs
   ```

---

## config.json fields

| # | field | what it does |
|---|-------|--------------|
| 1 | source server | server id to monitor and log from |
| 2 | source channel | channel id inside that server to log |
| 3 | log server | server id where logs get sent |
| 4 | log channel | channel id where logs get sent |
| 5 | owner | single user id that can run commands |
| 6 | allowed | comma-separated user ids that can also run commands |

Token is not shown in the config command.

---

## commands (no prefix)

only owner and allowed users can trigger these. everyone else gets ignored silently.

`config`
shows all config fields with their numbers and current values.

`config edit <number> <value>`
edits a config field by its number. example: config edit 1 123456789

`server <serverid> member`
lists members of that server, 20 per page, sorted by username. first line is the max page count. shows each member and their highest role.

`server <serverid> member<page>`
same but for a specific page. no space between member and the number. example: server 123456 member2

`message view <userid> <channelid> <serverid>`
pulls last 500 messages from a user in that channel. 20 per page, newest first.

`message view <userid> <channelid> <serverid> <page>`
same with a specific page.

---

## errors

`rly zro? E1` - config edit was called with a bad field number or missing value

`rly zro? E2` - server id not found or bot is not in that server

`rly zro? E3` - failed to fetch member list, probably missing permissions

`rly zro? E4` - channel not found or not a text channel

`rly zro? E5` - failed to fetch messages from that channel

`really jro` - page number was invalid (negative, zero, above max, or not a number)

---

## what gets logged

- new messages: date, author, content, attachments if any
- edited messages: shows old and new content, only when text actually changed
- deleted messages: date, author, what was deleted if cached

dates are shown as D/M/Y.
