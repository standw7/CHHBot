# CHHBot (Tusky) — Codebase Navigation Guide

A Discord bot for the Utah Mammoth hockey server. Tracks live NHL games, posts goal/final cards, manages RSS news feeds, handles Hall of Fame message curation, and provides hockey stats via slash and prefix commands.

**Stack:** TypeScript, discord.js v14, better-sqlite3, pino (logging), luxon (dates), rss-parser
**Runtime:** Node 20, built with `tsc`, run from `dist/`
**Database:** SQLite file (`tusky.db`) with WAL mode
**External APIs:** NHL unofficial API (`api-web.nhle.com`), MoneyPuck CSV, fxtwitter API

---

## 1. Project Structure

```
CHHBot/
├── src/
│   ├── index.ts                  # Entry point — boots everything
│   ├── config/
│   │   └── environment.ts        # Loads .env, exports AppConfig
│   ├── bot/
│   │   ├── client.ts             # Discord client creation, slash command registration
│   │   ├── commands/             # Slash command handlers (one file per command)
│   │   │   ├── next.ts           # /next — next scheduled game
│   │   │   ├── watch.ts          # /watch — broadcast info
│   │   │   ├── replay.ts         # /replay — latest goal replay
│   │   │   ├── stats.ts          # /stats — team stat leaders
│   │   │   ├── gif.ts            # /gif — media command management
│   │   │   └── config.ts         # /config — guild settings (admin)
│   │   └── events/
│   │       ├── messageCreate.ts  # Prefix command router (! commands) — LARGEST FILE
│   │       ├── reactionAdd.ts    # Hall of Fame induction on reaction threshold
│   │       └── linkFixer.ts      # Auto-replies with embed-friendly social links
│   ├── db/
│   │   ├── database.ts           # SQLite init, migrations, schema
│   │   ├── models.ts             # TypeScript interfaces for all DB tables
│   │   └── queries.ts            # All SQL queries (CRUD for every table)
│   ├── nhl/
│   │   ├── client.ts             # HTTP client for NHL API (caching, retries)
│   │   ├── endpoints.ts          # URL builders for all NHL API routes
│   │   ├── types.ts              # TypeScript types for NHL API responses
│   │   └── statsTypes.ts         # Types for club-stats endpoint
│   └── services/
│       ├── gameTracker.ts        # State machine: IDLE→PRE_GAME→LIVE→FINAL per guild
│       ├── goalCard.ts           # Builds Discord embed for goal notifications
│       ├── finalCard.ts          # Builds Discord embed for game-final summary
│       ├── spoiler.ts            # Score spoiler wrapping logic
│       ├── feedWatcher.ts        # RSS polling loop, posts to news channel
│       ├── feedBridge.ts         # Twitter-to-RSS bridge discovery (nitter, rsshub)
│       ├── statsLookup.ts        # Natural-language stat query → embed builder
│       ├── gameStats.ts          # Per-game boxscore stat lookup
│       ├── moneyPuck.ts          # Fetches/caches MoneyPuck CSV for advanced stats
│       ├── parseTime.ts          # Natural-language time parser for reminders
│       ├── reminderService.ts    # Polls DB for due reminders, fires them
│       └── simulator.ts          # Fake game simulation for testing goal/final cards
├── dist/                         # Compiled JS (committed for low-RAM VM deployment)
├── docs/plans/                   # Design docs for features
├── .github/workflows/ci.yml     # CI: build check on push/PR to main
├── package.json
├── tsconfig.json
├── tusky.db                      # SQLite database (gitignored)
└── .env                          # Secrets (gitignored)
```

---

## 2. Key Files

| File | Role |
|------|------|
| `src/index.ts` | Boots config, DB, slash commands, event handlers, game trackers, feed watcher, reminder service. Graceful shutdown. |
| `src/bot/events/messageCreate.ts` | **Largest file (~700 lines).** Routes all `!` prefix commands: help, next, watch, replay, stats, gif, feed, sim, gameday, player, standings, schedule, hof, remind. Also handles gif key lookups as the `default` case. |
| `src/services/gameTracker.ts` | Core game-day engine. Per-guild state machine polling NHL API. Posts game-start, period-start, goal cards (delayed), and final summary. |
| `src/db/database.ts` | Schema definition and migrations. All tables created here. Add new columns via the migration block at the bottom. |
| `src/db/queries.ts` | Every DB read/write. If you need data, the function is here. |
| `src/nhl/client.ts` | All NHL API calls with in-memory cache and retry logic. |
| `src/services/feedWatcher.ts` | RSS feed polling. Handles Twitter-specific rich embeds via fxtwitter API, generic RSS embeds, dedup, flood protection. |
| `src/bot/events/reactionAdd.ts` | Hall of Fame: watches reactions, builds HoF embed with media/reply context/social links, posts to HoF channel. Exports `buildHofPost()` for reuse. |

