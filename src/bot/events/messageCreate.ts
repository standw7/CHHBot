import { Message } from 'discord.js';
import type { Client } from 'discord.js';
import { getGuildConfig, getGifUrls } from '../../db/queries.js';
import * as nextCmd from '../commands/next.js';
import * as watchCmd from '../commands/watch.js';
import * as replayCmd from '../commands/replay.js';
import pino from 'pino';

const logger = pino({ name: 'prefix-commands' });

// Cooldown tracking for prefix gif commands
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 5000;

export function registerMessageHandler(client: Client): void {
  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (!message.content.startsWith('!')) return;

    const config = getGuildConfig(message.guild.id);
    if (!config || config.command_mode !== 'slash_plus_prefix') return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args[0]?.toLowerCase();
    if (!command) return;

    try {
      switch (command) {
        case 'tusky':
          await handlePrefixHelp(message);
          break;
        case 'next':
          await handlePrefixNext(message);
          break;
        case 'watch':
          await handlePrefixWatch(message);
          break;
        case 'replay':
          await handlePrefixReplay(message);
          break;
        case 'stats':
          await handlePrefixStats(message, args.slice(1));
          break;
        case 'gif':
          await handlePrefixGifAdmin(message, args.slice(1));
          break;
        case 'feed':
          await handlePrefixFeed(message, args.slice(1));
          break;
        case 'sim':
          await handlePrefixSim(message, args.slice(1));
          break;
        case 'gameday':
          await handlePrefixGameday(message);
          break;
        case 'player':
          await handlePrefixPlayer(message, args.slice(1));
          break;
        case 'standings':
          await handlePrefixStandings(message, args.slice(1));
          break;
        case 'schedule':
          await handlePrefixSchedule(message, args.slice(1));
          break;
        default:
          // Check if it's a registered gif key
          await handlePrefixGif(message, command);
          break;
      }
    } catch (error) {
      logger.error({ error, command }, 'Prefix command error');
    }
  });
}

async function handlePrefixStats(message: Message, args: string[]): Promise<void> {
  const { buildStatsEmbed, buildStatsHelpEmbed } = await import('../../services/statsLookup.js');

  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const query = args.join(' ');

  if (!query || query.toLowerCase() === 'help') {
    const embed = buildStatsHelpEmbed();
    await message.reply({ embeds: [embed] });
    return;
  }

  const embed = await buildStatsEmbed(teamCode, query);
  await message.reply({ embeds: [embed] });
}

async function handlePrefixHelp(message: Message): Promise<void> {
  const { EmbedBuilder } = await import('discord.js');
  const { listGifKeys } = await import('../../db/queries.js');
  const guildId = message.guild!.id;

  const gifKeys = listGifKeys(guildId);
  const gifKeysText = gifKeys.length > 0
    ? gifKeys.map(k => `\`!${k}\``).join(', ')
    : 'None registered yet';

  const embed = new EmbedBuilder()
    .setTitle('Tusky Commands')
    .setColor(0x006847)
    .addFields(
      { name: 'Game Info', value: '`!next` - Next game\n`!watch` - Where to watch\n`!replay` - Latest goal replay\n`!schedule [n]` - Upcoming games', inline: false },
      { name: 'Stats & Standings', value: '`!stats [category]` - Team stat leaders\n`!player <name>` - Player lookup\n`!standings [filter]` - Playoff picture', inline: false },
      { name: 'Notifications', value: '`!gameday` - Toggle gameday role', inline: false },
      { name: 'Media Commands', value: `\`!<key>\` - Post random gif\nRegistered keys: ${gifKeysText}`, inline: false },
      { name: 'Gif Management (Admin)', value: '`!gif add key:<k> url:<u>` - Add gif\n`!gif remove key:<k> url:<u>` - Remove gif\n`!gif list key:<k>` - List URLs\n`!gif keys` - List all keys', inline: false },
      { name: 'News Feeds (Admin)', value: '`!feed add <url> [label]` - Add feed\n`!feed remove <label>` - Remove feed\n`!feed list` - List feeds\n`!feed status` - Check feed health\n`!feed reset <label>` - Reset tracking', inline: false },
      { name: 'Testing (Admin)', value: '`!sim` - Run game simulation\n`!sim reset` - Reset simulation', inline: false },
      { name: 'Config (Admin)', value: '`/config show` - View settings\n`/config set` - Change settings', inline: false },
      { name: 'Help', value: '`!tusky help` - Show this message', inline: false },
    )
    .setFooter({ text: 'Tusky - Utah Mammoth Hockey Bot' });

  await message.reply({ embeds: [embed] });
}

