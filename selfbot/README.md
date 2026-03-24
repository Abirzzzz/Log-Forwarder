# Discord Selfbot Logger

Silently monitors a Discord channel and forwards all messages to a separate log channel.

## Setup

1. Install dependencies:
   ```
   cd selfbot
   npm install
   ```

2. Edit `config.json`:
   ```json
   {
     "token": "YOUR_DISCORD_TOKEN",
     "source": {
       "guildId": "SERVER_ID_TO_MONITOR",
       "channelId": "CHANNEL_ID_TO_MONITOR"
     },
     "log": {
       "guildId": "LOG_SERVER_ID",
       "channelId": "LOG_CHANNEL_ID"
     }
   }
   ```

3. Run:
   ```
   npm start
   ```

## What it logs

- New messages (with attachments and embed notices)
- Edited messages (shows before and after)
- Deleted messages

It never sends any messages to the source server.
