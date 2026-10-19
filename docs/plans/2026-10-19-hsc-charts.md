# Game Score Impact Card + TOI Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every Utah game, post HSC's Game Score Impact Card (from Bluesky) and a Tusky-rendered 5v5 "time against opponents" chart to the news and gameday channels, test server first.

**Architecture:** Pure calculation/rendering modules (`toiChart.ts`, `toiRender.ts`, filter half of `hscBluesky.ts`) with unit tests; thin I/O layers that fetch NHL shift data / Bluesky feed and post to Discord. The TOI chart rides on the existing post-game follow-up loop; the Bluesky watcher is a new 5-minute interval service. A per-guild `hsc_charts_enabled` flag gates automatic posting; `!toi` / `!hsc` admin commands post on demand for testing.

**Tech Stack:** TypeScript (Node16 ESM), discord.js v14, better-sqlite3, luxon, `node --test` via tsx, new `@resvg/resvg-js`.

**Spec:** `docs/plans/2026-10-19-hsc-charts-design.md`

## Global Constraints

- Automatic posting only where `guild_config.hsc_charts_enabled = 1` (default 0). Admin test commands ignore the flag.
- Posts go to `news_channel_id` and `gameday_channel_id`; skip whichever isn't configured.
- TOI chart: regular season and playoffs only (`gameType` 2 or 3).
- 5v5 second = each team has exactly 5 skaters + 1 goalie on ice; on-ice is `start <= t < end`.
- Shift rows used: `typeCode === 517` with non-empty `duration`. Absolute seconds = `(period - 1) * 1200 + mm:ss`.
- Completeness: every boxscore skater's summed shift seconds within ±5 s of boxscore `toi`.
- Chart footer text exactly: `TIME AGAINST OPPONENTS · <TEAM> · 5V5 MINUTES · DATA: NHL`. No HockeyStatCards name/logo on the TOI chart.
- Impact card credit: `via HockeyStatCards`, linked to `https://bsky.app/profile/hockeystatcards.com/post/<rkey>`.
- Bluesky feed: `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=hockeystatcards.com&limit=30`, polled every 5 min; first run seeds without posting.
- Match text: `Game Score Impact Card for <teamName>` where teamName = standings `teamName.default` for `primary_team`.
- Commits by the user only (no Claude co-author trailer). `dist/` is committed after `npm run build`.

## Review Focus

- **Overtime is 3v3 (and empty-net 6v5)**: those seconds must not count; a regulation-only player who never plays OT keeps the same minutes. Test in Task 1.
- **Late/partial shift data** (rows with empty `duration`/`endTime` right after the final): must be reported incomplete, never rendered as a short chart. Test in Task 1.
- **A skater who dressed but had 0 5v5 seconds** (e.g. PK specialist, 7th D): omitted from the chart rather than an all-0.0 row. Test in Task 2.
- **Same initial + last name label collision** (e.g. two "J. Smith"): still distinct rows/columns keyed by playerId. Test in Task 3 (SVG contains both).
- **Non-card HSC posts that mention Utah** ("Top and bottom skaters…", commentary, reposts, replies without images): never posted. Test in Task 6.

---

### Task 1: Shift data + 5v5 overlap + completeness

**Files:**
- Create: `src/services/toiChart.ts`, `src/services/toiChart.test.ts`, `src/services/fixtures/2026020133.json`
- Modify: `src/nhl/endpoints.ts`, `src/nhl/client.ts`, `src/nhl/types.ts`

