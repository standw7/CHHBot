Build Tusky, a Discord bot for a single “primary team” per server that (1) posts delayed, spoiler-safe live goal cards and a final game summary card, (2) supports quick media commands (for goal gifs, player memes, etc.), (3) answers “next game” and “where to watch,” (4) fetches the most recent goal replay/highlight on demand, and (5) curates a “hall of fame” by reposting messages that hit 5 fire reactions.

Key implementation choices that should be locked early:
	•	Use ! prefix commands
	•	Use NHL “api-web” endpoints (unofficial/undocumented but widely used) for schedule, play-by-play, boxscore, landing, replays, and TV schedule. TrustyBot is a bot that does hockey stuff already. The goal here is to make a bot that has everything in one place. 
	•	Treat “spoiler safety” as a product feature: combine delay, optional spoiler-wrapped text (Discord ||spoiler||), and reduced info in embeds when spoiler mode is enabled (because embeds themselves can’t truly be hidden by spoiler tags). These should all be things that can be toggled.  ￼

This will be for a single team (the Utah Mammoth). 

⸻

PRD: Tusky Discord bot (hockey server)

1) Purpose

Tusky enhances a hockey Discord server’s game-day experience by:
	•	Posting timely but spoiler-controlled goal notifications and final summaries.
	•	Providing quick “utility” commands: next game, watch info, highlights.
	•	Adding lightweight community curation: a hall-of-fame repost workflow.

2) Goals and non-goals

Goals
	1.	Live scoring cards (goal events) with configurable spoiler delay.
	2.	End-of-game summary card (final score, shots, stars if available).
	3.	Commands:
	•	!goal and configurable media shortcuts (e.g., !yams for yamamoto, !goal for a generic gif of a goal, !bainer for McBain, etc).
	•	!next for next scheduled game.
	•	!watch for viewing options.
	•	!replay / highlight for latest goal video.
	4.	Spoiler controls via:
	•	Delay (default 30s).
	•	Optional spoiler-wrapped score line.
	•	Optional “minimal embed” mode.
	5.	Hall of fame: repost messages when they reach 5 fire reactions.

3) Users and permissions

Personas
	•	Server member: wants hype, info, and clips without being spoiled.
	•	Game-thread regular: wants near-real-time updates but with delay.
	•	Server admin/mod: wants configuration and guardrails.

Permissions
Tusky requires:
	•	Read messages / view channels (where it operates)
	•	Send messages + embed links
	•	Attach files (optional, only if you later host your own media)
	•	Read message history (for hall-of-fame repost and context)
	•	Add reactions (optional; not required)
	•	Manage webhooks (not required; optional)

Hall of fame also requires:
	•	Access to source channels to fetch the original message content
	•	Access to the hall-of-fame channel to repost

4) Data sources (external)

Primary: NHL api-web endpoints (unofficial):
	•	Schedule for a team: /v1/club-schedule-season/{team}/now  ￼
	•	Live play-by-play: /v1/gamecenter/{game-id}/play-by-play  ￼
	•	Boxscore: /v1/gamecenter/{game-id}/boxscore  ￼
	•	Landing (often includes richer “game hub” data): /v1/gamecenter/{game-id}/landing  ￼
	•	Goal replay info: /v1/ppt-replay/goal/{game-id}/{event-number}  ￼
	•	TV schedule: /v1/network/tv-schedule/now and /v1/network/tv-schedule/{date}  ￼

Important reliability note: these endpoints are not formally supported, so build with graceful degradation and feature flags.

5) Configuration model (per Discord server)

Store per-guild config in a DB (SQLite acceptable for single-instance; Postgres recommended for hosted/multi-server).

Required settings
	•	primaryTeam (NHL team code, e.g., “EDM”, “NYR”)
	•	gameDayChannelId (where goal + final cards post)
	•	hallOfFameChannelId
	•	spoilerDelaySeconds (default 30)
	•	spoilerMode enum:
	•	off (no spoiler wrapping; still delayed)
	•	wrap_scores (wrap score lines in || ||)
	•	minimal_embed (embeds exclude score; score only appears spoiler-wrapped)
	•	commandMode enum:
	•	slash_only (recommended)
	•	slash_plus_prefix (enables !goal style)

Optional settings
	•	watchProviderOverrides (manual mapping for services if NHL feed lacks clarity)
	•	gifCommandRegistry (map command -> list of media URLs; randomized response)
	•	rateLimitPolicy (e.g., max 1 highlight fetch per 10s per channel)
	•	language/locale (defaults English)
	•	timezone (for next output formatting; default guild preferred locale)

