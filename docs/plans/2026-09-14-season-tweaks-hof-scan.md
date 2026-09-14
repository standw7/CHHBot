# Season Tweaks + HoF Backfill Scan

Approved in chat 2026-09-14. Two small tasks + one medium task.

## Global Constraints

- TypeScript, discord.js v14, better-sqlite3, pino, luxon. Tests: `node:test` + `node:assert/strict`, files `src/services/*.test.ts`, run with `npm test`. Write/adjust tests before implementation.
- `npm run build` must pass; never commit `dist/` (controller builds at deploy).
- Config columns: add in `src/db/database.ts` migration block (guarded `ALTER TABLE`), type in `src/db/models.ts` `GuildConfig`, expose in `src/bot/commands/config.ts` (`setting` choices + `switch` case with validation).
- Follow existing patterns; no unrelated refactors.

---

### Task 1: Opponent milestones limited to hat trick / multi-goal

**Files**: `src/services/milestones.ts`, `src/services/milestones.test.ts`

- In `detectMilestones`, for `isPrimaryTeam === false` return ONLY `hat_trick` / `four_goal` (the goal-count tags). `ot_winner`, `season_goals`, `first_nhl_goal`, `career_goals`, `career_points` require `isPrimaryTeam`.
- Keep `celebrate: isPrimaryTeam` semantics as-is (opponent tags stay un-celebrated: no 🎉, no gold).
- Tests: update the existing non-primary test(s) so an opponent OT goal yields `[]`, an opponent hat trick yields exactly one `hat_trick` with `celebrate: false`, and an opponent 20th-of-season goal yields `[]`.

---

### Task 2: Season window by configured dates (+ playoff extension)

**Files**: `src/services/dailyCard.ts`, `src/services/dailyCard.test.ts`, `src/db/database.ts`, `src/db/models.ts`, `src/bot/commands/config.ts`, `README.md`

- New `guild_config` columns: `season_start TEXT DEFAULT '2026-09-29'`, `season_end TEXT DEFAULT '2027-04-10'` (ISO `YYYY-MM-DD`). `/config set season_start` / `season_end` validate the format with luxon (`DateTime.fromISO(v).isValid` and exactly 10 chars).
- `selectDailyCard(games, todayISO, zone, window: { start: string; end: string })`:
  - `game` branch unchanged (any game today in `zone`).
  - `offday` if `window.start <= todayISO <= window.end` **OR** any game with `gameType === 3` has `gameDate >= todayISO` (playoff extension).
  - else `none`. Remove the old first/last-regular-season-game bracketing.
- Scheduler passes `{ start: config.season_start, end: config.season_end }` (fall back to the defaults above if null).
- Tests: replace the old bracketing cases with: day before `start` with preseason games only → `none`; on `start` with no game → `offday`; on `end` → `offday`; day after `end`, no playoff games → `none`; day after `end` with a future gameType 3 game → `offday`. Keep the "game today" and phrase-cycle tests.
- README: document `season_start` / `season_end` in the settings table (one line each).

---

### Task 3: `!hof scan` backfill command

**Files**: `src/bot/events/reactionAdd.ts`, `src/bot/events/messageCreate.ts`, `src/services/hofScan.ts` (new), `src/services/hofScan.test.ts` (new), `README.md`

**Refactor first** (no behaviour change): extract the induction body of the `messageReactionAdd` handler in `reactionAdd.ts` — from "Build the HoF post" through the follow-up send and `updateHofFollowup` — into an exported `async function inductMessage(message: Message, guildId: string, config: GuildConfig): Promise<boolean>` that returns `true` when it posted. The reaction handler calls it after its existing threshold/duplicate checks. `HOF_EMOJIS` becomes exported.

**Pure helper** in `src/services/hofScan.ts`: `qualifiesForHof(reactionCounts: Array<{ emojiName: string | null; count: number }>, threshold: number, hofEmojis: string[]): boolean` — true if any qualifying emoji count `>= threshold`. Tests: meets threshold on 🔥; meets on 😂; non-qualifying emoji with high count → false; below threshold → false.

**Scanner** in `hofScan.ts`: `scanForMissedHof(guild: Guild, config: GuildConfig, sinceISO: string): Promise<ScanCandidate[]>` where `ScanCandidate = { message: Message; channelName: string; topCount: number }`:
- Iterate `guild.channels.cache` text channels (`ChannelType.GuildText`) the bot can view and read history in; skip `config.hof_channel_id`.
- Per channel, `channel.messages.fetch({ limit: 100, before })` pages newest→oldest; stop when a page is empty or its oldest message `createdTimestamp < since` (drop messages older than `since`).
- Candidate if `qualifiesForHof(message.reactions.cache.map(r => ({ emojiName: r.emoji.name, count: r.count })), threshold, HOF_EMOJIS)` and `!hasMessageBeenInducted(guildId, message.id)` and author is not a bot.
- Return sorted by `createdTimestamp` ascending. Log per-channel counts at info; catch and log (warn) per-channel fetch errors and continue.

**Command** in `messageCreate.ts` `handlePrefixHof`: `!hof scan <YYYY-MM-DD> [go]` (admin, same `ManageGuild` gate as the other subcommands):
- Validate the date (luxon ISO, valid, not in the future). Refuse without a date; add the usage line to the `!hof help` text.
- Reply "Scanning…" then run `scanForMissedHof`.
- Dry run (no `go`): reply with `Found N messages since <date> that qualify and were never inducted.` followed by up to 20 lines `#channel — <count> reactions — <jump url>` and, if N > 0, `Run \`!hof scan <date> go\` to post them.`
- With `go`: for each candidate oldest→newest call `inductMessage`; wait 1500 ms between posts; on error log warn and continue. Final reply: `Inducted X of N.`
- Cap: if N > 50 in `go` mode, post only the first 50 and say so.

README: add `!hof scan` to the HoF section.

**Done when** `npm test` and `npm run build` pass, and the reaction handler's behaviour is unchanged (same checks, now delegating to `inductMessage`).