**Interfaces:**
- Produces (types.ts): `ShiftChartRow { playerId: number; firstName: string; lastName: string; teamAbbrev: string; period: number; startTime: string; endTime: string; duration: string | null; typeCode: number }`, `ShiftChartResponse { data: ShiftChartRow[] }`
- Produces (client.ts): `getShiftChart(gameId: number): Promise<ShiftChartResponse | null>` (cache TTL 30 s, `bypassCache` true); endpoint `shiftChartUrl(gameId)` → `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=<id>`
- Produces (toiChart.ts):
  - `Shift { playerId: number; team: string; start: number; end: number }`
  - `normalizeShifts(rows: ShiftChartRow[]): Shift[]` (filters typeCode 517 + non-empty duration)
  - `hasOpenShifts(rows: ShiftChartRow[]): boolean` — any 517 row with empty `duration`/`endTime`
  - `isShiftDataComplete(shifts: Shift[], boxscoreToiSec: Map<number, number>, hadOpenShifts: boolean, toleranceSec = 5): boolean` — false if `hadOpenShifts`, else every boxscore skater within tolerance
  - `FiveOnFive { against: Map<string, number>; together: Map<string, number>; toi: Map<number, number> }` — seconds; `against` key `${utahId}-${oppId}`, `together` key `${minId}-${maxId}` for same-team pairs (both teams), `toi` = each skater's 5v5 seconds.
  - `computeFiveOnFive(shifts: Shift[], goalieIds: Set<number>, team: string, opponent: string): FiveOnFive`

- [ ] **Step 1: Save the regression fixture**

Run (from repo root):
```bash
node -e "(async()=>{const s=await fetch('https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2026020133').then(r=>r.json());const b=await fetch('https://api-web.nhle.com/v1/gamecenter/2026020133/boxscore').then(r=>r.json());const keep=['playerId','firstName','lastName','teamAbbrev','period','startTime','endTime','duration','typeCode'];const p=x=>({playerId:x.playerId,name:x.name,position:x.position,toi:x.toi});const t=s=>({forwards:s.forwards.map(p),defense:s.defense.map(p),goalies:s.goalies.map(p)});require('fs').writeFileSync('src/services/fixtures/2026020133.json',JSON.stringify({shifts:s.data.map(r=>Object.fromEntries(keep.map(k=>[k,r[k]]))),box:{home:b.homeTeam.abbrev,away:b.awayTeam.abbrev,homePlayers:t(b.playerByGameStats.homeTeam),awayPlayers:t(b.playerByGameStats.awayTeam)}}))})()"
```
Expected: file exists, ~866 shift rows.

- [ ] **Step 2: Write failing tests** in `toiChart.test.ts`:
  - `regression: 10/17 EDM @ UTA matches HSC` — load fixture, `computeFiveOnFive(normalizeShifts(shifts), goalieIds, 'UTA', 'EDM')`; look up by last name; `round1(sec/60)` equals: Weegar–Draisaitl 11.3, Weegar–McDavid 11.5, Sergachev–Bouchard 12.6, Yamamoto–Bouchard 6.3, Peeke–Hyman 9.2, McBain–Draisaitl 1.6, Schmidt–Shea 7.7.
  - `3v3 overtime and 6v5 empty-net seconds are excluded` — synthetic: 5+G vs 5+G for 10 s, then period 4 with 3+G vs 3+G for 10 s, then 6 skaters vs 5+G for 10 s → each 5v5 pair = 10 s.
  - `shift end is exclusive` — shift A 0–10, shift B 10–20: no double-counted second (pair total 10 s for 0–10 window).
  - `together counts same-team pairs` — two Utah forwards on together 30 s → `together.get('<min>-<max>') === 30`.
  - `completeness: matches boxscore within 5 s` → true; off by 6 s → false; `hadOpenShifts` true → false; fixture vs its boxscore toi → true.