---

## 3. Architecture & Data Flow

### Startup sequence (`index.ts`)
1. `loadConfig()` — reads `.env`
2. `getDb()` — opens SQLite, runs migrations
3. `registerCommands()` — pushes slash commands to Discord API
4. `createClient()` — creates discord.js client, wires interaction handler
5. Register event handlers: `messageCreate`, `reactionAdd`, `linkFixer`
6. On `ready`: start `feedWatcher`, `reminderService`, then start a `gameTracker` per guild that has a gameday channel configured

### Game tracking flow
```
IDLE → (schedule check, game within 24h) → PRE_GAME → (API shows LIVE) → LIVE → (API shows FINAL) → FINAL → IDLE
         poll: 30min                          poll: 1-5min                   poll: 10s                    post final, wait 1min
```
- Goal detection: polls play-by-play, checks `posted_goals` table for dedup, schedules delayed post (configurable spoiler delay)
- Goal card built from: play-by-play event + landing endpoint (rich names/assists/headshots)

### Command flow
- **Slash commands**: discord.js interaction handler in `client.ts` → dispatches to `commands/*.ts`
- **Prefix commands**: `messageCreate.ts` checks `!` prefix + guild's `command_mode` setting → routes by command name

### Feed flow
- `feedWatcher` polls every 5 min across all guilds
- For each feed source: parse RSS, find new items since `last_item_id`, dedup via `posted_feed_items` table
- Twitter feeds get rich embeds via fxtwitter API; generic feeds get standard embeds
- `feedBridge` tries multiple RSS bridge services to convert Twitter profiles to RSS URLs

### Hall of Fame flow
- Reaction added → check emoji (fire/laughing) → check threshold → fetch full message → `buildHofPost()` → post embed + social link follow-up to HoF channel

---

## 4. "If You Need to Change X, Look at Y"

| Change | Files to edit |
|--------|---------------|
| Add a new slash command | Create `src/bot/commands/<name>.ts`, add import to `src/bot/client.ts` commands array |
| Add a new prefix command | Add case to switch in `src/bot/events/messageCreate.ts` `registerMessageHandler` |
| Add a new DB table | Add `CREATE TABLE` in `src/db/database.ts` `runMigrations()`, add interface in `src/db/models.ts`, add queries in `src/db/queries.ts` |
| Add a column to existing table | Add `ALTER TABLE` migration at bottom of `src/db/database.ts`, update interface in `src/db/models.ts`, update queries in `src/db/queries.ts` |
| Change goal card appearance | `src/services/goalCard.ts` `buildGoalCard()` |
| Change final card appearance | `src/services/finalCard.ts` `buildFinalCard()` |
| Change game start notification | `src/services/gameTracker.ts` `postGameStartNotification()` |
| Change polling intervals | `src/services/gameTracker.ts` — delay values in `handleIdle`, `handlePreGame`, `handleLive` |
| Change spoiler behavior | `src/services/spoiler.ts` |
| Add a new stat category | `src/services/statsLookup.ts` — add to `STAT_CATEGORIES` or `MONEYPUCK_CATEGORIES` and `KEYWORD_MAPPINGS` |
| Add per-game stat | `src/services/gameStats.ts` — add to `GAME_STAT_CATEGORIES` |
| Change NHL API endpoints | `src/nhl/endpoints.ts` (URLs), `src/nhl/types.ts` (response types), `src/nhl/client.ts` (fetch functions) |
| Change feed polling interval | `src/services/feedWatcher.ts` `POLL_INTERVAL` |
| Change tweet rendering | `src/services/feedWatcher.ts` `postTwitterItem()` |
| Change HoF qualifying emojis/threshold | `src/bot/events/reactionAdd.ts` `HOF_EMOJIS`, threshold comes from `guild_config.hof_threshold` |
| Change HoF post format | `src/bot/events/reactionAdd.ts` `buildHofPost()` |
| Change link fixer domains | `src/bot/events/linkFixer.ts` `LINK_REPLACEMENTS` |
| Change reminder time parsing | `src/services/parseTime.ts` |
| Add a new env variable | `src/config/environment.ts`, `.env.example` |
| Change guild config options | `src/db/models.ts` `GuildConfig`, `src/db/database.ts` schema, `src/db/queries.ts` `upsertGuildConfig`, `src/bot/commands/config.ts` choices |
| Run the simulation | `!sim` triggers `src/services/simulator.ts` `runSimulation()` |
| Change help pages | `src/bot/events/messageCreate.ts` `buildHelpPages()` |
| Add an RSS bridge | `src/services/feedBridge.ts` `TWITTER_BRIDGES` array |
| Change cache TTLs | `src/nhl/client.ts` `SCHEDULE_CACHE_TTL` / `DEFAULT_CACHE_TTL`; `src/services/moneyPuck.ts` `CACHE_TTL` |

