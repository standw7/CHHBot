# Season Features: Daily Card, Special Goal Cards, Auto Replays

Approved design (2026-09-13). Three independent tasks, each committed separately.

## Global Constraints

- TypeScript, discord.js v14, better-sqlite3, pino logging, luxon for dates. Follow the patterns in `src/services/reminderService.ts` (start/stop + `setInterval`), `src/db/queries.ts` (prepared statements), and `src/db/database.ts` (migration block at the bottom adds columns with `ALTER TABLE` guarded by `colNames.includes`).
- New tables/columns are added in `src/db/database.ts`; every DB read/write lives in `src/db/queries.ts`; row interfaces in `src/db/models.ts`.
- Pure logic goes in its own module with unit tests. Test runner: `node --test` via tsx. Add `"test": "tsx --test 'src/**/*.test.ts'"` to `package.json` scripts in Task 1 (first task to add tests); later tasks add test files only.
- Do NOT commit `dist/` in these tasks (the controller builds and commits dist at deploy time). Run `npm run build` to type-check before committing, but leave `dist/` out of the commit.
- Guild timezone is `config.timezone` (default `America/Denver`). Use luxon `DateTime.setZone`.
- Primary team is `config.primary_team` (default `UTA`).
- Hat trick emoji is 🧢🧢🧢 (three baseball caps), never 🎩.
- Spoiler modes (`off` | `wrap_scores` | `minimal_embed`, see `src/services/spoiler.ts`) must keep working: milestone banners may name the scorer and their goal count but must never reveal the game score in `wrap_scores`/`minimal_embed`.
- No behaviour changes to existing cards beyond what each task specifies.

---

### Task 1: Daily pre-game / off-day card

**Files**
- Create: `src/services/dailyCard.ts`, `src/services/dailyCard.test.ts`
- Modify: `src/db/database.ts`, `src/db/models.ts`, `src/db/queries.ts`, `src/bot/commands/config.ts`, `src/index.ts`, `package.json`

**Config** (new `guild_config` columns via migration): `daily_card_enabled INTEGER DEFAULT 1`, `daily_card_hour INTEGER DEFAULT 9`. Expose in `/config set` as `daily_card` (`on`/`off`) and `daily_card_hour` (integer 0–23). Add both to `GuildConfig` in `models.ts`.

**Dedup table**: `daily_cards_posted (guild_id TEXT, date TEXT, PRIMARY KEY (guild_id, date))` with queries `hasDailyCardBeenPosted(guildId, date)` and `markDailyCardPosted(guildId, date)`. `date` is `YYYY-MM-DD` in the guild timezone.

**Scheduler** (`startDailyCardService(client)` / `stopDailyCardService()`, wired in `src/index.ts` next to the reminder service, inside the `ready` handler): every 60 s, for each guild in `client.guilds.cache` with a config that has `gameday_channel_id` and `daily_card_enabled`, compute "now" in the guild timezone; if `hour >= daily_card_hour` and today's card is not yet posted → `markDailyCardPosted` first (claim), then post. (Using `>=` means a bot that was down at 9:00 still posts when it comes back later that day.)

**Card selection** — a pure function `selectDailyCard(games: ScheduleGame[], todayISO: string, zone: string): { kind: 'game'; game: ScheduleGame } | { kind: 'offday'; nextGame?: ScheduleGame } | { kind: 'none' }`:
- `game` if any game's `startTimeUTC` falls on `todayISO` in `zone` (compare `DateTime.fromISO(startTimeUTC).setZone(zone).toISODate()`), regardless of gameType.
- Otherwise `offday` if today is **in season**: at least one game with `gameType` 2 or 3 has a date `<= today` and at least one game with `gameType` 2 or 3 has a date `>= today`. Preseason (`gameType` 1) does not count toward in-season. `nextGame` is the earliest game with date `> today` (any type).
- Otherwise `none` (post nothing).

**Off-day phrases** — exported constant `OFF_DAY_PHRASES: string[]` with exactly these 10 entries, and `pickOffDayPhrase(todayISO: string): string` returning `OFF_DAY_PHRASES[dayOfYear % OFF_DAY_PHRASES.length]` where `dayOfYear` is luxon's `ordinal` for `todayISO`:
1. "No game today. Touch grass."
2. "Off day. Go outside."
3. "No hockey tonight. Get a hobby."
4. "Rest day. Hydrate."
5. "Nothing on the schedule. Call your mom."
6. "No game today. Read a book or something."
7. "Day off. Stretch. Nap. Repeat."
8. "No puck drop tonight. Go for a walk."
9. "Off night. Do the dishes you've been avoiding."
10. "No game. Take a break. We'll be here tomorrow."