- [ ] **Step 3: Run** `npx tsx --test src/services/toiChart.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** endpoint/client/types and `toiChart.ts` functions above. `computeFiveOnFive` walks `t = 0 .. max(end)-1` once per second (a game is ~4,000 s × ~40 players — fine).

- [ ] **Step 5: Run** `npx tsx --test src/services/toiChart.test.ts` — Expected: PASS. Then `npm test` — all pass.

- [ ] **Step 6: Commit** `git add src/services/toiChart.ts src/services/toiChart.test.ts src/services/fixtures src/nhl && git commit -m "feat: 5v5 head-to-head TOI from NHL shift charts"`

### Task 2: Player ordering

**Files:** Modify `src/services/toiChart.ts`, `src/services/toiChart.test.ts`

**Interfaces:**
- Consumes: `FiveOnFive` (Task 1)
- Produces: `ChartPlayer { id: number; label: string; position: 'F' | 'D' }`; `orderPlayers(players: ChartPlayer[], fiveOnFive: FiveOnFive): { forwards: ChartPlayer[]; defense: ChartPlayer[] }`; `chartLabel(firstName: string, lastName: string): string` → `"C. McDavid"`.

- [ ] **Step 1: Failing tests:**
  - `forwards before defense, grouped by linemates` — synthetic together-times: F1–F2–F3 30 s each pair, F4–F5–F6 20 s, F1 has most 5v5 TOI → forwards order `[F1, F2, F3, F4, F5, F6]` (group members in descending together-time with the seed); D pairs D1–D2, D3–D4 → `[D1, D2, D3, D4]`.
  - `skaters with 0 5v5 seconds are omitted`.
  - `fixture: UTA forwards start with Yamamoto, Lee, Cooley's group and defense starts with Weegar` — sanity check against HSC's order (rows 1–3 contain Yamamoto and Lee; first defenseman is Weegar or Sergachev).
  - `chartLabel('Connor', 'McDavid') === 'C. McDavid'`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** greedy grouping: repeatedly take the remaining player with the highest `toi`, then add the `groupSize - 1` remaining teammates with the highest `together` time with that seed (groupSize 3 for F, 2 for D); positions from boxscore (`C`/`L`/`R` → F, `D` → D).
- [ ] **Step 4: Run** — PASS; `npm test` passes.
- [ ] **Step 5: Commit** `feat: order TOI chart players by linemate groups`

### Task 3: SVG chart + PNG render

**Files:**
- Create: `src/services/toiRender.ts`, `src/services/toiRender.test.ts`, `assets/fonts/IBMPlexSans-Regular.ttf`, `assets/fonts/IBMPlexSans-SemiBold.ttf`, `src/scripts/renderToiChart.ts`
- Modify: `package.json` (dependency `@resvg/resvg-js`)

**Interfaces:**
- Consumes: `ChartPlayer`, `FiveOnFive` (Tasks 1–2)
- Produces:
  - `ToiChartInput { rows: ChartPlayer[]; cols: ChartPlayer[]; rowDividerAfter: number; colDividerAfter: number; seconds: (rowId: number, colId: number) => number; teamCode: string }` (dividers = count of forwards)
  - `buildToiSvg(input: ToiChartInput): string`
  - `renderPng(svg: string): Buffer` (resvg with `font: { loadSystemFonts: false, fontFiles: [<both TTFs>], defaultFontFamily: 'IBM Plex Sans' }`, `fitTo: { mode: 'width', value: 2000 }`)
  - `cellColor(value: number, min: number, max: number): string` (hex; interpolates `#3a2418` → `#c8743a`)

Fonts: IBM Plex Sans (OFL), from `https://github.com/IBM/plex/raw/master/packages/plex-sans/fonts/complete/ttf/` (Regular + SemiBold); add `assets/fonts/OFL.txt`.

Aesthetic (spec): background `#1c1b1f`; rounded cells (rx 4) with ~4 px gaps; values 1 decimal, light text `#f2e6dc`; row labels right-aligned `#b9b4bd`; column labels rotated −55°; 1 px dividers `#55505c` after forwards on both axes; footer letter-spaced (`letter-spacing` 2) muted `#8c8794`, uppercase.

