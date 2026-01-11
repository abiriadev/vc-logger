# VC Logger Bot

A Discord bot that logs Voice Channel activity to SQLite and provides user statistics.

## Features

- **Activity Tracking**: Logs when users join/leave voice channels.
- **Session Logging**: Tracks duration of user sessions and channel sessions.
- **Text Logs**: Sends a message to the text channel inside the Voice Channel (text-in-voice) when a session ends, with duration.
- **Slash Commands**:
    - `/stats [user]`: View activity for the last 30 days (Github-style contribution graph).
    - `/leaderboard`: View top 10 users by time spent.

## Setup

1. **Install Dependencies**:

    ```bash
    pnpm install
    ```

2. **Environment Variables**:
   You must provide the following environment variables (e.g., via `.env` or system env):
    - `DISCORD_TOKEN`: Your Discord Bot Token.
    - `CLIENT_ID`: The Application ID of the bot.
    - `GUILD_ID`: (Optional) The Server (Guild) ID for instant command registration during development. If omitted, commands are registered globally (takes up to 1h to propagate).
    - `DB_PATH`: (Optional) Path to the SQLite database file. Defaults to `vc_logger.db`.

3. **Run**:
    - Dev: `pnpm start:dev`
    - Prod: `pnpm build` then `pnpm start`

## Database

The bot uses a local SQLite database `vc_logger.db`. It is automatically created on first run and accessed via `better-sqlite3`.