6) Feature requirements

⸻

Feature A: Media commands (goal gifs, player memes)

A1. Command behavior

Primary interface
	•	Exclamation mark: !gif name:<key> OR dedicated command shortcuts !goal, /yams, etc.

Response rules
	1.	Tusky replies in-channel with:
	•	A randomly selected media item associated with that key.
	2.	If the key is unknown:
	•	Do not reply with anything 
	3.	Media types supported:
	•	Direct GIF URL
	•	MP4 URL
	•	Discord-uploaded attachment references (v2; not required)
	4.	Cooldown:
	•	Per-user per-command cooldown 5 seconds to prevent spam.

A2. Admin management

Admin-only commands:
	•	!gif add key:<key> url:<mediaUrl>
	•	!gif remove key:<key> url:<mediaUrl>
	•	!gif list key:<key>
	•	!gif keys

Acceptance criteria
	•	Given 3 URLs registered for goal, when a user invokes goal, Tusky posts one of the 3 URLs; distribution should be approximately uniform over time.

⸻

Feature B: Live scorecard updates (goal cards)

Tusky posts a rich embed card for each goal scored in the tracked game(s) for the configured team.

B1. Event detection

Tusky must identify goals using NHL play-by-play:
	•	Poll /v1/gamecenter/{game-id}/play-by-play during live games.  ￼
	•	Identify new goal events by unique tuple: (gameId, eventNumber) or (gameId, eventId) depending on payload.
	•	Deduplicate: never post the same goal twice, even after bot restart.

Polling policy (v1)
	•	If game state is “LIVE”: poll every 10 seconds.
	•	If game state is “PRE”: poll every 5 minutes until within 30 minutes of puck drop, then every 60 seconds.
	•	If game state is “FINAL”: stop polling; post final summary once.

B2. Spoiler delay

When a new goal is detected, schedule a post for now + spoilerDelaySeconds (default 30s).

Hard requirements
	•	Delay must be configurable per guild.
	•	Delay applies to:
	•	Auto-posted goal cards
	•	Auto-posted final summary
	•	Manual commands (e.g., !replay) should not be artificially delayed, but should respect spoilerMode (wrap score text).

B3. Goal card embed format

Match the shape shown in your examples:

Embed title (example)
<TeamName> #<ScorerNumber> <StrengthDescriptor> (<StrengthCode>) Goal

Embed description line
#<ScorerNumber> <ScorerName> (<GoalCount>) <ShotType> assists: #<A1Number> <A1Name> (<A1Count>), #<A2Number> <A2Name> (<A2Count>)

Embed fields
	•	Home team:
	•	Goals: <int>
	•	Shots: <int>
	•	Away team:
	•	Goals: <int>
	•	Shots: <int>
	•	Game clock:
	•	<MM:SS> left in the <Period> period (or “OT”, “SO”)

Embed footer
	•	Game start | <local time> (optional on goal cards; required on final summary)

Team logo
	•	Embed thumbnail or right-side image set to the primary team logo (if available).

SpoilerMode interaction
	•	off: include goals/shots normally in embed fields.
	•	wrap_scores: include goals/shots normally, but also send a separate one-line spoiler-wrapped score summary above the embed, e.g. ||SEA 5 - WSH 1 (shots 32-20)||. Spoiler tag syntax is ||spoiler||.  ￼
	•	minimal_embed: omit the goals/shots fields from the embed entirely; include only “Goal by X” + clock. Put score/shots only in spoiler-wrapped plain text.

Acceptance criteria
	•	Given a goal occurs at T0, Tusky posts the card at T0+delay±3s.
	•	Given two goals within the delay window, Tusky posts two cards in correct chronological order.

B4. Channel routing
	•	Goal cards post to gameDayChannelId.
	•	If the game-day channel is missing or permission denied, Tusky logs an error and posts nothing (no fallback spam).

⸻

Feature C: Final game summary (post-game card)

C1. Trigger

When game state becomes FINAL:
	•	Post one final summary card after spoilerDelaySeconds.

Source of truth:
	•	Prefer /v1/gamecenter/{game-id}/boxscore for final totals.  ￼

C2. Final card embed format

Embed title
<AwayTeam> @ <HomeTeam> Final

Fields
	•	Home team: goals, shots
	•	Away team: goals, shots
	•	Stars of the game:
	•	Up to 3 entries, each #<num> <Name> if available in payload
	•	Game start time

