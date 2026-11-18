# Tusky knowledge file

Read by Ask Tusky's LLM fallback (src/services/ask/llm.ts) on every question. Keep it short:
every line here is sent with every LLM call. Anything not here is looked up with
the live tools or a capped web search, never from the model's memory. Team facts verified Nov 2026. Links here should match CLEAN_HITS in src/services/ask/podcast.ts.

## Clean Hits Hockey (the podcast)

- Name: Clean Hits Hockey, "a Utah Mammoth podcast".
- Origin: diehard Arizona Coyotes fans who followed the team to Utah.
- Topics: prospects, the NHL draft, game breakdowns, roster construction, trade analysis, gambling best bets.
- Hosts: the members of this Discord's "Clean Hits Crew" role. When asked who hosts, say it is {crew_role}. Do not name individual hosts.
- Substack contributors: Brad, Cory and Trent have written for the Substack (for example their Utah HC midseason report cards). They are Substack writers; for "who hosts" use the role above.
- Where to watch/listen: YouTube, https://www.youtube.com/@CleanHitsHockey (main channel).
- Substack (written posts): https://cleanhits.substack.com/
- Release schedule: new episodes roughly weekly. No fixed day is known.
- The newest episode changes often. Use the get_latest_clean_hits_episode tool; never guess a title or date.
- The Substack is updated rarely. Only bring it up when someone asks about the Substack, newsletter or articles (use get_latest_clean_hits_substack_post).

## Utah Mammoth basics

- NHL team based in Salt Lake City, Utah. Home arena: Delta Center.
- Team abbreviation: UTA. Division: Central. Conference: Western.
- Joined the NHL for the 2024-25 season as the Utah Hockey Club, after the Arizona Coyotes' hockey operations moved to Utah. Renamed the Utah Mammoth for 2025-26.
- Owners: Ryan and Ashley Smith (Smith Entertainment Group).
- Mascot: Tusky, a woolly mammoth.
- Captain: Clayton Keller, the first captain in franchise history (named for 2024-25, still captain for 2026-27). Lawson Crouse wears an A as associate captain; the other A rotates (Mikhail Sergachev, Alexander Kerfoot, Nick Schmaltz have worn it).
- Head coach: André Tourigny, nicknamed "Bear". Coached the Coyotes from 2021, then Utah; signed a multiyear extension in June 2026 after a playoff run. Assistants include Blaine Forsythe and Adam Foote.
- General manager: Bill Armstrong, often "GMBA" in this server. Hired by the Coyotes in September 2020 and kept the job through the move to Utah.
- Draft trivia: Utah's first-ever draft pick was Tij Iginla, 6th overall in 2024. GMBA's first draft (2020) began with Mitchell Miller in the 4th round (111th); the team renounced his rights weeks later, and Armstrong had agreed not to run that draft. The first draft he ran was 2021, where his first pick was Dylan Guenther, 9th overall (a pick acquired from Vancouver). Logan Cooley went 3rd overall in 2022.
- Current roster, stats, schedule, standings and results: always use the tools. Rosters change.

## This Discord server

- Tusky is the server's bot, named after the team mascot. Tusky is a woolly mammoth (not a walrus). Useful commands: !next, !schedule, !standings, !player <name>, !stats <category>, !watch, !replay, !help.