- [ ] **Step 1: Failing tests:**
  - `cellColor(min) === '#3a2418'`, `cellColor(max) === '#c8743a'`, midpoint strictly between; `min === max` doesn't divide by zero.
  - `svg contains every row and column label, values to 1 decimal, and the exact footer` (`TIME AGAINST OPPONENTS · UTA · 5V5 MINUTES · DATA: NHL`), and no `HockeyStatCards`.
  - `label collision: two players labelled 'J. Smith' both appear` (count occurrences = 2).
  - `renderPng returns a PNG` (first 8 bytes = PNG signature) for a 2×2 input.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3:** `npm install @resvg/resvg-js`, add fonts, implement `toiRender.ts`. Escape label text for XML (`&`, `<`, `'`).
- [ ] **Step 4: Run** — PASS; `npm test` passes; `npm run build` clean.
- [ ] **Step 5: Manual render:** `src/scripts/renderToiChart.ts <fixtureOrGameId> <out.png>` builds from the fixture (or live game) and writes a PNG. Run `npx tsx src/scripts/renderToiChart.ts 2026020133 /tmp/toi.png`, open it, compare with HSC's chart (user's screenshot). Iterate on spacing/colors until it reads as clean as HSC's. Show the user.
- [ ] **Step 6: Commit** `feat: render TOI chart as HSC-style SVG/PNG`

### Task 4: Flag + chart loading + `!toi` test command

**Files:**
- Create: `src/services/toiPost.ts`
- Modify: `src/db/database.ts`, `src/db/models.ts`, `src/db/queries.ts` (`hsc_charts_enabled`), `src/bot/events/messageCreate.ts` (`!toi`), `src/bot/commands/config.ts` (setting choice `hsc_charts_enabled`)

**Interfaces:**
- Produces (toiPost.ts):
  - `loadToiChart(gameId: number, teamCode: string): Promise<{ png: Buffer; title: string } | 'incomplete' | null>` — fetches `getShiftChart` + `getBoxscore`; `null` if the team isn't in the game or data missing; `'incomplete'` per Task 1 check. Title: `⏱️ Time against opponents · <AWAY> @ <HOME> · <Mon D>` (date from boxscore `gameDate`, luxon `LLL d`).
  - `latestCompletedGameId(teamCode: string): Promise<number | null>` — latest `gameType` 2/3 game with state `OFF`/`FINAL` from `getSchedule`.
  - `postToChannels(client: Client, guildId: string, payload: MessageCreateOptions): Promise<void>` — sends to news + gameday channels if configured.
- `GuildConfig.hsc_charts_enabled: number` (migration `ALTER TABLE guild_config ADD COLUMN hsc_charts_enabled INTEGER DEFAULT 0`).

- [ ] **Step 1:** Migration + model + `upsertGuildConfig` insert column; add `hsc_charts_enabled` to `/config` choices (0/1). `npm run build` clean.
- [ ] **Step 2: Implement** `toiPost.ts` and `!toi last` / `!toi <gameId>` (Manage Server only; replies with the PNG attachment `toi-<gameId>.png` + title in the current channel; `'incomplete'` → "Shift data for that game isn't complete yet."; `null` → "Couldn't load that game.").
- [ ] **Step 3: Verify:** `npm test` passes; `npm run build` clean.
- [ ] **Step 4: Deploy (no live game: check schedule first, skip if LIVE/CRIT)**, on the VM run `npm install` (pulls the resvg binary), restart, set `hsc_charts_enabled = 1` for guild `…3584` only. In the test server, run `!toi last` and `!toi 2026020133`; user reviews the look. Iterate on Task 3 styling if asked.
- [ ] **Step 5: Commit** `feat: !toi test command and hsc_charts_enabled flag`

### Task 5: Post TOI chart after each game

**Files:** Modify `src/services/postGame.ts`, `src/services/gameTracker.ts`

**Interfaces:**
- Consumes: `loadToiChart`, `postToChannels` (Task 4)
- `PostGameFollowUp` gains `gameType: number`; `handleFinal` passes it.

