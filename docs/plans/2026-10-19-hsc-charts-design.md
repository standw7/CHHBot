# Game Score Impact Card + TOI chart — design

**Date:** 2026-10-19
**Status:** approved in chat, pending spec review

## Goal

After every Utah game, post two charts to the server's news channel (#mammoth-news) **and** gameday channel:

1. **Game Score Impact Card**: HockeyStatCards' (HSC) own image, reposted with credit.
2. **Time against opponents (TOI) chart**: 5v5 head-to-head minutes for every Utah skater vs every opponent skater, rendered by Tusky from NHL shift data.

Requested by members in the server (they saw both on HSC's X account, which only posts them for some games).

## Findings that shaped the design

- HSC posts the Game Score Impact Card for **every team, every game** on Bluesky (`hockeystatcards.com`), text: `#NHL Game Score Impact Card for Utah Mammoth on 2026-10-17: …`. Checked 2026-10-19: **9/9** Utah games this season have one. Bluesky's public AppView API (`public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed`) needs no auth and serves full-size images.
- The TOI chart is only on X occasionally. HSC's website renders it client-side from private server functions (no public API); scraping it would be fragile.
- The TOI chart is reproducible from the NHL's public shift charts (`api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=<id>`). For 2026-10-17 EDM @ UTA (2026020133), our per-second 5v5 overlap matched HSC's chart exactly on 7/7 sampled cells (e.g. Weegar vs Draisaitl 11.3, Sergachev vs Bouchard 12.6). Shift totals matched boxscore TOI exactly (Weegar 22:38).
- VM: x86_64, Node 20, ~350 MB free. No headless browser; SVG → PNG via `@resvg/resvg-js` (prebuilt native binary, small memory footprint).

## Part 1: Game Score Impact Card (Bluesky watcher)

**New:** `src/services/hscBluesky.ts`

- Poll `getAuthorFeed?actor=hockeystatcards.com&limit=30` every 5 minutes (started in `index.ts` with the other services).
- Pure filter `isTeamImpactCard(text, teamName)`: true when text contains `Game Score Impact Card for <teamName>`. `teamName` = the guild's `primary_team` full name from the standings (`teamName.default`, e.g. `Utah Mammoth`); if standings are unavailable that poll is skipped and retried.
- Skip reposts (feed items with a `reason`) and posts without an `app.bsky.embed.images` embed.
- Post the image's `fullsize` URL as an embed image (no download needed; Bluesky CDN URLs are stable) with:
  - title: `📊 Game Score Impact Card · <date from post>`
  - description: `via HockeyStatCards`, linked to the post (`https://bsky.app/profile/hockeystatcards.com/post/<rkey>`)
- Post to every guild whose `primary_team` matches, to `news_channel_id` and `gameday_channel_id` (skip a channel that isn't configured).
- **Dedup:** table `hsc_posts_seen(post_uri TEXT PRIMARY KEY, seen_at TEXT)`. Claim (INSERT OR IGNORE) before posting. **First run seeds** all currently visible posts as seen without posting (no backfill of old cards).
- Errors (network, API) are logged and retried next poll.

## Part 2: TOI chart (rendered by Tusky)

**New:** `src/services/toiChart.ts` (pure), `src/services/toiRender.ts` (SVG → PNG), hooked from `postGame.ts`.

### Data
- Shifts: `shiftcharts?cayenneExp=gameId=<id>`, using rows with `typeCode === 517` and a non-empty `duration`. Absolute seconds = `(period - 1) * 1200 + mm:ss`.
- Goalies: from the boxscore (`playerByGameStats.*.goalies`), to tell skaters from goalies.
- **Completeness check:** data is used only when, for every skater in the boxscore, summed shift duration equals boxscore `toi` (±5 s). Otherwise wait and retry.

### Calculation (pure, unit tested)
- `fiveOnFiveOverlap(shifts, goalieIds, teamA, teamB)`: walk each second of the game. A second counts when each team has exactly 5 skaters + 1 goalie on the ice (on-ice = `start <= t < end`). For each counted second, add 1 to every (Utah skater, opponent skater) pair. Returns minutes per pair.
- **Row/column order** (`orderPlayers`), mirroring HSC's layout:
  - Forwards first, then defense (position from boxscore).
  - Applied to both teams (Utah rows and opponent columns). Within each group, greedy linemate grouping on 5v5 together-time with teammates: take the player with the most 5v5 TOI, then add the teammates he shared the most 5v5 time with (2 more for forwards, 1 for defense); repeat with the remaining players. Groups keep that order.
  - Divider line between forwards and defense on both axes.
- Utah players are rows, opponent players are columns.

### Rendering
- `buildToiSvg(matrix, rows, cols, title)`: dark background, rotated column labels (`C. McDavid` style), one rounded cell per pair with the value to 1 decimal, cell shade scaled from the minimum to the maximum value in the matrix (dark brown → warm orange), footer `TIME AGAINST OPPONENTS · UTA · 5V5 MINUTES · DATA: NHL`. Tusky's own styling; no HSC branding.
- Font: bundle one open-licensed TTF (e.g. IBM Plex Sans or Inter, OFL) in `assets/fonts/`, loaded by resvg (`loadSystemFonts: false`) so output is identical locally and on the VM.
- `renderPng(svg)`: `@resvg/resvg-js` → PNG buffer, posted as an attachment `toi-<gameId>.png`.

### Trigger and posting
- In `startPostGameFollowUp` (already polls once a minute for up to an hour after the final for three stars and standings), add a third task: fetch shifts + boxscore; when complete, compute, render and post.
- Regular season and playoffs only (`gameType` 2 or 3); preseason skipped.
- Posts to the same two channels as Part 1, message title `⏱️ Time against opponents · <AWAY> @ <HOME> · <Mon D>`.
- Gives up silently (logged) after the follow-up window if shift data never completes. A restart during the window drops it, the same accepted trade-off as three stars.
- The two guild trackers each run their own follow-up; each posts to its own guild's channels (no cross-guild dedup needed).

## Dependencies

- `@resvg/resvg-js` (new). Prebuilt binaries for linux-x64 and darwin-arm64; no build step on the VM (`npm install` on the VM pulls the binary; `node_modules` isn't committed).
- One font file in `assets/fonts/`.

## Testing

- `toiChart.test.ts`: overlap on small synthetic shift sets (5v5 counted; PP/PK, empty net and goalie-pulled seconds excluded; shift boundaries end-exclusive); completeness check; ordering groups linemates; **regression fixture**: saved shift + boxscore JSON for 2026020133 reproduces HSC's sampled cells (Weegar–Draisaitl 11.3, Weegar–McDavid 11.5, Sergachev–Bouchard 12.6, Yamamoto–Bouchard 6.3, Peeke–Hyman 9.2, McBain–Draisaitl 1.6, Schmidt–Shea 7.7).
- `hscBluesky.test.ts`: filter matches Utah's card text, rejects other teams/"Top and bottom skaters" posts, rkey/link building.
- Manual: render the 10/17 chart to a PNG for review before deploying; dry run of the Bluesky filter against the live feed.

## Out of scope

- "Time with teammates" chart (can be added later from the same overlap data).
- HSC's email newsletter charts.
- Backfilling charts for games before deployment (can be run manually if wanted).

## Files touched

- New: `src/services/hscBluesky.ts`, `src/services/toiChart.ts`, `src/services/toiRender.ts`, tests for both, `assets/fonts/<font>.ttf`, test fixture JSON.
- Changed: `src/services/postGame.ts` (third follow-up task), `src/index.ts` (start/stop Bluesky watcher), `src/db/database.ts` + `queries.ts` (`hsc_posts_seen`), `src/nhl/endpoints.ts` + `client.ts` (shift charts), `package.json`, `CODEBASE_GUIDE.md`, `README.md`.