SpoilerMode interaction: same as Feature B.

Acceptance criteria
	•	Final card posts once per game.
	•	If stars are missing from payload, omit the section (don’t fabricate).

⸻

Feature D: next command (next game)

D1. Behavior

Command returns the next scheduled game for primaryTeam.

Data source
	•	/v1/club-schedule-season/{team}/now or /v1/club-schedule/{team}/week/now  ￼

Output content
	•	Opponent + home/away
	•	Date/time localized to guild timezone
	•	Venue (if available)
	•	Link to NHL gamecenter (constructed from gameId if needed)

Acceptance criteria
	•	If next game is within 7 days, it returns that.
	•	If season is over or schedule unavailable, return a clear message (“no upcoming games found”).

⸻

Feature E: watch command (where to watch)

This is the most evidence-fragile feature because broadcast rights are regional and feeds vary.

E1. Behavior
	•	If there is a game today (or next game within 48h), return watch info for that game.
	•	Otherwise, return watch info for the next game.

Data sources (priority order)
	1.	NHL TV schedule endpoint /v1/network/tv-schedule/{date}  ￼
	2.	Game landing payload (sometimes contains broadcast arrays) /v1/gamecenter/{game-id}/landing  ￼
	3.	Manual overrides in watchProviderOverrides

Output format
	•	National TV (if present)
	•	Local/regional TV (if present)
	•	Streaming services (if present)
	•	If only partial info: explicitly say “partial coverage data” and include what you have.

Acceptance criteria
	•	If the NHL endpoint returns entries for the game, Tusky lists them.
	•	If NHL endpoints return nothing, Tusky falls back to configured overrides.

⸻

Feature F: Spoiler-wrapping (“spoil the results”)

F1. Requirements
	•	Provide a command /spoiler on|off|wrap_scores|minimal_embed (admin-only) to set spoilerMode.
	•	When spoilerMode != off:
	•	Any plain-text score strings must be wrapped in || ||.  ￼
	•	Do not place spoiler-wrapped text inside code blocks because Discord spoiler tags won’t work there.  ￼

Note: embeds cannot be reliably hidden by spoiler tags; therefore “minimal_embed” exists.

Acceptance criteria
	•	In wrap/minimal modes, the score line is click-to-reveal.

⸻

Feature G: replay / highlight command (most recent goal video)

G1. Behavior
	•	Fetch the most recent goal event for the current live game (or most recent completed game if none live).
	•	Return a link or embed to the goal replay video.

Data sources
	•	Determine last goal event number from play-by-play.  ￼
	•	Fetch replay: /v1/ppt-replay/goal/{game-id}/{event-number}  ￼

Output requirements
	•	Post: Most recent goal: <Team> - <Scorer> (<time>) plus the replay URL (or best available media URL from replay payload).
	•	If replay endpoint fails, fall back to linking the NHL gamecenter page and say replay is unavailable.

SpoilerMode interaction
	•	If spoiler mode is on, wrap any score mention in || ||, but still return the replay link.

Acceptance criteria
	•	If a goal exists in the game, Tusky returns a replay URL within 2 seconds typical (network dependent).
	•	If no goals exist, Tusky says “no goals yet”.

⸻

Feature H: Hall of fame (5 fire reactions repost)

H1. Trigger

When any message in any configured “eligible channels” reaches 5 fire emoji reactions:
	•	Tusky reposts it to hallOfFameChannelId.

Configuration
	•	hallOfFameEligibleChannelIds: default to all text channels Tusky can see, or admin-configurable allowlist.

Deduplication
	•	Each original message can be inducted at most once.
	•	Store inducted message IDs in DB with timestamp.

H2. Repost format

In hall-of-fame channel, Tusky posts an embed containing:
	•	Original author display name + avatar
	•	Original channel name + clickable jump link
	•	Original timestamp
	•	Original content (truncate at 1,500 chars; include “(truncated)”)
	•	Attachments: include first image/video URL if present, or list attachment links
	•	Reaction count snapshot: fire: <count> at induction time

Robustness rules
	•	If the original message is deleted before induction, do nothing.
	•	If the hall-of-fame channel is missing or inaccessible, log and stop (no fallback).

Acceptance criteria
	•	On the 5th fire reaction, Tusky reposts within 5 seconds.
	•	Removing reactions after induction does not remove the hall-of-fame post (v1).

⸻

7) Command catalog (v1)