- [ ] **Step 1:** In `startPostGameFollowUp`, add `toiDone` (initially true unless `gameType` is 2/3 and the guild has `hsc_charts_enabled = 1`). Each tick: `loadToiChart(f.gameId, f.teamCode)`; on a result, `postToChannels` with the PNG + title and set `toiDone`; on `'incomplete'`/`null`, retry next tick. Keep looping while any of stars/standings/TOI is pending; log `'TOI chart gave up'` at the end if not done.
- [ ] **Step 2: Verify:** `npm test`, `npm run build`. Simulate: run the follow-up logic for a finished game in a scratch script against the test guild (or wait for the next Utah game) and confirm posts in #news and #game-day.
- [ ] **Step 3: Commit** `feat: post TOI chart after Utah games`

### Task 6: Bluesky impact-card watcher + `!hsc last`

**Files:**
- Create: `src/services/hscBluesky.ts`, `src/services/hscBluesky.test.ts`
- Modify: `src/db/database.ts`, `src/db/queries.ts` (`hsc_posts_seen`), `src/index.ts`, `src/bot/events/messageCreate.ts`

**Interfaces:**
- `ImpactCardPost { uri: string; rkey: string; text: string; imageUrl: string; createdAt: string }`
- `parseImpactCards(feed: unknown, teamName: string): ImpactCardPost[]` (pure; skips items with `reason` (reposts), replies, posts without `app.bsky.embed.images#view`; uses `images[0].fullsize`)
- `isTeamImpactCard(text: string, teamName: string): boolean`
- `buildImpactCardEmbed(post: ImpactCardPost): EmbedBuilder` — title `📊 Game Score Impact Card · <date in text>`, description `[via HockeyStatCards](https://bsky.app/profile/hockeystatcards.com/post/<rkey>)`, image `imageUrl`.
- `startHscWatcher(client: Client): void`, `stopHscWatcher(): void`, `latestImpactCard(teamName: string): Promise<ImpactCardPost | null>`
- Queries: `isHscPostSeen(uri)`, `markHscPostSeen(uri): boolean` (claim), `hasAnyHscPostSeen(): boolean` (first-run seeding).

- [ ] **Step 1: Failing tests** (`hscBluesky.test.ts`, using a small saved feed JSON built inline): Utah card matches; Edmonton card rejected; "Top and bottom skaters…" rejected; repost (item with `reason`) rejected; post without images rejected; rkey from `at://did:plc:x/app.bsky.feed.post/3abc` is `3abc`; embed title contains `2026-10-17` and link uses the rkey.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Watcher: every 5 min, for each guild with `hsc_charts_enabled = 1`, teamName from standings; fetch feed; if `!hasAnyHscPostSeen()`, mark all current card URIs seen and return; else for each unseen card (oldest first) `markHscPostSeen` then `postToChannels`. `!hsc last` (Manage Server): post `latestImpactCard` embed in the current channel.
- [ ] **Step 4: Run** — PASS; `npm test`, `npm run build`.
- [ ] **Step 5: Deploy** (live-game check), verify in the test server: `!hsc last` shows the 10/17 or latest Utah card; logs show seeding on first poll and no posts for old cards.
- [ ] **Step 6: Commit** `feat: repost HSC Game Score Impact Cards from Bluesky`

### Task 7: Docs + rollout

**Files:** `CODEBASE_GUIDE.md`, `README.md`, `CLAUDE.md` (VM needs `npm install` for resvg)

- [ ] **Step 1:** Guide entries for `toiChart.ts`, `toiRender.ts`, `toiPost.ts`, `hscBluesky.ts`; README: `!toi`, `!hsc`, `hsc_charts_enabled`; CLAUDE.md deploy note: run `npm install` on the VM when `package.json` changes.
- [ ] **Step 2: Commit + push.**
- [ ] **Step 3: After the user approves the test-server results:** set `hsc_charts_enabled = 1` for Clean Hits Hockey (`…5556`) and confirm the next game posts in 🗞️│mammoth-news and 📺│mammoth-game-day-chat.
