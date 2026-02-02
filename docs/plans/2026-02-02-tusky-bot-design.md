# Tusky Discord Bot - Design Document

**Date:** 2026-02-02
**Project:** CHHBot (Tusky)
**Purpose:** Discord bot for a Utah Mammoth hockey server providing live goal cards, media commands, game info, and community curation.

---

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Discord library:** discord.js v14
- **Database:** SQLite via better-sqlite3
- **Logging:** pino (structured JSON)
- **Config:** dotenv
- **Package manager:** npm
- **Hosting target:** Railway (free tier), but runs as a standard Node.js process anywhere

---

## Project Structure

```
CHHBot/
├── src/
│   ├── index.ts              # Entry point, bot startup
│   ├── config/
│   │   └── environment.ts    # Env var loading, validation
│   ├── bot/
│   │   ├── client.ts         # Discord client setup, event registration
│   │   ├── commands/         # Slash + prefix command handlers
│   │   │   ├── next.ts
│   │   │   ├── watch.ts
│   │   │   ├── replay.ts
│   │   │   ├── gif.ts
│   │   │   └── config.ts     # Admin config commands
│   │   └── events/           # Discord event handlers
│   │       ├── messageCreate.ts   # Prefix commands + hall of fame
│   │       └── reactionAdd.ts     # Hall of fame trigger
│   ├── nhl/
│   │   ├── client.ts         # NHL API HTTP client with retries
│   │   ├── types.ts          # TypeScript types for API responses
│   │   └── endpoints.ts      # URL builders for each endpoint
│   ├── services/
│   │   ├── gameTracker.ts    # Polling state machine, goal detection
│   │   ├── goalCard.ts       # Embed builder for goal cards
│   │   ├── finalCard.ts      # Embed builder for final summary
│   │   ├── spoiler.ts        # Spoiler wrapping logic
│   │   └── hallOfFame.ts     # Reaction tracking, repost logic
│   └── db/
│       ├── database.ts       # SQLite connection, migrations
│       ├── models.ts         # Type definitions for DB rows
│       └── queries.ts        # All SQL queries
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── requirements.md
```

---

## Database Schema

```sql
-- Guild configuration
CREATE TABLE guild_config (
  guild_id TEXT PRIMARY KEY,
  primary_team TEXT DEFAULT 'UTA',
  gameday_channel_id TEXT,
  hof_channel_id TEXT,
  bot_commands_channel_id TEXT,
  spoiler_delay_seconds INTEGER DEFAULT 30,
  spoiler_mode TEXT DEFAULT 'off',
  command_mode TEXT DEFAULT 'slash_plus_prefix',
  timezone TEXT DEFAULT 'America/Denver'
);

-- Gif/media command registry
CREATE TABLE gif_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  key TEXT,
  url TEXT,
  added_by TEXT,
  created_at TEXT
);

-- Posted goals (dedup, survives restarts)
CREATE TABLE posted_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  game_id INTEGER,
  event_id INTEGER,
  posted_at TEXT,
  UNIQUE(guild_id, game_id, event_id)
);

-- Posted final summaries (one per game)
CREATE TABLE posted_finals (
  guild_id TEXT,
  game_id INTEGER,
  posted_at TEXT,
  PRIMARY KEY(guild_id, game_id)
);

-- Hall of fame inducted messages
CREATE TABLE hof_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  original_message_id TEXT,
  original_channel_id TEXT,
  inducted_at TEXT,
  UNIQUE(guild_id, original_message_id)
);
```

---

## Game Tracker State Machine

### States

- **IDLE** -- No game soon. Check schedule every 30 minutes.
- **PRE_GAME** -- Game within 24 hours. Poll every 5 min, then every 60s within 30 min of puck drop.
- **LIVE** -- Game in progress. Poll play-by-play every 10 seconds. Detect goals, enqueue delayed posts.
- **FINAL** -- Game ended. Post final summary after spoiler delay, mark complete, return to IDLE.

### Goal Detection Flow

1. Poll `/v1/gamecenter/{gameId}/play-by-play`
2. Filter for goal events
3. Check `posted_goals` table for dedup
4. If new: insert into DB immediately, schedule delayed post at `now + spoilerDelaySeconds`
5. Build goal card embed from play-by-play event data + boxscore for shot counts

### Restart Resilience

- On startup, check DB for posted goals for current game
- Resume polling without re-posting

### Rate Limiting

- Hard cap of 6 NHL API requests/minute per active game
- Cache schedule responses for 5 minutes
- Queue outbound Discord messages to avoid rate limits

### Delayed Posts

- `setTimeout` for spoiler delays (30-120s range)
- If bot restarts during delay, goal is in DB so it won't re-post (delayed post lost -- acceptable for v1)

---

## Command Handling

### Slash Commands (always active)

| Command | Description | Permissions |
|---------|-------------|-------------|
| `/next` | Next scheduled game | Everyone |
| `/watch` | Where to watch current/next game | Everyone |
| `/replay` | Most recent goal replay | Everyone |
| `/gif name:<key>` | Post a random media item for key | Everyone |
| `/gif add\|remove\|list\|keys` | Manage gif registry | Admin |
| `/config set <setting> <value>` | Update guild config | Admin |

### Prefix Commands (when enabled via command_mode)

- `!next`, `!watch`, `!replay` -- Map to slash command logic
- `!goal` -- Maps to `/gif name:goal`
- `!<anyKey>` -- Check gif registry, post if found, ignore if not
- `!gif add|remove|list|keys` -- Admin gif management

### Cooldowns

- 5-second per-user per-command cooldown for gif commands (in-memory Map)

---

## Spoiler System

Centralized `spoiler.ts` module with `wrapScore(text, mode)`:

- **off** -- Return text as-is
- **wrap_scores** -- Wrap score strings in `||score||`
- **minimal_embed** -- Strip score fields from embed, score only in spoiler-wrapped plain text above embed

All embed builders call into this module for consistent behavior.

---

## Hall of Fame

1. Listen for `messageReactionAdd` events (requires `GuildMessageReactions` intent)
2. On fire emoji reaction, fetch full reaction count
3. If count >= 5, check `hof_messages` for dedup
4. If not inducted: fetch original message, build embed with author info, avatar, jump link, timestamp, content (truncated 1,500 chars), first attachment
5. Post to `hof_channel_id`, insert into `hof_messages`
6. If original deleted or channel inaccessible, log and skip

---

## Error Handling

- **NHL API down:** Log, set "api unavailable" flag, pause goal posting, commands respond "data temporarily unavailable"
- **Discord API errors:** Queue messages, retry with backoff on rate limits. Missing channel/permissions: log and skip.
- **Uncaught errors:** Global process handlers to prevent crashes
- **Graceful shutdown:** SIGINT/SIGTERM stops polling, flushes queue, closes DB

---

## Logging

- Structured JSON via pino
- Events logged: goal detected, goal posted, final posted, HoF inducted, API errors (status + retry count)
- Log level configurable via `LOG_LEVEL` env var
