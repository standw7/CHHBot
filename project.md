Things that claude code should do while coding this project:

- After every step claude should update this file with the current project progress, what was just done, and references for use with a future llm. This LLM should be able to reference this file and pick up exactly where claude code left off in coding.

- After every compile, claude code should read this file to regain the context of what it needs to do and what has been done

- Always save the changes to the code into the github repo. This repo will be named the same as the project file.

- Ask clarifying questions when needed.

---

## Project Progress

### 2026-02-02: Project Setup & Design

**Status:** Design complete, repo scaffolded, ready for implementation.

**What was done:**
1. Brainstormed and finalized the full bot design through collaborative Q&A
2. Decisions made: Node.js + TypeScript, discord.js v14, SQLite (better-sqlite3), npm, Railway hosting
3. Wrote full design document: `docs/plans/2026-02-02-tusky-bot-design.md`
4. Created GitHub repo: https://github.com/standw7/CHHBot (private)
5. Set up project scaffolding: .gitignore, .env.example, CI workflow (GitHub Actions for Node 20)
6. Initial commit pushed to main

**Key files:**
- `requirements.md` -- Full PRD with all feature specs
- `docs/plans/2026-02-02-tusky-bot-design.md` -- Validated design document
- `.env.example` -- Environment variable template
- `.github/workflows/ci.yml` -- CI pipeline

**Design summary:**
- 5 DB tables: guild_config, gif_commands, posted_goals, posted_finals, hof_messages
- Game tracker state machine: IDLE -> PRE_GAME -> LIVE -> FINAL -> IDLE
- Features: goal cards (B), final summary (C), !next (D), !watch (E), !replay (G), gif commands (A), hall of fame (H), spoiler system (F)
- Team: Utah Mammoth (code: UTA)

**Next steps:**
- ~~Initialize package.json, tsconfig.json, and install dependencies~~
- ~~Scaffold the src/ directory structure~~
- ~~Implement features in order: DB layer -> NHL API client -> config/environment -> commands -> game tracker -> hall of fame~~

### 2026-02-02: Full Implementation Complete

**Status:** All core features implemented. Bot compiles cleanly. Ready for Discord token setup and testing.

**What was done:**
1. Created package.json with build/start/dev scripts
2. Set up TypeScript config targeting ES2022/Node16
3. Installed all dependencies: discord.js, better-sqlite3, pino, dotenv, tsx
4. Built complete src/ directory structure (18 files):
   - `src/db/` - SQLite database layer (models, connection, migrations, queries)
   - `src/config/` - Environment variable loading/validation
   - `src/nhl/` - NHL API client with retries, caching, typed endpoints
   - `src/bot/` - Discord client, slash commands (/next, /watch, /replay, /gif, /config), prefix commands, event handlers
   - `src/services/` - Game tracker state machine, goal card builder, final card builder, spoiler system, hall of fame
   - `src/index.ts` - Entry point wiring everything together
5. All TypeScript compiles cleanly with strict mode

**Implemented features:**
- Feature A: Media commands (!goal, !yams, etc.) with cooldowns, admin CRUD
- Feature B: Live goal cards with spoiler delay and dedup
- Feature C: Final game summary cards with three stars
- Feature D: /next command with timezone-aware formatting
- Feature E: /watch command with NHL TV schedule + landing fallback
- Feature F: Spoiler system (off, wrap_scores, minimal_embed)
- Feature G: /replay command for latest goal highlight
- Feature H: Hall of fame (5 fire reaction threshold, dedup)

**Key architecture:**
- Game tracker state machine: IDLE -> PRE_GAME -> LIVE -> FINAL -> IDLE
- Goals are claimed in DB immediately on detection, then posted after spoiler delay
- Restart-safe: posted_goals and posted_finals tables prevent duplicates
- NHL API client retries 3x with exponential backoff, caches responses
- Prefix commands only active when command_mode = 'slash_plus_prefix'

**To get running:**
1. Create a Discord application at https://discord.com/developers
2. Create a bot, copy the token
3. Enable Message Content Intent in bot settings (needed for prefix commands)
4. Copy `.env.example` to `.env` and fill in DISCORD_TOKEN and DISCORD_CLIENT_ID
5. Optionally set DISCORD_GUILD_ID for faster slash command registration during dev
6. Run `npm run dev` to start in development mode
7. Invite bot to server with: Send Messages, Embed Links, Read Message History, Add Reactions permissions
8. Use `/config set` commands to configure: gameday_channel, hof_channel, team, etc.

**Next steps:**
- ~~Test with a real Discord token~~
- ~~Verify NHL API response formats match our types (API is unofficial, fields may vary)~~
- Add any missing team abbreviation for Utah Mammoth (currently using 'UTA')
- Potentially add more gif keys and media content

### 2026-02-03: Bug Fixes & Simulation Mode

**Status:** All feedback addressed, simulation mode added for testing.

**Bugs fixed:**
1. **NHL API types completely wrong** -- Play-by-play only returns player IDs, not names. Updated all types in `src/nhl/types.ts` to match actual API. Added `LandingGoal`, `LandingAssist`, `LandingPeriodScoring` types for the landing endpoint which has rich goal data with names, headshots, assists, and highlight URLs.
2. **/replay showing "Unknown" scorer** -- Now uses landing endpoint (`/v1/gamecenter/{id}/landing`) which provides `summary.scoring` with full player names, assist details, and highlight clip URLs. Fixed in `src/bot/commands/replay.ts`.
3. **Game tracker goal cards** -- Updated `src/services/gameTracker.ts` to fetch landing data at post time (after spoiler delay) for rich goal info. Falls back to play-by-play data if landing is unavailable.
4. **!watch and !replay were stubs** -- Fully implemented both prefix commands in `src/bot/events/messageCreate.ts` with the same logic as their slash command counterparts.
5. **Guild config not created on startup** -- Fixed `src/index.ts` to auto-create default config for existing guilds when bot starts (was only creating for newly joined guilds).

**New features:**
- `!help` command -- Shows all available commands with registered gif keys
- `!sim` command (admin) -- Runs a fake game simulation posting 3 goal cards + final summary to the gameday channel with configured spoiler delay
- `!sim reset` command (admin) -- Clears simulation data so it can run again

**Key files changed:**
- `src/nhl/types.ts` -- Completely rewritten to match actual API
- `src/bot/commands/replay.ts` -- Uses landing endpoint for names/highlights
- `src/services/goalCard.ts` -- Uses `LandingGoal` data for names, headshots, assists
- `src/services/gameTracker.ts` -- Fetches landing data before posting goal cards
- `src/bot/events/messageCreate.ts` -- Full !watch, !replay, !sim, !help implementations
- `src/services/simulator.ts` -- NEW: Fake game simulation for testing

**Important:** DISCORD_GUILD_ID should be set in .env for instant slash command registration (global commands take up to 1 hour to propagate).