Recommended slash commands (primary):
	•	/next
	•	/watch
	•	/replay
	•	/gif name:<key>
	•	/gif add|remove|list|keys (admin)
	•	/config set team|gameday_channel|hof_channel|delay|spoiler_mode (admin)

Optional prefix aliases (only if enabled):
	•	!next, !watch, !replay
	•	!goal (maps to /gif name:goal)
	•	!<anyKey> for registered gif keys

Reason: prefix commands require reading message content from events in many configurations; Discord treats Message Content as privileged in many cases.  ￼

⸻

8) System design requirements (engineering)

8.1 Architecture
	•	Bot service (single process) with:
	•	Discord gateway client
	•	Scheduler (delayed posts, polling loops)
	•	NHL data client (HTTP with retries/backoff)
	•	Persistent store (SQLite/Postgres)
	•	Structured logging

8.2 State machines

Game lifecycle (per guild)
	1.	Resolve next/current game from schedule.
	2.	If within window (e.g., start-60m to end+60m): mark as “active”.
	3.	During active:
	•	Poll play-by-play; detect new goals; enqueue delayed posts.
	•	Periodically poll boxscore for shots, clock, status.
	4.	On final:
	•	Enqueue delayed final summary.
	•	Mark game complete; stop polling; rotate to next game.

8.3 Rate limiting and caching
	•	Cache schedule results for 5 minutes.
	•	Cache play-by-play ETag/Last-Modified if available (nice-to-have).
	•	Discord send rate: queue outbound messages per guild/channel.
	•	NHL calls: hard cap (e.g., max 6 requests/minute per active game per guild).

8.4 Reliability and failure modes
	•	If NHL API is down:
	•	Stop posting new goal cards.
	•	Commands return “data temporarily unavailable.”
	•	If Tusky restarts mid-game:
	•	On startup, load last posted eventNumber per game from DB.
	•	Resume polling without duplicate posts.

8.5 Security
	•	Store Discord bot token in environment variable / secret manager.
	•	No user PII stored beyond message IDs needed for hall-of-fame dedupe.
	•	Minimal intents requested; avoid privileged intents unless prefix mode enabled.  ￼

8.6 Observability
	•	Log each:
	•	Goal detected
	•	Goal posted (with delay)
	•	Final posted
	•	Hall-of-fame inducted
	•	API errors (status codes, retry counts)
	•	Optional: healthcheck endpoint for hosted deployments.

⸻

9) Testing and acceptance

Functional test checklist
	•	Media:
	•	Add/list/remove gif keys.
	•	Unknown key behavior.
	•	Live goals:
	•	Single goal, multiple goals, rapid successive goals.
	•	Delay accuracy.
	•	Dedup after restart.
	•	Spoilers:
	•	wrap_scores and minimal_embed outputs.
	•	Confirm spoiler tags work (not in code blocks).  ￼
	•	Watch:
	•	Data present vs absent; override fallback.
	•	Replay:
	•	Goal exists vs no goals; endpoint failure fallback.  ￼
	•	Hall of fame:
	•	Induct at exactly 5 fire reactions.
	•	Prevent re-induction.
	•	Handles attachments and long text.

Success metrics (initial)
	•	Duplicate goal posts: <0.1% of goals (per season)
	•	Median delay error: <2 seconds
	•	Command success rate: >99% when NHL endpoints reachable

⸻

10) Open questions (worth resolving before build)
	1.	One team per server (recommended) vs multi-team? Yes. Utah Mammoth.
	2.	Should Tusky post into a single channel, or detect “game-day chat” threads and post there? It should have a selected channel that it posts to. No threads as of now. It will have access to a gameday chat, a hall of fame chat, and a bot commands chat
	3.	For spoilerMode: do you want minimal embeds by default to avoid accidental embed-based spoilers? Don't default to it but this should be a option if we want to turn it on in the future. 
	4.	For hall of fame: should mods be able to veto/remove an induction (v2)? No, they will be able to delete messages in that channel if needed. 

Reference URLS

Discord spoiler tags syntax and limitations:
https://support.discord.com/hc/en-us/articles/360022320632-Spoiler-Tags

Discord message content privileged intent FAQ:
https://support-dev.discord.com/hc/en-us/articles/4404772028055-Message-Content-Privileged-Intent-FAQ

Unofficial NHL api-web endpoint reference (includes schedule, gamecenter, replays, TV schedule):
https://github.com/Zmalski/NHL-API-Reference