---

## 5. Dependencies & External Services

### NPM packages
| Package | Purpose |
|---------|---------|
| `discord.js` | Discord bot framework (slash commands, embeds, reactions, partials) |
| `better-sqlite3` | Synchronous SQLite (WAL mode, foreign keys) |
| `pino` | JSON logger |
| `luxon` | Timezone-aware date parsing (reminders) |
| `rss-parser` | RSS/Atom feed parsing |
| `dotenv` | .env loading |

### External APIs
| API | Used by | Notes |
|-----|---------|-------|
| `api-web.nhle.com` | `src/nhl/client.ts` | Unofficial NHL API — schedule, play-by-play, boxscore, landing, standings, player search, TV schedule |
| `moneypuck.com` (CSV) | `src/services/moneyPuck.ts` | Advanced stats: hits, blocks, takeaways, xGoals. Cached 1 hour. |
| `api.fxtwitter.com` | `src/services/feedWatcher.ts` | Rich tweet data for feed embeds |
| RSS bridges (nitter, rsshub, bird.makeup) | `src/services/feedBridge.ts` | Convert Twitter profiles to RSS feeds |
| `search.d3.nhle.com` | `src/nhl/endpoints.ts` | Player search |

### Environment variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_TOKEN` | Yes | Bot auth token |
| `DISCORD_CLIENT_ID` | Yes | For slash command registration |
| `DISCORD_GUILD_ID` | No | Dev-only: instant slash command updates for one guild |
| `LOG_LEVEL` | No | Default: `info` |
| `DATABASE_PATH` | No | Default: `./tusky.db` |
| `RSSHUB_URL` | No | Custom RSSHub instance URL for feed bridge |

---

## 6. Patterns & Conventions

- **TypeScript strict mode**, ES2022 target, Node16 module resolution
- **One file per slash command** in `src/bot/commands/`, each exports `data` (SlashCommandBuilder) and `execute` function
- **Prefix commands** all live in `messageCreate.ts` as `handlePrefix*` functions — no separate files
- **All DB access** goes through `src/db/queries.ts` — no raw SQL elsewhere (except `simulator.ts` for cleanup)
- **Pino logger** with named instances per module: `pino({ name: 'module-name' })`
- **NHL API client** uses generic `fetchJson<T>()` with in-memory cache, 3-attempt retry with exponential backoff
- **Dedup pattern**: `hasXBeenPosted()` check → `markXPosted()` claim → then post. Used for goals, finals, game starts, feed items, HoF messages
- **Spoiler mode**: configurable per guild. `'off'` shows scores in embed; `'wrap_scores'` / `'minimal_embed'` use Discord spoiler tags
- **Team emojis**: uses guild custom emojis matching team abbreviation (e.g., `:UTA:`)
- **Color scheme**: `0x006847` (Utah green) for most embeds, `0xFF4500` for HoF, `0x000000` for Twitter embeds
- **Delayed posting**: goal and final cards respect `spoiler_delay_seconds` via `setTimeout`
- **Guild-scoped**: everything is per-guild via `guild_id` column. Bot supports multiple Discord servers simultaneously
- **dist/ committed**: the compiled JS is checked in because the Oracle Cloud VM has limited RAM and can't always run `tsc`
