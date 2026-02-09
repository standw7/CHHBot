# Tusky - Utah Mammoth Hockey Discord Bot

Tusky is a Discord bot built for hockey servers. It posts live goal notifications, game info, media commands, a hall of fame, and a news feed -- all in one place.

---

## Table of Contents
- [Configuring Tusky in Your Server](#configuring-tusky-in-your-server)
  - [Required Setup](#required-setup)
  - [All Settings](#all-settings)
- [Commands](#commands)
  - [Game Info Commands](#game-info-commands)
  - [Stats Commands](#stats-commands)
  - [Gameday Notifications](#gameday-notifications)
  - [Player Lookup](#player-lookup)
  - [Standings](#standings)
  - [Schedule](#schedule)
  - [Media / GIF Commands](#media--gif-commands)
  - [News Feed Commands](#news-feed-commands)
  - [Admin Commands](#admin-commands)
- [Features](#features)
  - [Live Goal Cards](#live-goal-cards)
  - [Game Start & Period Notifications](#game-start--period-notifications)
  - [Final Game Summary](#final-game-summary)
  - [Hall of Fame](#hall-of-fame)
  - [Auto Link Fix](#auto-link-fix)
  - [News Feed](#news-feed)
  - [Spoiler Mode](#spoiler-mode)
- [Testing With the Simulator](#testing-with-the-simulator)
- [Troubleshooting](#troubleshooting)

---

## What Tusky Does

- **Live goal cards** -- When your team scores during a game, Tusky posts a card in your game day channel showing who scored, the assists, the score, and the time.
- **Final game summary** -- After the game ends, Tusky posts a summary with the final score, shots, and stars of the game.
- **Game info** -- Ask Tusky when the next game is, where to watch it, or get a replay of the latest goal.
- **Media commands** -- Set up custom commands for goal GIFs, player memes, and celebrations. Type `!goal` and Tusky posts a random goal GIF.
- **Hall of Fame** -- When a message in your server gets 5 fire reactions, Tusky automatically reposts it to a special Hall of Fame channel.
- **News feed** -- Register Twitter/X accounts or RSS feeds and Tusky posts new content to a news channel.
- **Auto link fix** -- When someone posts a Twitter/X link, Tusky automatically replies with a version that actually embeds properly in Discord.
- **Spoiler protection** -- Configurable delay and spoiler tags so people watching on a stream delay don't get spoiled.

## Configuring Tusky in Your Server

### Required Setup

After inviting Tusky, you need to tell it which channels to use. Run these slash commands in your server (type `/` and you'll see them in the autocomplete):

**Set your game day channel** (where goal cards and game summaries post):
```
/config set setting:gameday_channel value:#game-day
```

**Set your Hall of Fame channel:**
```
/config set setting:hof_channel value:#hall-of-fame
```

**Set your news channel** (where feed posts go):
```
/config set setting:news_channel value:#news
```

**Verify your settings:**
```
/config show
```

### All Settings

| Setting | What it does | Options | Default |
|---------|-------------|---------|---------|
| `team` | Which NHL team to track | Any NHL team code (e.g., UTA, EDM, NYR) | UTA |
| `gameday_channel` | Channel for goal cards and game summaries | Any channel | Not set |
| `hof_channel` | Channel for Hall of Fame reposts | Any channel | Not set |
| `bot_channel` | Channel for bot admin commands | Any channel | Not set |
| `news_channel` | Channel for RSS/Twitter feed posts | Any channel | Not set |
| `delay` | Seconds to wait before posting a goal (spoiler protection) | 0 to 300 | 30 |
| `spoiler_mode` | How to handle scores (see [Spoiler Mode](#spoiler-mode)) | `off`, `wrap_scores`, `minimal_embed` | off |
| `command_mode` | Whether `!` prefix commands work | `slash_only`, `slash_plus_prefix` | slash_plus_prefix |
| `link_fix` | Auto-fix Twitter/X links for better embeds | `on` or `off` | on |
| `timezone` | Timezone for game times | Any timezone (e.g., America/Denver) | America/Denver |

**Examples:**
```
/config set setting:team value:UTA
/config set setting:delay value:15
/config set setting:spoiler_mode value:wrap_scores
/config set setting:link_fix value:on
/config set setting:timezone value:America/New_York
```

---

## Commands

Tusky supports both slash commands (`/command`) and prefix commands (`!command`). Prefix commands are enabled by default -- if you only want slash commands, set `command_mode` to `slash_only`.

### Game Info Commands

| Command | What it does |
|---------|-------------|
| `/next` or `!next` | Shows the next scheduled game -- opponent, date, time, venue |
| `/watch` or `!watch` | Shows where to watch the current or next game -- TV networks, streaming |
| `/replay` or `!replay` | Shows the most recent goal with scorer name, time, and a replay link |
| `!help` | Shows a list of all available commands |

### Stats Commands

Look up team stat leaders for the current season or for a specific game.

| Command | What it does |
|---------|-------------|
| `/stats [category]` or `!stats [category]` | Shows top 5 players in a stat category |
| `!stats help` | Shows all available stat categories |

**Season stats examples:**
```
!stats goals
!stats assists
!stats points
!stats hits
!stats blocks
!stats takeaways
!stats giveaways
!stats pim
!stats minutes
!stats save%
!stats wins
```

**Per-game stats** -- add a date to see leaders from a specific game:
```
!stats goals on 02/02/26
!stats hits on Jan 15
!stats blocks on 1/20/2026
```

**Available stat categories:**

| Category | Keywords |
|----------|----------|
| Goals | `goals`, `goal` |
| Assists | `assists`, `assist` |
| Points | `points`, `pts` |
| Plus/Minus | `plus-minus`, `+/-`, `plusminus` |
| Penalty Minutes | `pim`, `penalty minutes`, `penalties` |
| Hits | `hits`, `hit` |
| Blocked Shots | `blocks`, `blocked shots`, `blk` |
| Takeaways | `takeaways`, `takeaway`, `tk` |
| Giveaways | `giveaways`, `giveaway`, `gv` |
| Time on Ice | `toi`, `minutes`, `ice time` |
| Shots | `shots`, `sog` |
| Shooting % | `shooting%`, `sh%` |
| Faceoff % | `faceoff%`, `fo%` |
| Power Play Goals | `ppg`, `power play goals` |
| Shorthanded Goals | `shg`, `shorthanded goals` |
| Game Winning Goals | `gwg`, `game winning goals` |
| Overtime Goals | `otg`, `overtime goals` |
| Expected Goals | `xg`, `expected goals` |
| Goalie Wins | `wins` |
| Goals Against Avg | `gaa`, `goals against` |
| Save % | `save%`, `sv%` |
| Shutouts | `shutouts`, `so` |
| Goalie Record | `record` |

### Gameday Notifications

| Command | What it does |
|---------|-------------|
| `!gameday` | Toggle the Gameday role on yourself |

When you have the **Gameday** role, you'll be pinged when games start. Use `!gameday` again to remove the role and stop getting pinged.

The bot will automatically create the "Gameday" role if it doesn't exist (requires Manage Roles permission).

### Player Lookup

| Command | What it does |
|---------|-------------|
| `!player <name>` | Look up a player's stats |

**Examples:**
```
!player Keller
!player Connor McDavid
!player Hellebuyck
```

Shows:
- Player photo, number, position, team
- Height, weight, shoots/catches, birthplace
- **Skaters:** GP, G, A, P, +/-, PIM, Shots, S%, PPG, TOI, FO% (for players who take faceoffs)
- **Goalies:** GP, W, L, OT, GAA, SV%, SO
- Last 5 games performance

### Standings

| Command | What it does |
|---------|-------------|
| `!standings` | Show your conference's playoff picture |
| `!standings league` | Show top 16 NHL teams by points |
| `!standings west` | Western Conference playoff picture |
| `!standings east` | Eastern Conference playoff picture |

The playoff picture shows:
- Top 3 from each division (playoff spots)
- Wild Card 1 and Wild Card 2
- "In The Hunt" - next 6 teams chasing wild card spots with point difference from WC2

Shows: Rank, Team, GP, W-L-OT, PTS (and point differential for teams in the hunt)

### Schedule

| Command | What it does |
|---------|-------------|
| `!schedule` | Show next 7 upcoming games |
| `!schedule 10` | Show next 10 games |
| `!schedule 15` | Show next 15 games (max) |

Shows date, time, opponent, and home/away for each game. Live games are marked with 🔴.

### Media / GIF Commands

These let you set up custom commands for GIFs, videos, and memes.

**Using media commands (everyone):**

| Command | What it does |
|---------|-------------|
| `/gif play name:goal` | Posts a random GIF from the "goal" collection |
| `!goal` | Same thing, but shorter -- works for any registered key |
| `!yams` | Posts a random GIF from the "yams" collection |

You can create any key you want. Some ideas: `!goal`, `!celly`, `!yams`, `!bainer`, `!snipe`

There's a 5-second cooldown per person per command to prevent spam.

**Managing media commands (admin only):**

| Command | What it does |
|---------|-------------|
| `/gif add key:goal url:https://example.com/goal.gif` | Add a GIF URL to a key |
| `/gif remove key:goal url:https://example.com/goal.gif` | Remove a specific URL from a key |
| `/gif list key:goal` | See all URLs registered for a key |
| `/gif keys` | See all registered keys |

Prefix versions also work:
```
!gif add key:goal url:https://tenor.com/view/utah-hockey-club-utah-mammoth-utah-nhl-utah-mammoth-goal-utah-goal-gif-18168794736940957112
!gif remove key:goal url:https://tenor.com/view/utah-hockey-club-utah-mammoth-utah-nhl-utah-mammoth-goal-utah-goal-gif-18168794736940957112
!gif list key:goal
!gif keys
```

Each key can have multiple URLs. When someone uses the command, Tusky picks one at random.

### News Feed Commands

Register Twitter/X accounts or RSS feeds to post automatically to your news channel.

**Adding a Twitter/X account:**
```
!feed add https://x.com/NHLUtahHC
```
or
```
!feed add @NHLUtahHC
```
Tusky will automatically try multiple RSS bridges (RSSHub, Nitter instances, bird.makeup) to find a working feed for that account.

**Adding a generic RSS feed:**
```
!feed add https://example.com/feed.xml Utah News
```
The text after the URL becomes the label.

**Other feed commands:**

| Command | What it does |
|---------|-------------|
| `!feed list` | See all registered feeds |
| `!feed remove <label>` | Remove a feed by its label |
| `!feed help` | Show feed command usage |

Feeds are checked every 5 minutes. New items are posted to the configured news channel with rich embeds showing the author's profile picture, tweet text, images, and engagement stats (likes, retweets, replies).

### Admin Commands

These require the **Manage Server** permission in Discord.

| Command | What it does |
|---------|-------------|
| `/config set setting:<name> value:<value>` | Change a bot setting |
| `/config show` | View all current settings |
| `!gif add key:<key> url:<url>` | Add media to a command |
| `!gif remove key:<key> url:<url>` | Remove media from a command |
| `!feed add <url>` | Add a news feed |
| `!feed remove <label>` | Remove a news feed |
| `!sim` | Run a game simulation for testing |
| `!sim reset` | Reset simulation data |

---

## Features

### Live Goal Cards

When your team is playing, Tusky automatically watches the game. Every time a goal is scored, it posts a card in your game day channel that looks like this:

```
:uta: :mammothgoal: Utah Mammoth #9 Even Strength Goal :mammothgoal: :uta:

#9 Clayton Keller (22) wrist assists: #29 Barrett Hayton (18), #98 Mikhail Sergachev (25)

:uta: Utah Mammoth :uta:
Goals: 1
Shots: 8
Arizona Coyotes
Goals: 0
Shots: 5

:uta: 11:28 left in the 1st period
```

The card includes:
- Who scored and their season goal count
- Shot type (wrist, snap, etc.)
- Who got the assists and their season assist counts
- Current score and shots for both teams
- Time remaining in the period

**Goal emoji:** When your team scores, Tusky uses a custom `:mammothgoal:` emoji (if uploaded to your server). When the opponent scores, it uses the standard 🚨 siren emoji. Upload a custom emoji named `mammothgoal` to your server for this to work.

**Pulled goalie detection:** When a goal is scored with a pulled goalie, the card shows the actual skater situation (e.g., "6v5 Goal" or "5v6 Goal") instead of "Even Strength Goal".

Goals are posted after a configurable delay (default 30 seconds) to protect people watching on a stream delay.

### Game Start & Period Notifications

Tusky posts notifications when games and periods start:

**Game Start** -- When the game begins, Tusky posts a "Game is starting!" embed showing both teams with their season records (e.g., "UTA (25-15-5) vs EDM (30-10-3)") and pings the `@Gameday` role. Users can opt in/out of these pings with the `!gameday` command.

**Period Notifications** -- At the start of Period 2, Period 3, Overtime, and Shootout, Tusky posts an embed like "Period 2 is starting!" These do NOT ping anyone -- they're just informational.

Period 1 is not announced separately since "Game is starting!" already covers it.

### Final Game Summary

When the game ends, Tusky posts a final summary card with:
- Final score and shots for both teams
- Three stars of the game (if available from the NHL)

### Hall of Fame

When any message in your server gets **5 fire emoji reactions** (🔥), Tusky automatically reposts it to your Hall of Fame channel. The repost includes:
- The original message content
- Who posted it and their avatar
- A link back to the original message
- Which channel it was in
- The timestamp
- Any images or attachments
- The fire reaction count

Each message can only be inducted once, even if it gets more reactions later.

### Auto Link Fix

When someone posts a Twitter/X link (x.com or twitter.com), Tusky automatically replies with a fxtwitter.com version that actually embeds properly in Discord. This means everyone can see the tweet content without having to click the link.

Turn this on or off with:
```
/config set setting:link_fix value:on
/config set setting:link_fix value:off
```

### News Feed

Register Twitter accounts or RSS feeds and Tusky will post new content to your news channel every 5 minutes. Great for keeping up with team reporters, official accounts, and hockey news.

Twitter/X posts are displayed as rich embeds with:
- Author profile picture and handle
- Full tweet text
- Images and media
- Engagement stats (replies, retweets, likes)
- Timestamp that shows in your local timezone on hover

### Spoiler Mode

If people in your server watch games on a delay, you can enable spoiler mode to prevent accidental score reveals.

**`off`** (default) -- Scores shown normally in goal cards.

**`wrap_scores`** -- Scores are hidden behind Discord spoiler tags (click to reveal). The goal card embed won't show scores -- they'll only appear in spoiler-wrapped text that you have to click to see.

**`minimal_embed`** -- Same as wrap_scores. The goal card only shows who scored and the period/time, with no score anywhere in the embed.

Set it with:
```
/config set setting:spoiler_mode value:wrap_scores
```

You can also adjust the delay before goal cards post (in seconds):
```
/config set setting:delay value:60
```

---

## Testing With the Simulator

You can test all the game day features without waiting for a real game. Make sure your game day channel is configured, then run:

```
!sim
```

This posts a fake 3-goal game with goal cards and a final summary, using your configured spoiler delay. It simulates:
- "Game is starting!" notification (pings @Gameday role)
- 1st period goal by Clayton Keller (even strength)
- "Period 2 is starting!" notification
- 2nd period goal by Nick Schmaltz (power play)
- "Period 3 is starting!" notification
- 3rd period goal by Logan Cooley (even strength)
- Final summary with three stars

To run the simulation again:
```
!sim reset
!sim
```

---

## Troubleshooting

**`!` commands don't do anything:**
- Run `/config show` and check that **Command Mode** is `slash_plus_prefix`

**Goal cards aren't posting during games:**
- Make sure `gameday_channel` is set: `/config set setting:gameday_channel value:#your-channel`
- Check that the bot has permission to send messages in that channel

**Hall of Fame isn't working:**
- Make sure `hof_channel` is set: `/config set setting:hof_channel value:#your-channel`
- You need exactly the 🔥 (fire) emoji, not other fire-related emojis
- You need 5 reactions from different users (not the same person reacting 5 times)

**Feed posts aren't appearing:**
- Make sure `news_channel` is set: `/config set setting:news_channel value:#your-channel`
- Feeds are checked every 5 minutes, so it may take a few minutes for the first post
- If `!feed add` with a Twitter URL says "no RSS feed found," the RSS bridges may be temporarily down -- try again later or use a different Twitter account

**Player stats showing wrong data:**
- TOI and FO% are pulled from the current season stats, not career averages
- FO% only shows for players who have taken faceoffs this season