async function handlePrefixNext(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const timezone = config?.timezone ?? 'America/Denver';

  const { getSchedule } = await import('../../nhl/client.js');
  const { gamecenterWebUrl } = await import('../../nhl/endpoints.js');
  const { EmbedBuilder } = await import('discord.js');

  const schedule = await getSchedule(teamCode);
  if (!schedule?.games?.length) {
    await message.reply('No upcoming games found.');
    return;
  }

  const now = new Date();
  const nextGame = schedule.games.find(g => {
    const gameDate = new Date(g.startTimeUTC);
    return gameDate > now && (g.gameState === 'FUT' || g.gameState === 'PRE');
  });

  if (!nextGame) {
    await message.reply('No upcoming games found.');
    return;
  }

  const gameDate = new Date(nextGame.startTimeUTC);
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
  });
  const formattedTime = gameDate.toLocaleTimeString('en-US', {
    timeZone: timezone, hour: 'numeric', minute: '2-digit',
  });

  const isHome = nextGame.homeTeam.abbrev === teamCode;
  const opponent = isHome ? nextGame.awayTeam : nextGame.homeTeam;

  const embed = new EmbedBuilder()
    .setTitle('Next Game')
    .setDescription(`**${nextGame.awayTeam.abbrev}** @ **${nextGame.homeTeam.abbrev}**`)
    .addFields(
      { name: 'Opponent', value: opponent.abbrev, inline: true },
      { name: 'Location', value: isHome ? 'Home' : 'Away', inline: true },
      { name: 'Date', value: formattedDate, inline: true },
      { name: 'Time', value: formattedTime, inline: true },
    )
    .setURL(gamecenterWebUrl(nextGame.id))
    .setColor(0x006847);

  if (nextGame.venue?.default) {
    embed.addFields({ name: 'Venue', value: nextGame.venue.default, inline: true });
  }

  await message.reply({ embeds: [embed] });
}