**Pre-game embed** (`buildPreGameCard`):
- Title: `Game day!`
- Description line 1: `{awayEmoji} **{AWAY}** @ **{HOME}** {homeEmoji}` (use `getTeamEmoji` from `goalCard.ts`; primary team may be either side).
- Records from `nhlClient.getStandings()` for both teams, same `GP/W/L/OT/PTS/S:` format as the game-start card in `gameTracker.ts` (`postGameStartNotification`). Omit a line if the standing is missing.
- `**Puck drop:** <t:{unixSeconds}:t>` (Discord timestamp, renders in the viewer's local time).
- `**Venue:** {game.venue.default}`.
- `**TV:** ` comma-joined `tvBroadcasts[].network` if present, else omit the line.
- `**Season series:** W-L-OTL` for the primary team against this opponent from `games` with `gameState` `FINAL`/`OFF` and gameType 2 only: a win if the primary team's `score` > opponent's; a loss if it lost in regulation (`periodDescriptor`/`gameOutcome.lastPeriodType === 'REG'`); OTL if lost in `OT`/`SO`. If the schedule game type lacks the needed fields, add optional fields to `ScheduleGame` in `src/nhl/types.ts` (`gameOutcome?: { lastPeriodType: string }`). Omit the line if 0 games played.
- Thumbnail: primary team `logo` from the schedule game. Color `0x006847`.
- No role ping.

**Off-day embed** (`buildOffDayCard`): Title `No game today`, description = the phrase, plus `**Next game:** {AWAY} @ {HOME} — <t:{unix}:F>` if `nextGame` exists. Same thumbnail/color.

**Tests** (`dailyCard.test.ts`, `node:test` + `node:assert/strict`): `selectDailyCard` — game today; off-day in season; before first regular-season game with only preseason played → `none`; after last game → `none`; game tonight late in UTC that is still "today" in America/Denver. `pickOffDayPhrase` — cycles through all 10 across 10 consecutive dates and wraps. Season-series calculation — W, regulation L, OT L, SO L, ignores preseason and unplayed games.

**Done when** `npm test` passes, `npm run build` passes, `/config set daily_card off` and `daily_card_hour` work, and running the bot with `LOG_LEVEL=debug` logs the scheduler tick without errors.

---

### Task 2: Special goal cards (milestones)

**Files**
- Create: `src/services/milestones.ts`, `src/services/milestones.test.ts`
- Modify: `src/services/goalCard.ts`, `src/services/gameTracker.ts`, `src/services/finalCard.ts`

**Pure detection** — `detectMilestones(input): Milestone[]` where
```ts
interface MilestoneInput {
  goal: LandingGoal;                 // the goal being posted
  goalsSoFar: LandingGoal[];         // all goals in the game up to and including this one, in order
  periodType: string;                // 'REG' | 'OT' | 'SO'
  gameType: number;                  // 1 pre, 2 regular, 3 playoffs
  isPrimaryTeam: boolean;
  careerBefore?: { goals: number; points: number }; // career totals before THIS GAME, regular season, if known
}
interface Milestone { kind: 'hat_trick' | 'four_goal' | 'ot_winner' | 'first_nhl_goal' | 'season_goals' | 'career_goals' | 'career_points'; label: string; celebrate: boolean }
```
Rules:
- `hat_trick`: this player's goal count in `goalsSoFar` (by `playerId`, excluding `SO` period goals) is exactly 3 → label `🧢🧢🧢 HAT TRICK! {First Last}'s 3rd of the night`. Exactly 4 → `four_goal`, label `🧢🧢🧢🧢 FOUR-GOAL GAME! {First Last}`. 5+ → `four_goal` with `{n}-GOAL GAME!`.
- `ot_winner`: `periodType === 'OT'` → `OT WINNER!`. Never for `SO`.
- `season_goals`: `goal.goalsToDate` ∈ {20, 30, 40, 50, 60, 70} and `gameType === 2` → `{n}th goal of the season`.
- Career (all require `careerBefore` and `gameType === 2`): `careerAfterGoals = careerBefore.goals + (this player's regular goals in goalsSoFar)`, `careerAfterPoints = careerBefore.points + (this player's goals + assists in goalsSoFar)` where an assist is any `assists[].playerId === playerId`. `first_nhl_goal` if `careerAfterGoals === 1` → `FIRST NHL GOAL!`. `career_goals` if `careerAfterGoals % 100 === 0` → `Career goal #{n}`. `career_points` if `careerAfterPoints` ∈ {100, 250, 500, 750, 1000, 1500} → `Career point #{n}`. A first NHL goal suppresses `career_goals`/`career_points` for the same goal.
- `celebrate` is `isPrimaryTeam` for every milestone. Non-primary goals still get `hat_trick`, `four_goal`, `ot_winner` (factual tags) but no other kinds.

**Career cache** in `gameTracker.ts`: `TrackerContext` gets `careerCache: Map<number, { goals: number; points: number }>` cleared on every transition into `LIVE`. At goal-post time, if the scorer is on the primary team and not in the cache, call `nhlClient.getPlayerStats(playerId)` and store `careerTotals.regularSeason.{goals, points}` (log a warning and skip career milestones if the call fails or fields are missing). Because the NHL API updates career totals only after the game, the cached value is treated as "before this game".

**Card styling** in `goalCard.ts`: `buildGoalCard` takes an optional `milestones?: Milestone[]`. When non-empty: prepend a line to the embed description with the labels joined by ` • `, prefixed with `🎉 ` when any `celebrate` is true; set color `0xFFD700` (gold) when any `celebrate` is true, otherwise leave the existing color. In `minimal_embed`/`wrap_scores` modes the banner still appears (it names the scorer and count only, never the score).

**Final card**: when `boxscore.periodDescriptor.periodType === 'SO'` (or the equivalent field in `BoxscoreResponse`; add an optional field to the type if needed), append `🥅 Won in a shootout` to the description; for `OT`, `⏱️ Won in overtime`. Keep score display subject to spoiler mode as today.

**Tests** (`milestones.test.ts`): hat trick on the 3rd goal but not 2nd or 4th; four-goal; SO goals ignored for hat trick; OT winner; season 20th; first NHL goal (careerBefore.goals 0); career goal 100 computed with 2 earlier goals in the same game; career point 500 via an assist earlier plus this goal; preseason/playoffs yield no season/career milestones; non-primary team yields only factual tags with `celebrate: false`.

**Done when** `npm test` and `npm run build` pass, and the simulator (`docs/plans/2026-02-02-tusky-bot-design.md` / `src/services/simulator.ts`, `!sim` command) shows a hat-trick card with three caps.

---

### Task 3: Auto-attach goal replays

**Files**
- Modify: `src/services/gameTracker.ts`, `src/services/goalCard.ts`

**Behaviour**
- `buildGoalCard` accepts optional `replayUrl?: string`; when present, append a field or final description line `▶ [Watch replay]({url})`.
- In `gameTracker.ts`, when the delayed goal post runs: if `landingGoal.highlightClipSharingUrl` is already set, pass it as `replayUrl`. Otherwise `send()` the card, keep the returned `Message`, and start a poll: every 60 s, up to 20 attempts (20 min), call `nhlClient.getLanding(gameId)`, find the goal by `eventId`, and when `highlightClipSharingUrl` appears, rebuild the card with the same data + `replayUrl` and `message.edit({ content, embeds })`. Stop polling on success, after 20 attempts, or on `stopTracker`/`stopAllTrackers` (track active poll timers on the `TrackerContext` and clear them).
- Only use `highlightClipSharingUrl` (nhl.com links); never `pptReplayUrl`/`playbackUrl` (see comment in `src/bot/commands/replay.ts`).
- Milestone banner from Task 2 must survive the edit (rebuild with the same `milestones` array captured at post time).
- Poll failures (network) are logged at `warn` and the poll continues.

**Tests**: extract the "find goal's replay URL in a landing response" step into a pure helper `findReplayUrl(landing, eventId): string | undefined` in `goalCard.ts` (or a small `replay.ts` service) with `node:test` cases: URL present, URL absent, goal not found. The poll loop is verified manually with the simulator or a live game.

**Done when** `npm test` and `npm run build` pass and a goal card in the simulator (or the next live game) gets its replay link added in place.