async function handlePrefixWatch(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';

  const { getSchedule, getTvSchedule, getLanding } = await import('../../nhl/client.js');
  const { EmbedBuilder } = await import('discord.js');

  const schedule = await getSchedule(teamCode);
  if (!schedule?.games?.length) {
    await message.reply('No games found for broadcast info.');
    return;
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  let targetGame = schedule.games.find(g => {
    const gameDate = g.gameDate || g.startTimeUTC.split('T')[0];
    return gameDate === todayStr;
  });
  if (!targetGame) {
    targetGame = schedule.games.find(g => new Date(g.startTimeUTC) > now);
  }
  if (!targetGame) {
    await message.reply('No current or upcoming games found.');
    return;
  }

  const gameDate = targetGame.gameDate || targetGame.startTimeUTC.split('T')[0];
  const tvSchedule = await getTvSchedule(gameDate);
  let broadcasts: { network: string; market: string }[] = [];

  if (tvSchedule?.games) {
    const tvGame = tvSchedule.games.find(g => g.id === targetGame!.id);
    if (tvGame?.tvBroadcasts) {
      broadcasts = tvGame.tvBroadcasts.map(b => ({ network: b.network, market: b.market }));
    }
  }

  if (broadcasts.length === 0) {
    const landing = await getLanding(targetGame.id);
    if (landing?.tvBroadcasts) {
      broadcasts = landing.tvBroadcasts.map(b => ({ network: b.network, market: b.market }));
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Where to Watch')
    .setDescription(`**${targetGame.awayTeam.abbrev}** @ **${targetGame.homeTeam.abbrev}**`)
    .setColor(0x006847);

  if (broadcasts.length === 0) {
    embed.addFields({ name: 'Broadcast Info', value: 'No broadcast data available.' });
  } else {
    const national = broadcasts.filter(b => b.market === 'N' || b.market === 'national');
    const home = broadcasts.filter(b => b.market === 'H' || b.market === 'home');
    const away = broadcasts.filter(b => b.market === 'A' || b.market === 'away');

    if (national.length > 0) embed.addFields({ name: 'National TV', value: national.map(b => b.network).join(', '), inline: true });
    if (home.length > 0) embed.addFields({ name: 'Home TV', value: home.map(b => b.network).join(', '), inline: true });
    if (away.length > 0) embed.addFields({ name: 'Away TV', value: away.map(b => b.network).join(', '), inline: true });
  }

  await message.reply({ embeds: [embed] });
}

async function handlePrefixReplay(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const spoilerMode = (config?.spoiler_mode ?? 'off') as 'off' | 'wrap_scores' | 'minimal_embed';

  const { getSchedule, getLanding } = await import('../../nhl/client.js');
  const { gamecenterWebUrl } = await import('../../nhl/endpoints.js');
  const { wrapScore } = await import('../../services/spoiler.js');
  const { EmbedBuilder } = await import('discord.js');

  const schedule = await getSchedule(teamCode);
  if (!schedule?.games?.length) {
    await message.reply('No games found.');
    return;
  }

  let targetGame = schedule.games.find(g => g.gameState === 'LIVE' || g.gameState === 'CRIT');
  if (!targetGame) {
    const now = new Date();
    const pastGames = schedule.games
      .filter(g => (g.gameState === 'FINAL' || g.gameState === 'OFF') && new Date(g.startTimeUTC) <= now)
      .sort((a, b) => new Date(b.startTimeUTC).getTime() - new Date(a.startTimeUTC).getTime());
    targetGame = pastGames[0];
  }
  if (!targetGame) {
    await message.reply('No current or recent games found.');
    return;
  }

  const landing = await getLanding(targetGame.id);
  if (!landing?.summary?.scoring) {
    await message.reply('Could not fetch game data.');
    return;
  }

  const allGoals: Array<{ firstName: { default: string }; lastName: { default: string }; teamAbbrev: { default: string }; timeInPeriod: string; highlightClipSharingUrl?: string; pptReplayUrl?: string; headshot?: string }> = [];
  for (const period of landing.summary.scoring) {
    allGoals.push(...period.goals);
  }

  if (allGoals.length === 0) {
    await message.reply('No goals yet in this game.');
    return;
  }

  const lastGoal = allGoals[allGoals.length - 1];
  const scorerName = `${lastGoal.firstName.default} ${lastGoal.lastName.default}`;
  const replayUrl = lastGoal.highlightClipSharingUrl || lastGoal.pptReplayUrl;
  const scoreLine = `${landing.awayTeam.abbrev} ${landing.awayTeam.score} - ${landing.homeTeam.abbrev} ${landing.homeTeam.score}`;

  let description = `**Most recent goal:** ${scorerName} (${lastGoal.teamAbbrev.default}) - ${lastGoal.timeInPeriod}`;
  if (spoilerMode !== 'off') {
    description += `\n${wrapScore(scoreLine, spoilerMode)}`;
  } else {
    description += `\n${scoreLine}`;
  }

  if (replayUrl) {
    description += `\n\n[Watch Replay](${replayUrl})`;
  } else {
    description += `\n\nReplay unavailable. [View on NHL.com](${gamecenterWebUrl(targetGame.id)})`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Replay - ${landing.awayTeam.abbrev} @ ${landing.homeTeam.abbrev}`)
    .setDescription(description)
    .setColor(0x006847);

  if (lastGoal.headshot) embed.setThumbnail(lastGoal.headshot);

  await message.reply({ embeds: [embed] });
}

async function handlePrefixFeed(message: Message, args: string[]): Promise<void> {
  const { PermissionFlagsBits, EmbedBuilder } = await import('discord.js');
  const { addFeedSource, removeFeedSource, getFeedSources } = await import('../../db/queries.js');

  const guildId = message.guild!.id;
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'help') {
    await message.reply(
      '**Feed Commands:**\n' +
      '`!feed add <twitter/x profile URL>` - Add a Twitter/X account (admin)\n' +
      '`!feed add <rss url> <label>` - Add a generic RSS feed (admin)\n' +
      '`!feed remove <label>` - Remove a feed (admin)\n' +
      '`!feed list` - List all registered feeds\n' +
      '`!feed status` - Check health of all feeds (admin)\n' +
      '`!feed reset <label>` - Reset a feed to re-post latest item (admin)\n\n' +
      'Feeds post to the configured news channel. Set it with:\n' +
      '`/config set setting:news_channel value:#channel`'
    );
    return;
  }

  if (sub === 'list') {
    const feeds = getFeedSources(guildId);
    if (feeds.length === 0) {
      await message.reply('No feeds registered yet. Use `!feed add <url> <label>` to add one.');
      return;
    }
    const list = feeds.map((f, i) => `${i + 1}. **${f.label}** - ${f.url}`).join('\n');
    await message.reply(`**Registered Feeds:**\n${list}`);
    return;
  }

  if (sub === 'status') {
    const feeds = getFeedSources(guildId);
    if (feeds.length === 0) {
      await message.reply('No feeds registered yet.');
      return;
    }

    await message.reply('Checking feed status...');
    const RssParser = (await import('rss-parser')).default;
    const parser = new RssParser();

    const results: string[] = [];
    for (const feed of feeds) {
      // Wrap label in backticks to prevent Discord from parsing as mention
      const safeLabel = `\`${feed.label}\``;
      try {
        const rssFeed = await parser.parseURL(feed.url);
        const itemCount = rssFeed.items?.length || 0;
        const latestItem = rssFeed.items?.[0];
        const latestTitle = latestItem?.title?.slice(0, 50) || 'No title';
        const latestDate = latestItem?.pubDate ? new Date(latestItem.pubDate).toLocaleString() : 'Unknown';
        const hasLastId = feed.last_item_id ? '✓' : '✗';

        results.push(`✅ ${safeLabel}\n   Items: ${itemCount} | Latest: ${latestDate}\n   Tracking: ${hasLastId} | "${latestTitle}..."`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push(`❌ ${safeLabel}\n   Error: ${errMsg.slice(0, 100)}`);
      }
    }

    await message.reply({ content: `**Feed Status:**\n\n${results.join('\n\n')}`, allowedMentions: { repliedUser: true, parse: [] } });
    return;
  }

  // Admin-only from here
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission to manage feeds.');
    return;
  }

  if (sub === 'add') {
    const input = args[1];
    if (!input) {
      await message.reply(
        'Usage:\n' +
        '`!feed add https://x.com/username` - Add a Twitter/X account\n' +
        '`!feed add <rss url> <label>` - Add a generic RSS feed'
      );
      return;
    }

    // Detect Twitter/X profile URLs or @username
    const twitterMatch = input.match(/(?:https?:\/\/(?:www\.)?(x\.com|twitter\.com)\/)?([@]?)([\w]+)\/?$/i);
    const isTwitterUrl = /https?:\/\/(www\.)?(x\.com|twitter\.com)\//i.test(input);
    const isAtHandle = input.startsWith('@');

    if (isTwitterUrl || isAtHandle) {
      const username = twitterMatch?.[3];
      if (!username) {
        await message.reply('Could not extract username from that URL.');
        return;
      }

      await message.reply(`Checking RSS bridges for **@${username}**...`);

      const { tryTwitterRssBridges } = await import('../../services/feedBridge.js');
      const result = await tryTwitterRssBridges(username);

      if (!result) {
        await message.reply(
          `Could not find a working RSS feed for **@${username}**. Twitter RSS bridges can be unreliable.\n` +
          'You can try adding a specific RSS URL manually: `!feed add <rss-url> <label>`'
        );
        return;
      }

      const label = args.slice(2).join(' ') || `@${username}`;
      addFeedSource(guildId, result.url, label, message.author.id);
      await message.reply(`Added **${label}** using ${result.bridge}.\nFeed URL: ${result.url}`);
    } else {
      // Generic RSS feed
      const label = args.slice(2).join(' ');
      if (!label) {
        await message.reply('For non-Twitter feeds, provide a label: `!feed add <url> <label>`');
        return;
      }
      addFeedSource(guildId, input, label, message.author.id);
      await message.reply(`Added feed **${label}**.`);
    }
  } else if (sub === 'remove') {
    const label = args.slice(1).join(' ');
    if (!label) {
      await message.reply('Usage: `!feed remove <label>`');
      return;
    }
    const removed = removeFeedSource(guildId, label);
    await message.reply(removed ? `Removed feed **${label}**.` : `Feed "${label}" not found.`);
  } else if (sub === 'reset') {
    const label = args.slice(1).join(' ');
    if (!label) {
      await message.reply('Usage: `!feed reset <label>` - Resets tracking so the next poll posts the latest item');
      return;
    }
    const { resetFeedLastItem } = await import('../../db/queries.js');
    const reset = resetFeedLastItem(guildId, label);
    await message.reply(reset ? `Reset feed **${label}**. Next poll will post the latest item.` : `Feed "${label}" not found.`);
  } else {
    await message.reply('Unknown subcommand. Use `!feed help` for usage.');
  }
}

async function handlePrefixSim(message: Message, args: string[]): Promise<void> {
  const { PermissionFlagsBits } = await import('discord.js');
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission to run simulations.');
    return;
  }

  const sub = args[0]?.toLowerCase();

  if (sub === 'reset') {
    const { resetSimulation } = await import('../../services/simulator.js');
    resetSimulation(message.guild!.id);
    await message.reply('Simulation data reset. You can run `!sim` again.');
    return;
  }

  await message.reply('Starting game simulation. Goal cards will post to the gameday channel with your configured spoiler delay...');
  const { runSimulation } = await import('../../services/simulator.js');
  runSimulation(message.client, message.guild!.id).catch(err => {
    logger.error({ err }, 'Simulation error');
  });
}

async function handlePrefixPlayer(message: Message, args: string[]): Promise<void> {
  const { searchPlayers, getPlayerStats, getClubStats } = await import('../../nhl/client.js');
  const { EmbedBuilder } = await import('discord.js');

  const query = args.join(' ');
  if (!query) {
    await message.reply('Usage: `!player <name>` (e.g., `!player Keller`)');
    return;
  }

  // Search for player
  const results = await searchPlayers(query);
  if (!results || results.length === 0) {
    await message.reply(`No player found matching "${query}".`);
    return;
  }

  // Get the first active player, or just the first result
  const player = results.find(p => p.active) || results[0];
  const playerId = parseInt(player.playerId, 10);

  // Fetch detailed stats
  const stats = await getPlayerStats(playerId);
  if (!stats) {
    await message.reply(`Could not fetch stats for ${player.name}.`);
    return;
  }

  // Fetch club stats to get season TOI and FO%
  let seasonToi: string | null = null;
  let seasonFoPct: string | null = null;
  if (stats.currentTeamAbbrev) {
    const clubStats = await getClubStats(stats.currentTeamAbbrev);
    if (clubStats?.skaters) {
      const playerClubStats = clubStats.skaters.find(s => s.playerId === playerId);
      if (playerClubStats) {
        // Convert seconds to MM:SS
        const toiSeconds = playerClubStats.avgTimeOnIcePerGame;
        if (toiSeconds > 0) {
          const mins = Math.floor(toiSeconds / 60);
          const secs = Math.round(toiSeconds % 60);
          seasonToi = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        // FO% - already a percentage (0.51 = 51%)
        if (playerClubStats.faceoffWinPctg > 0) {
          const foPct = playerClubStats.faceoffWinPctg > 1
            ? playerClubStats.faceoffWinPctg
            : playerClubStats.faceoffWinPctg * 100;
          seasonFoPct = foPct.toFixed(1);
        }
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${stats.firstName.default} ${stats.lastName.default}`)
    .setColor(0x006847);

  if (stats.headshot) {
    embed.setThumbnail(stats.headshot);
  }

  // Basic info
  const position = stats.position === 'G' ? 'Goalie' :
    stats.position === 'D' ? 'Defenseman' :
    stats.position === 'C' ? 'Center' :
    stats.position === 'L' ? 'Left Wing' :
    stats.position === 'R' ? 'Right Wing' : stats.position;

  const heightFt = Math.floor(stats.heightInInches / 12);
  const heightIn = stats.heightInInches % 12;

  let info = `**#${stats.sweaterNumber}** | **${position}** | **${stats.currentTeamAbbrev || 'FA'}**\n`;
  info += `${heightFt}'${heightIn}" | ${stats.weightInPounds} lbs | Shoots: ${stats.shootsCatches}\n`;
  const birthplace = stats.birthStateProvince?.default
    ? `${stats.birthCity.default}, ${stats.birthStateProvince.default}, ${stats.birthCountry}`
    : `${stats.birthCity.default}, ${stats.birthCountry}`;
  info += `Born: ${birthplace}`;

  embed.setDescription(info);

  // Season stats
  const seasonStats = stats.featuredStats?.regularSeason?.subSeason;
  if (seasonStats) {
    if (stats.position === 'G') {
      // Goalie stats
      const gaa = seasonStats.goalsAgainstAvg?.toFixed(2) || '0.00';
      const svPct = seasonStats.savePctg ? (seasonStats.savePctg * 100).toFixed(1) : '0.0';
      embed.addFields({
        name: '2024-25 Season',
        value: `GP: **${seasonStats.gamesPlayed}** | W: **${seasonStats.wins}** | L: **${seasonStats.losses}** | OT: **${seasonStats.otLosses}**\n` +
               `GAA: **${gaa}** | SV%: **${svPct}%** | SO: **${seasonStats.shutouts}**`,
        inline: false,
      });
    } else {
      // Skater stats
      const spct = seasonStats.shootingPctg
        ? (seasonStats.shootingPctg > 1 ? seasonStats.shootingPctg.toFixed(1) : (seasonStats.shootingPctg * 100).toFixed(1))
        : '0.0';

      // Use season TOI and FO% from club stats (not career averages)
      const avgToi = seasonToi || 'N/A';

      let statsText = `GP: **${seasonStats.gamesPlayed}** | G: **${seasonStats.goals}** | A: **${seasonStats.assists}** | P: **${seasonStats.points}**\n` +
               `+/-: **${seasonStats.plusMinus > 0 ? '+' : ''}${seasonStats.plusMinus}** | PIM: **${seasonStats.pim}** | Shots: **${seasonStats.shots}** | S%: **${spct}%**\n` +
               `PPG: **${seasonStats.powerPlayGoals}** | TOI: **${avgToi}**`;
      if (seasonFoPct) {
        statsText += ` | FO%: **${seasonFoPct}%**`;
      }
      embed.addFields({
        name: '2024-25 Season',
        value: statsText,
        inline: false,
      });
    }
  }

  // Last 5 games
  if (stats.last5Games && stats.last5Games.length > 0) {
    const last5Lines = stats.last5Games.slice(0, 5).map(g => {
      const date = new Date(g.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (stats.position === 'G') {
        const decision = g.decision || '-';
        const svPct = g.savePctg ? (g.savePctg * 100).toFixed(1) : '-';
        return `${date} vs ${g.opponentAbbrev}: **${decision}** | ${g.goalsAgainst} GA | ${svPct}%`;
      } else {
        return `${date} vs ${g.opponentAbbrev}: **${g.goals}G ${g.assists}A** | ${g.plusMinus && g.plusMinus > 0 ? '+' : ''}${g.plusMinus || 0} | ${g.shots || 0} SOG`;
      }
    });
    embed.addFields({
      name: 'Last 5 Games',
      value: last5Lines.join('\n'),
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
}

async function handlePrefixStandings(message: Message, args: string[]): Promise<void> {
  const { getStandings } = await import('../../nhl/client.js');
  const { EmbedBuilder } = await import('discord.js');

  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';

  const standings = await getStandings();
  if (!standings?.standings) {
    await message.reply('Could not fetch standings.');
    return;
  }

  const filter = args[0]?.toLowerCase();

  // Find the user's team to get their division/conference
  const userTeam = standings.standings.find(t => t.teamAbbrev.default === teamCode);
  const userDivision = userTeam?.divisionName || 'Central';
  const userConference = userTeam?.conferenceName || 'Western';

  // Helper to format a team line
  const formatTeam = (team: typeof standings.standings[0], rank: number | string, showDiff?: number) => {
    const streak = team.streakCode === 'OT' ? 'OT' : `${team.streakCode}${team.streakCount}`;
    const highlight = team.teamAbbrev.default === teamCode ? '**' : '';
    let line = `${rank}. ${highlight}${team.teamAbbrev.default}${highlight} | ${team.gamesPlayed} | ${team.wins}-${team.losses}-${team.otLosses} | ${team.points}`;
    if (showDiff !== undefined && showDiff !== 0) {
      line += ` (${showDiff > 0 ? '+' : ''}${showDiff})`;
    }
    return line;
  };

  let embed: InstanceType<typeof EmbedBuilder>;

  const header = '`   Team | GP | W-L-OT | PTS`\n\n';

  if (filter === 'league' || filter === 'nhl') {
    // Show top 16 league-wide
    const sorted = [...standings.standings].sort((a, b) => b.points - a.points).slice(0, 16);
    const lines = sorted.map((team, i) => formatTeam(team, i + 1));
    embed = new EmbedBuilder()
      .setTitle('NHL Standings (Top 16)')
      .setDescription(header + lines.join('\n'))
      .setColor(0x006847);
  } else {
    // Playoff picture - default to user's conference, or specified conference
    let conference = userConference;
    if (filter === 'east' || filter === 'eastern') {
      conference = 'Eastern';
    } else if (filter === 'west' || filter === 'western') {
      conference = 'Western';
    }

    const confTeams = standings.standings.filter(t => t.conferenceName === conference);

    // Get divisions in this conference
    const div1Name = conference === 'Western' ? 'Central' : 'Atlantic';
    const div2Name = conference === 'Western' ? 'Pacific' : 'Metropolitan';

    const div1Teams = confTeams.filter(t => t.divisionName === div1Name).sort((a, b) => b.points - a.points);
    const div2Teams = confTeams.filter(t => t.divisionName === div2Name).sort((a, b) => b.points - a.points);

    // Top 3 from each division make playoffs
    const div1Playoff = div1Teams.slice(0, 3);
    const div2Playoff = div2Teams.slice(0, 3);

    // Wild card: remaining teams sorted by points, top 2 get in
    const wildCardEligible = [...div1Teams.slice(3), ...div2Teams.slice(3)].sort((a, b) => b.points - a.points);
    const wildCardIn = wildCardEligible.slice(0, 2);
    const wildCardChase = wildCardEligible.slice(2, 8); // Next 6 teams chasing

    // Calculate point difference from WC2 cutoff
    const wc2Points = wildCardIn[1]?.points || 0;

    let description = header;
    description += `**${div1Name} Division**\n`;
    div1Playoff.forEach((team, i) => {
      description += formatTeam(team, i + 1) + '\n';
    });

    description += `\n**${div2Name} Division**\n`;
    div2Playoff.forEach((team, i) => {
      description += formatTeam(team, i + 1) + '\n';
    });

    description += `\n**Wild Card**\n`;
    wildCardIn.forEach((team, i) => {
      description += formatTeam(team, `WC${i + 1}`) + '\n';
    });

    description += `\n**In The Hunt**\n`;
    wildCardChase.forEach((team, i) => {
      const diff = team.points - wc2Points;
      description += formatTeam(team, i + 1, diff) + '\n';
    });

    embed = new EmbedBuilder()
      .setTitle(`${conference} Conference Playoff Picture`)
      .setDescription(description)
      .setColor(0x006847)
      .setFooter({ text: 'Points diff from WC2 | !standings [west|east|league]' });
  }

  await message.reply({ embeds: [embed] });
}

async function handlePrefixSchedule(message: Message, args: string[]): Promise<void> {
  const { getSchedule } = await import('../../nhl/client.js');
  const { EmbedBuilder } = await import('discord.js');

  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const timezone = config?.timezone ?? 'America/Denver';

  const count = parseInt(args[0], 10) || 7;
  const maxGames = Math.min(count, 15);

  const schedule = await getSchedule(teamCode);
  if (!schedule?.games?.length) {
    await message.reply('No games found in the schedule.');
    return;
  }

  const now = new Date();
  const upcomingGames = schedule.games
    .filter(g => new Date(g.startTimeUTC) > now || g.gameState === 'LIVE' || g.gameState === 'CRIT')
    .slice(0, maxGames);

  if (upcomingGames.length === 0) {
    await message.reply('No upcoming games found.');
    return;
  }

  const lines = upcomingGames.map(game => {
    const gameDate = new Date(game.startTimeUTC);
    const dateStr = gameDate.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeStr = gameDate.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    });

    const isHome = game.homeTeam.abbrev === teamCode;
    const opponent = isHome ? game.awayTeam.abbrev : game.homeTeam.abbrev;
    const location = isHome ? 'vs' : '@';

    let status = `${dateStr} ${timeStr}`;
    if (game.gameState === 'LIVE' || game.gameState === 'CRIT') {
      status = '🔴 LIVE';
    } else if (game.gameState === 'FINAL' || game.gameState === 'OFF') {
      status = 'FINAL';
    }

    return `${status} | **${location} ${opponent}**`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${teamCode} Upcoming Schedule`)
    .setDescription(lines.join('\n'))
    .setColor(0x006847)
    .setFooter({ text: `Use: !schedule [number] to show more games (max 15)` });

  await message.reply({ embeds: [embed] });
}

async function handlePrefixGameday(message: Message): Promise<void> {
  const { upsertGuildConfig } = await import('../../db/queries.js');

  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const member = message.member;

  if (!member) {
    await message.reply('Could not find your member information.');
    return;
  }

  const GAMEDAY_ROLE_NAME = 'Gameday';

  // Find or create the gameday role
  let role = message.guild!.roles.cache.find(r => r.name === GAMEDAY_ROLE_NAME);

  if (!role) {
    // Check if we have permissions to create roles
    const botMember = message.guild!.members.me;
    if (!botMember?.permissions.has('ManageRoles')) {
      await message.reply(`The "${GAMEDAY_ROLE_NAME}" role doesn't exist and I don't have permission to create it. Ask an admin to create it.`);
      return;
    }

    // Create the role
    try {
      role = await message.guild!.roles.create({
        name: GAMEDAY_ROLE_NAME,
        mentionable: true,
        reason: 'Created for gameday notifications',
      });
      // Save role ID to config
      upsertGuildConfig(guildId, { gameday_role_id: role.id });
      logger.info({ guildId, roleId: role.id }, 'Created Gameday role');
    } catch (error) {
      logger.error({ error }, 'Failed to create Gameday role');
      await message.reply('Failed to create the Gameday role. Check bot permissions.');
      return;
    }
  } else if (!config?.gameday_role_id) {
    // Role exists but not saved in config
    upsertGuildConfig(guildId, { gameday_role_id: role.id });
  }

  // Toggle role on member
  const hasRole = member.roles.cache.has(role.id);

  try {
    if (hasRole) {
      await member.roles.remove(role);
      await message.reply(`Removed the **${GAMEDAY_ROLE_NAME}** role. You won't be pinged when games start.`);
    } else {
      await member.roles.add(role);
      await message.reply(`Added the **${GAMEDAY_ROLE_NAME}** role! You'll be pinged when games start.`);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to toggle Gameday role');
    await message.reply('Failed to update your role. The bot may not have permission to manage roles.');
  }
}

async function handlePrefixGif(message: Message, key: string): Promise<void> {
  const guildId = message.guild!.id;
  const userId = message.author.id;

  // Check cooldown
  const cooldownKey = `${userId}-${key}`;
  const lastUsed = cooldowns.get(cooldownKey);
  if (lastUsed && Date.now() - lastUsed < COOLDOWN_MS) {
    return; // Silent cooldown for prefix commands
  }

  const urls = getGifUrls(guildId, key);
  if (urls.length === 0) {
    return; // Silent - unknown key, do nothing per PRD
  }

  const url = urls[Math.floor(Math.random() * urls.length)];
  cooldowns.set(cooldownKey, Date.now());
  if (message.channel.isSendable()) {
    await message.channel.send(url);
  }
}

async function handlePrefixGifAdmin(message: Message, args: string[]): Promise<void> {
  // Parse: !gif add key:<key> url:<url>
  // or: !gif remove key:<key> url:<url>
  // or: !gif list key:<key>
  // or: !gif keys
  const { PermissionFlagsBits } = await import('discord.js');
  const { addGifUrl, removeGifUrl, listGifKeys, listGifUrlsForKey } = await import('../../db/queries.js');

  const guildId = message.guild!.id;
  const sub = args[0]?.toLowerCase();

  if (!sub) {
    await message.reply('Usage: `!gif add key:<key> url:<url>` | `!gif remove key:<key> url:<url>` | `!gif list key:<key>` | `!gif keys`');
    return;
  }

  if (sub === 'keys') {
    const keys = listGifKeys(guildId);
    if (keys.length === 0) {
      await message.reply('No gif keys registered yet.');
      return;
    }
    await message.reply(`**Registered keys:** ${keys.join(', ')}`);
    return;
  }

  // Parse key: and url: from remaining args
  const fullArgs = args.slice(1).join(' ');
  const keyMatch = fullArgs.match(/key:(\S+)/);
  const urlMatch = fullArgs.match(/url:(\S+)/);
  const key = keyMatch?.[1]?.toLowerCase();

  if (sub === 'list') {
    if (!key) {
      await message.reply('Usage: `!gif list key:<key>`');
      return;
    }
    const entries = listGifUrlsForKey(guildId, key);
    if (entries.length === 0) {
      await message.reply(`No media for **${key}**.`);
      return;
    }
    const list = entries.map((e, i) => `${i + 1}. ${e.url}`).join('\n');
    await message.reply(`**${key}** (${entries.length}):\n${list}`);
    return;
  }

  // Admin-only from here
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission.');
    return;
  }

  const url = urlMatch?.[1];

  if (sub === 'add') {
    if (!key || !url) {
      await message.reply('Usage: `!gif add key:<key> url:<url>`');
      return;
    }
    addGifUrl(guildId, key, url, message.author.id);
    await message.reply(`Added media to **${key}**.`);
  } else if (sub === 'remove') {
    if (!key || !url) {
      await message.reply('Usage: `!gif remove key:<key> url:<url>`');
      return;
    }
    const removed = removeGifUrl(guildId, key, url);
    await message.reply(removed ? `Removed from **${key}**.` : `URL not found for **${key}**.`);
  } else if (sub === 'delete') {
    if (!key) {
      await message.reply('Usage: `!gif delete key:<key>` - Deletes ALL URLs for a key');
      return;
    }
    const { deleteGifKey } = await import('../../db/queries.js');
    const count = deleteGifKey(guildId, key);
    await message.reply(count > 0 ? `Deleted **${key}** (${count} URLs removed).` : `Key **${key}** not found.`);
  } else if (sub === 'rename') {
    // Parse old:<oldkey> new:<newkey>
    const oldMatch = fullArgs.match(/old:(\S+)/);
    const newMatch = fullArgs.match(/new:(\S+)/);
    const oldKey = oldMatch?.[1]?.toLowerCase();
    const newKey = newMatch?.[1]?.toLowerCase();
    if (!oldKey || !newKey) {
      await message.reply('Usage: `!gif rename old:<oldkey> new:<newkey>`');
      return;
    }
    const { renameGifKey } = await import('../../db/queries.js');
    const count = renameGifKey(guildId, oldKey, newKey);
    await message.reply(count > 0 ? `Renamed **${oldKey}** to **${newKey}** (${count} URLs).` : `Key **${oldKey}** not found.`);
  }
}
