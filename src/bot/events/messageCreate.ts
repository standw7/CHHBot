import { Message, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import type { Client, User } from 'discord.js';
import { getGuildConfig, createReminder, cancelReminder, countUserReminders, getUserReminders } from '../../db/queries.js';
import { parseTime } from '../../services/parseTime.js';
import { DateTime } from 'luxon';
import * as nextCmd from '../commands/next.js';
import * as watchCmd from '../commands/watch.js';
import * as replayCmd from '../commands/replay.js';
import pino from 'pino';

const logger = pino({ name: 'prefix-commands' });

// Cooldown tracking for prefix gif commands
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 5000;

// Guilds with a `!hof scan` currently running — prevents overlapping scans/double-posting
const hofScanInFlight = new Set<string>();

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
        case 'help':
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
        case 'rewards':
          await handlePrefixRewards(message);
          break;
        case 'follow':
          await handlePrefixFollow(message, args.slice(1).join(' '));
          break;
        case 'unfollow':
          await handlePrefixUnfollow(message, args.slice(1).join(' '));
          break;
        case 'following':
          await handlePrefixFollowing(message);
          break;
        case 'followers':
          await handlePrefixFollowers(message);
          break;
        case 'toi':
          await handlePrefixToi(message, args[1]);
          break;
        case 'meter':
          await handlePrefixMeter(message, args[1]);
          break;
        case 'hsc':
          await handlePrefixHsc(message);
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
        case 'hof':
          await handlePrefixHof(message, args.slice(1));
          break;
        case 'remind':
          await handlePrefixRemind(message, args.slice(1));
          break;
        case 'reminders':
          await handlePrefixReminders(message);
          break;
        case 'ask': {
          const { handlePrefixAsk } = await import('../../services/ask/admin.js');
          await handlePrefixAsk(message, args.slice(1));
          break;
        }
        default:
          // Check if it's a registered gif key
          await handlePrefixGif(message, command, args[1]);
          break;
      }
    } catch (error) {
      logger.error({ error, command }, 'Prefix command error');
      try { await message.reply(`Something went wrong with \`!${command}\`. Check bot logs.`); } catch {};
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

function buildHelpPages(gifKeysText: string): EmbedBuilder[] {
  const pages: EmbedBuilder[] = [];

  // Page 1: Game Info & Stats
  pages.push(
    new EmbedBuilder()
      .setTitle('Tusky Commands — Game Info & Stats')
      .setColor(0x006847)
      .addFields(
        { name: 'Game Info', value: '`!next` - Next game\n`!watch` - Where to watch\n`!replay` - Latest goal replay\n`!schedule [n]` - Upcoming games (default 7, max 15)', inline: false },
        { name: 'Stats', value: '`!stats [category]` - Team stat leaders (top 5)\n`!stats [category] on [date]` - Game-specific leaders\n`!stats help` - List all stat categories', inline: false },
        { name: 'Player Lookup', value: '`!player <name>` - Player stats, bio, and last 5 games', inline: false },
        { name: 'Standings', value: '`!standings` - Your conference playoff picture\n`!standings league` - Top 16 NHL teams\n`!standings west` / `!standings east` - By conference', inline: false },
        { name: 'Notifications', value: '`!gameday` - Toggle gameday ping role\n`!rewards` - Toggle rewards check-in reminders (private #rewards channel)\n`!follow <player>` - DM me when a Utah player scores, assists, or is first star\n`!follow @member` - DM me when their post makes the Hall of Fame\n`!unfollow` / `!following` / `!followers` - Manage follows (`!follow off` to block followers)', inline: false },
        { name: 'Reminders', value: '`!remind <time> <message>` — Set a reminder\n`!remind <time> <message> --dm` — Remind via DM\n`!reminders` — List your reminders\n`!remind cancel <id>` — Cancel a reminder', inline: false },
      )
      .setFooter({ text: 'Page 1/3 — Use buttons to navigate' })
  );

  // Page 2: Media & Fun
  pages.push(
    new EmbedBuilder()
      .setTitle('Tusky Commands — Media & Fun')
      .setColor(0x006847)
      .addFields(
        { name: 'Media Commands', value: `\`!<key>\` - Post a random gif from a collection (e.g. \`!goal\`)\n\`!<key> <#>\` - Post a specific one by its number in \`!gif list\` (e.g. \`!goal 4\`)\nRegistered keys: ${gifKeysText}`, inline: false },
        { name: 'Hall of Fame', value: 'Messages that get enough 🔥 😂 or 🤣 reactions are automatically posted to the Hall of Fame channel.\nHOF posts include reply context, media, and rendered Twitter links.', inline: false },
        { name: 'Tomato Town', value: 'Messages that get 8 🍅 reactions are reposted to the Tomato Town channel.', inline: false },
        { name: 'Ask Tusky', value: '@mention me with a question about the Mammoth, the NHL, or Clean Hits Hockey (or reply to one of my answers). Next game, standings, last game, player stats, and the newest episode are looked up live.', inline: false },
        { name: 'Auto Link Fix', value: 'Twitter/X links are automatically replied to with embeddable versions so you can see the content without clicking.', inline: false },
      )
      .setFooter({ text: 'Page 2/3 — Use buttons to navigate' })
  );

  // Page 3: Admin
  pages.push(
    new EmbedBuilder()
      .setTitle('Tusky Commands — Admin')
      .setColor(0x006847)
      .addFields(
        { name: 'Gif Management', value: '`!gif add <k> url:<u>` - Add gif to a key (or attach a file, or reply to a message with media)\n`!gif remove key:<k> <#>` - Remove gif\n`!gif list key:<k>` - List URLs for a key\n`!gif keys` - List all registered keys\n`!gif delete <k>` / `!gif rename <old> to <new>` - Manage Server only\nAdd/remove also work for the gif contributor role (`/config set gif_contributor_role`). Changes are posted to `gif_log_channel`.', inline: false },
        { name: 'News Feeds', value: '`!feed add <url> [label]` - Add RSS or Twitter feed\n`!feed remove <label>` - Remove a feed\n`!feed list` - List all feeds\n`!feed status` - Check feed health\n`!feed check [label]` - Force-check feeds now\n`!feed reset <label>` - Reset feed tracking', inline: false },
        { name: 'Hall of Fame', value: '`!hof` - Show HOF settings\n`!hof threshold <n>` - Set reaction threshold (1-100)\n`!hof update` - Rebuild all existing HOF posts\nTomato Town: `/config set setting:tomato_channel` and `tomato_threshold` (default 8)', inline: false },
        { name: 'Ask Tusky', value: '`!ask add <trigger> => <response>` - Add a canned answer (`exact:` prefix = whole message only)\n`!ask list` / `!ask remove <id>` - Manage canned answers\n`!ask misses` - Recent questions that went to the LLM or got deflected\n`/config set setting:ask value:off` - Turn Ask Tusky off', inline: false },
        { name: 'Config', value: '`/config show` - View all settings\n`/config set setting:<name> value:<value>` - Change a setting', inline: false },
        { name: 'Testing', value: '`!sim` - Run game simulation\n`!sim reset` - Reset simulation data', inline: false },
      )
      .setFooter({ text: 'Page 3/3 — Use buttons to navigate' })
  );

  return pages;
}

async function handlePrefixHelp(message: Message): Promise<void> {
  const { listGifKeys } = await import('../../db/queries.js');
  const guildId = message.guild!.id;

  const gifKeys = listGifKeys(guildId);
  const gifKeysText = gifKeys.length > 0
    ? gifKeys.map(k => `\`!${k}\``).join(', ')
    : 'None registered yet';

  const pages = buildHelpPages(gifKeysText);
  let currentPage = 0;

  const buildButtons = (page: number) => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === pages.length - 1),
  );

  const reply = await message.reply({
    embeds: [pages[currentPage]],
    components: [buildButtons(currentPage)],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000, // 2 minutes
  });

  collector.on('collect', async (interaction) => {
    // Only the person who ran !help can use the buttons
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({ content: 'Use `!help` to get your own help menu.', ephemeral: true });
      return;
    }

    if (interaction.customId === 'help_prev' && currentPage > 0) {
      currentPage--;
    } else if (interaction.customId === 'help_next' && currentPage < pages.length - 1) {
      currentPage++;
    }

    await interaction.update({
      embeds: [pages[currentPage]],
      components: [buildButtons(currentPage)],
    });
  });

  collector.on('end', async () => {
    try {
      await reply.edit({ components: [] });
    } catch { /* message may be deleted */ }
  });
}

async function handlePrefixNext(message: Message): Promise<void> {
  const config = getGuildConfig(message.guild!.id);
  const teamCode = config?.primary_team ?? 'UTA';
  const timezone = config?.timezone ?? 'America/Denver';

  const { lookupNextGame } = await import('../../services/teamLookups.js');
  const result = await lookupNextGame(teamCode, timezone);
  if (result.kind !== 'ok') {
    await message.reply('No upcoming games found.');
    return;
  }
  await message.reply({ embeds: [result.embed] });
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
      '`!feed check [label]` - Force-check feeds now and post new items (admin)\n' +
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
  } else if (sub === 'check') {
    const { forceCheckFeeds } = await import('../../services/feedWatcher.js');
    const label = args.slice(1).join(' ') || undefined;
    const checking = await message.reply(label ? `Force-checking feed **${label}**...` : 'Force-checking all feeds...');
    const results = await forceCheckFeeds(message.client, guildId, label);
    await checking.edit(`**Feed Check Results:**\n${results.join('\n')}`);
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
  const query = args.join(' ');
  if (!query) {
    await message.reply('Usage: `!player <name>` (e.g., `!player Keller`)');
    return;
  }

  const { lookupPlayer } = await import('../../services/teamLookups.js');
  const result = await lookupPlayer(query);
  if (result.kind === 'not_found') {
    await message.reply(`No player found matching "${query}".`);
    return;
  }
  if (result.kind === 'unavailable') {
    await message.reply(`Could not fetch stats for ${result.name}.`);
    return;
  }
  await message.reply({ embeds: [result.embed] });
}

async function handlePrefixStandings(message: Message, args: string[]): Promise<void> {
  const config = getGuildConfig(message.guild!.id);
  const teamCode = config?.primary_team ?? 'UTA';

  const { lookupStandingsEmbed } = await import('../../services/teamLookups.js');
  const embed = await lookupStandingsEmbed(teamCode, args[0]?.toLowerCase());
  if (!embed) {
    await message.reply('Could not fetch standings.');
    return;
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

async function handlePrefixRewards(message: Message): Promise<void> {
  const { resolveRewardsRole, resolveRewardsChannel, REWARDS_ROLE_NAME } = await import('../../services/rewardsReminder.js');

  const guild = message.guild!;
  const member = message.member;
  if (!member) {
    await message.reply('Could not find your member information.');
    return;
  }

  let role;
  try {
    role = await resolveRewardsRole(guild, true);
  } catch (error) {
    logger.error({ error }, 'Failed to find or create Rewards role');
    await message.reply(`The "${REWARDS_ROLE_NAME}" role doesn't exist and I couldn't create it. Ask an admin to create it.`);
    return;
  }
  if (!role) return;

  let channel;
  try {
    channel = await resolveRewardsChannel(guild, role);
  } catch (error) {
    logger.error({ error }, 'Failed to find or create #rewards channel');
    await message.reply("I couldn't create the #rewards channel. Ask an admin to create a private `rewards` channel for the Rewards role.");
    return;
  }

  try {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      await message.reply(`Removed the **${role.name}** role. You won't get check-in reminders anymore.`);
    } else {
      await member.roles.add(role);
      const where = channel ? ` in <#${channel.id}>` : '';
      await message.reply(`Added the **${role.name}** role! You'll be reminded to check in${where} at puck drop and every 45 minutes during games.`);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to toggle Rewards role');
    await message.reply('Failed to update your role. The bot may not have permission to manage roles.');
  }
}

function describeCandidates(players: { firstName: string; lastName: string; sweaterNumber?: number }[]): string {
  return players.map(p => `${p.firstName} ${p.lastName}${p.sweaterNumber ? ` (#${p.sweaterNumber})` : ''}`).join(', ');
}

async function handlePrefixFollow(message: Message, query: string): Promise<void> {
  const { matchRosterPlayer, loadFollowablePlayers, MAX_FOLLOWS } = await import('../../services/follows.js');
  const { addFollow, listFollows } = await import('../../db/queries.js');

  const mode = query.trim().toLowerCase();
  if (mode === 'off' || mode === 'on') {
    await handleFollowOptOut(message, mode === 'off');
    return;
  }
  const mentioned = await mentionedUser(message, query);
  if (mentioned) {
    await handleFollowMember(message, mentioned);
    return;
  }

  if (!query.trim()) {
    await message.reply(
      'Usage:\n`!follow <player>` (e.g. `!follow keller` or `!follow 9`): DM when a Utah player scores, assists, or is first star\n' +
      '`!follow @member`: DM when their post makes the Hall of Fame\n`!follow off` / `!follow on`: stop or allow people following you'
    );
    return;
  }

  const teamCode = getGuildConfig(message.guild!.id)?.primary_team ?? 'UTA';
  const players = await loadFollowablePlayers(teamCode);
  if (!players) {
    await message.reply("Couldn't load the roster right now. Try again in a bit.");
    return;
  }

  const result = matchRosterPlayer(query, players);
  if (result.kind === 'none') {
    await message.reply(`No ${teamCode} player matches "${query}".`);
    return;
  }
  if (result.kind === 'ambiguous') {
    await message.reply(`Which one? ${describeCandidates(result.players)}`);
    return;
  }

  const player = result.player;
  const name = `${player.firstName} ${player.lastName}`;
  const current = listFollows(message.author.id);
  if (current.some(f => f.playerId === player.id)) {
    await message.reply(`You already follow **${name}**.`);
    return;
  }
  if (current.length >= MAX_FOLLOWS) {
    await message.reply(`You can follow up to ${MAX_FOLLOWS} players. Use \`!unfollow <player>\` first.`);
    return;
  }

  addFollow(message.author.id, player.id, name);
  await message.reply(`Following **${name}**. I'll DM you when he scores, gets an assist, or is named first star (make sure DMs from server members are on).`);
}

async function handlePrefixUnfollow(message: Message, query: string): Promise<void> {
  const { matchRosterPlayer } = await import('../../services/follows.js');
  const { listFollows, removeFollow } = await import('../../db/queries.js');

  const target = await mentionedUser(message, query);
  if (target) {
    const { removeMemberFollow } = await import('../../db/queries.js');
    const removed = removeMemberFollow(message.guild!.id, message.author.id, target.id);
    await message.reply({
      content: removed ? `Unfollowed <@${target.id}>.` : `You don't follow <@${target.id}>.`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const follows = listFollows(message.author.id);
  if (follows.length === 0) {
    await message.reply("You're not following any players.");
    return;
  }

  // Match against the user's own follows, so players who left the roster can still be removed
  const candidates = follows.map(f => {
    const [firstName, ...rest] = f.playerName.split(' ');
    return { id: f.playerId, firstName, lastName: rest.join(' ') };
  });
  const result = matchRosterPlayer(query, candidates);
  if (result.kind === 'none') {
    await message.reply(`You don't follow anyone matching "${query}". You follow: ${follows.map(f => f.playerName).join(', ')}`);
    return;
  }
  if (result.kind === 'ambiguous') {
    await message.reply(`Which one? ${describeCandidates(result.players)}`);
    return;
  }

  removeFollow(message.author.id, result.player.id);
  await message.reply(`Unfollowed **${result.player.firstName} ${result.player.lastName}**.`);
}

async function handlePrefixFollowing(message: Message): Promise<void> {
  const { listFollows, listMemberFollows } = await import('../../db/queries.js');
  const players = listFollows(message.author.id);
  const members = listMemberFollows(message.guild!.id, message.author.id);
  if (players.length === 0 && members.length === 0) {
    await message.reply("You're not following anyone. Use `!follow <player>` or `!follow @member` to start.");
    return;
  }
  const lines: string[] = [];
  if (players.length > 0) lines.push(`**Players:** ${players.map(f => f.playerName).join(', ')}`);
  if (members.length > 0) lines.push(`**Members:** ${members.map(id => `<@${id}>`).join(', ')}`);
  await message.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}

// The command's argument must itself be an @mention — message.mentions also includes the
// author of a message being replied to, which would hijack e.g. a `!follow keller` reply.
async function mentionedUser(message: Message, query: string): Promise<User | null> {
  const id = query.trim().match(/^<@!?(\d+)>$/)?.[1];
  if (!id) return null;
  return message.mentions.users.get(id) ?? (await message.client.users.fetch(id).catch(() => null));
}

async function handleFollowMember(message: Message, target: User): Promise<void> {
  const { checkMemberFollow } = await import('../../services/follows.js');
  const { addMemberFollow, listMemberFollows, isFollowOptedOut } = await import('../../db/queries.js');

  const guildId = message.guild!.id;
  const current = listMemberFollows(guildId, message.author.id);
  const check = checkMemberFollow({
    followerId: message.author.id,
    targetId: target.id,
    targetIsBot: target.bot,
    targetOptedOut: isFollowOptedOut(guildId, target.id),
    alreadyFollowing: current.includes(target.id),
    currentCount: current.length,
  });

  const replies: Record<string, string> = {
    self: "You can't follow yourself.",
    bot: "You can't follow a bot.",
    opted_out: "You can't follow this member.",
    already: `You already follow <@${target.id}>.`,
    limit: 'You can follow up to 5 members. Use `!unfollow @member` first.',
    ok: `Following <@${target.id}>. I'll DM you when one of their posts makes the Hall of Fame. They can see who follows them with \`!followers\`.`,
  };
  if (check === 'ok') addMemberFollow(guildId, message.author.id, target.id);
  await message.reply({ content: replies[check], allowedMentions: { parse: [] } });
}

async function handleFollowOptOut(message: Message, optOut: boolean): Promise<void> {
  const { setFollowOptOut, getMemberFollowers } = await import('../../db/queries.js');
  const guildId = message.guild!.id;
  if (optOut) {
    const removed = getMemberFollowers(guildId, message.author.id).length;
    setFollowOptOut(guildId, message.author.id, true);
    await message.reply(`Nobody can follow you now${removed > 0 ? `, and your ${removed} follower${removed === 1 ? '' : 's'} were removed` : ''}. Use \`!follow on\` to allow it again.`);
  } else {
    setFollowOptOut(guildId, message.author.id, false);
    await message.reply('People can follow you again.');
  }
}

async function handlePrefixFollowers(message: Message): Promise<void> {
  const { getMemberFollowers, isFollowOptedOut } = await import('../../db/queries.js');
  const guildId = message.guild!.id;
  const followers = getMemberFollowers(guildId, message.author.id);
  const optedOut = isFollowOptedOut(guildId, message.author.id);
  let content = followers.length === 0
    ? 'Nobody follows you.'
    : `**${followers.length}** follower${followers.length === 1 ? '' : 's'}: ${followers.map(id => `<@${id}>`).join(', ')}`;
  content += optedOut ? '\nFollowing is turned off for you (`!follow on` to allow it).' : '\nUse `!follow off` to stop people following you.';
  await message.reply({ content, allowedMentions: { parse: [] } });
}

// Admin test command: post the latest Game Score Impact Card from Bluesky here (ignores hsc_charts_enabled)
async function handlePrefixHsc(message: Message): Promise<void> {
  const { PermissionFlagsBits } = await import('discord.js');
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission.');
    return;
  }
  const { latestImpactCard, buildImpactCardEmbed } = await import('../../services/hscBluesky.js');
  const nhl = await import('../../nhl/client.js');
  const team = getGuildConfig(message.guild!.id)?.primary_team ?? 'UTA';
  const teamName = (await nhl.getStandings())?.standings.find(s => s.teamAbbrev.default === team)?.teamName.default;
  const card = teamName ? await latestImpactCard(teamName) : null;
  if (!card) {
    await message.reply('No recent Game Score Impact Card found.');
  } else if (message.channel.isSendable()) {
    await message.channel.send({ embeds: [buildImpactCardEmbed(card)] });
  }
}

// Admin test command: render the TOI chart for a game in the current channel (ignores hsc_charts_enabled)
async function handlePrefixToi(message: Message, arg: string | undefined): Promise<void> {
  const { PermissionFlagsBits } = await import('discord.js');
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission.');
    return;
  }
  const { loadToiChart, latestCompletedGameId, toiMessage, linesMessage } = await import('../../services/toiPost.js');
  const teamCode = getGuildConfig(message.guild!.id)?.primary_team ?? 'UTA';
  const gameId = !arg || arg === 'last' ? await latestCompletedGameId(teamCode) : Number(arg);
  if (!gameId || Number.isNaN(gameId)) {
    await message.reply('Usage: `!toi last` or `!toi <gameId>`');
    return;
  }
  const chart = await loadToiChart(gameId, teamCode);
  if (chart === 'incomplete') {
    await message.reply("Shift data for that game isn't complete yet.");
  } else if (!chart) {
    await message.reply("Couldn't load that game.");
  } else if (message.channel.isSendable()) {
    await message.channel.send(toiMessage(chart, gameId));
    await message.channel.send(linesMessage(chart, gameId));
  }
}

// Admin test command: render the Deserve To Win O'Meter for a game in the current channel
async function handlePrefixMeter(message: Message, arg: string | undefined): Promise<void> {
  const { PermissionFlagsBits } = await import('discord.js');
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission.');
    return;
  }
  const { latestCompletedGameId } = await import('../../services/toiPost.js');
  const { loadDeserveToWin, meterMessage } = await import('../../services/deserveToWin.js');
  const teamCode = getGuildConfig(message.guild!.id)?.primary_team ?? 'UTA';
  const gameId = !arg || arg === 'last' ? await latestCompletedGameId(teamCode) : Number(arg);
  if (!gameId || Number.isNaN(gameId)) {
    await message.reply('Usage: `!meter last` or `!meter <gameId>`');
    return;
  }
  const meter = await loadDeserveToWin(gameId, teamCode);
  if (meter === 'incomplete') {
    await message.reply("MoneyPuck doesn't have the full game yet.");
  } else if (!meter) {
    await message.reply("Couldn't load that game.");
  } else if (message.channel.isSendable()) {
    await message.channel.send(meterMessage(meter, gameId, teamCode));
  }
}

async function handlePrefixHof(message: Message, args: string[]): Promise<void> {
  const { PermissionFlagsBits } = await import('discord.js');
  const { upsertGuildConfig } = await import('../../db/queries.js');

  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'help') {
    const currentThreshold = config?.hof_threshold ?? 8;
    await message.reply(
      '**Hall of Fame Commands:**\n' +
      `Current threshold: **${currentThreshold}** reactions\n` +
      'Qualifying emojis: 🔥 😂 🤣\n\n' +
      '`!hof threshold <number>` - Set minimum reactions needed (admin)\n' +
      '`!hof update` - Rebuild all HOF posts with reply context, media, and twitter rendering (admin)\n' +
      '`!hof scan <YYYY-MM-DD> [go]` - Find messages since a date that qualify but were never inducted; add `go` to post them (admin). Scanning months back can take a while.\n\n' +
      'A message is inducted once when ANY qualifying emoji reaches the threshold.'
    );
    return;
  }

  // Admin-only from here
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply('You need Manage Server permission to change HoF settings.');
    return;
  }

  if (sub === 'threshold') {
    const value = parseInt(args[1], 10);
    if (isNaN(value) || value < 1 || value > 100) {
      await message.reply('Please provide a number between 1 and 100.');
      return;
    }
    upsertGuildConfig(guildId, { hof_threshold: value });
    await message.reply(`Hall of Fame threshold set to **${value}** reactions.`);
    return;
  }

  if (sub === 'update') {
    const { getAllHofMessages, updateHofMessageIds } = await import('../../db/queries.js');
    const { buildHofPost, sendBoardFollowups } = await import('./reactionAdd.js');

    const entries = getAllHofMessages(guildId);
    if (entries.length === 0) {
      await message.reply('No HOF posts found to update.');
      return;
    }

    // Phase 1: Delete all existing HOF posts
    const statusMsg = await message.reply(`Deleting old HOF posts... (0/${entries.length})`);
    let deleted = 0;

    for (const entry of entries) {
      try {
        const hofChannel = await message.guild!.channels.fetch(entry.hof_channel_id!);
        if (!hofChannel || !hofChannel.isTextBased()) continue;
        const tc = hofChannel as TextChannel;

        // Delete main HOF message
        try {
          const msg = await tc.messages.fetch(entry.hof_message_id!);
          await msg.delete();
        } catch { /* already gone */ }

        // Delete follow-ups (own links, replied-to links) if they exist
        for (const followupMsgId of [entry.hof_followup_id, entry.hof_reply_followup_id]) {
          if (!followupMsgId) continue;
          try {
            const followup = await tc.messages.fetch(followupMsgId);
            await followup.delete();
          } catch { /* already gone */ }
        }

        deleted++;
      } catch { /* channel gone, skip */ }

      if (deleted % 5 === 0) {
        try { await statusMsg.edit(`Deleting old HOF posts... (${deleted}/${entries.length})`); } catch {}
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Phase 2: Resend all HOF posts in induction order
    await statusMsg.edit(`Resending HOF posts... (0/${entries.length})`);
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        // Fetch original message
        const origChannel = await message.guild!.channels.fetch(entry.original_channel_id);
        if (!origChannel || !origChannel.isTextBased()) {
          skipped++;
          continue;
        }

        let origMessage: Message;
        try {
          origMessage = await (origChannel as TextChannel).messages.fetch(entry.original_message_id);
        } catch {
          skipped++;
          continue;
        }

        // Rebuild the HOF post
        const post = await buildHofPost(
          origMessage, guildId, entry.original_channel_id, entry.original_message_id
        );

        // Get the HOF channel
        const hofChannel = await message.guild!.channels.fetch(entry.hof_channel_id!);
        if (!hofChannel || !hofChannel.isTextBased()) {
          skipped++;
          continue;
        }
        const tc = hofChannel as TextChannel;

        // Send new HOF embed
        const newHofMsg = await tc.send({ embeds: [post.embed], allowedMentions: { parse: [] } });

        // Follow-ups: own links/videos, then the replied-to message's links
        const { followupId, replyFollowupId } = await sendBoardFollowups(tc, post, '🔥');

        // Update DB with new message IDs
        updateHofMessageIds(guildId, entry.original_message_id, newHofMsg.id, followupId, replyFollowupId);

        updated++;
      } catch (error) {
        logger.error({ error, entryId: entry.id }, 'Failed to resend HOF post');
        skipped++;
      }

      if ((i + 1) % 5 === 0 || i === entries.length - 1) {
        try { await statusMsg.edit(`Resending HOF posts... (${i + 1}/${entries.length})`); } catch {}
      }

      // Rate limit: 2 seconds between posts
      if (i < entries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    await statusMsg.edit(`Done! Resent **${updated}** posts in order, **${skipped}** skipped (original message deleted/missing).`);
    return;
  }

  if (sub === 'scan') {
    if (hofScanInFlight.has(guildId)) {
      await message.reply('A HoF scan is already running for this server.');
      return;
    }
    hofScanInFlight.add(guildId);
    try {
      const dateArg = args[1];
      const goMode = args[2]?.toLowerCase() === 'go';
      const zone = config?.timezone ?? 'utc';

      if (!dateArg || dateArg.length !== 10 || !DateTime.fromISO(dateArg, { zone }).isValid) {
        await message.reply('Usage: `!hof scan <YYYY-MM-DD> [go]` - Provide a valid date in YYYY-MM-DD format.');
        return;
      }

      const sinceDate = DateTime.fromISO(dateArg, { zone }).startOf('day');
      if (sinceDate > DateTime.now().setZone(zone)) {
        await message.reply('The date cannot be in the future.');
        return;
      }

      if (!config?.hof_channel_id) {
        await message.reply('Hall of Fame is not configured for this server. Set a channel with `/config`.');
        return;
      }

      const { scanForMissedHof } = await import('../../services/hofScan.js');
      const { inductMessage } = await import('./reactionAdd.js');
      const { hasMessageBeenInducted } = await import('../../db/queries.js');

      await message.reply('Scanning…');

      let candidates;
      try {
        candidates = await scanForMissedHof(message.guild!, config, sinceDate.toISO()!);
      } catch (error) {
        logger.error({ error }, 'Failed to scan for missed HoF messages');
        await message.reply('Something went wrong while scanning. Check the logs.');
        return;
      }

      if (!goMode) {
        const header = `Found ${candidates.length} messages since ${dateArg} that qualify and were never inducted.`;
        if (candidates.length === 0) {
          await message.reply(header);
          return;
        }

        const bodyLines = candidates
          .slice(0, 20)
          .map((c) => `#${c.channelName} — ${c.topCount} reactions — ${c.message.url}`);
        const hint = `Run \`!hof scan ${dateArg} go\` to post them.`;

        // Discord caps messages at 2000 chars; chunk well under that so we never hit 50035.
        const chunks: string[] = [];
        let current = '';
        for (const line of [header, ...bodyLines, hint]) {
          const withLine = current ? `${current}\n${line}` : line;
          if (withLine.length > 1900 && current) {
            chunks.push(current);
            current = line;
          } else {
            current = withLine;
          }
        }
        if (current) chunks.push(current);

        for (let i = 0; i < chunks.length; i++) {
          if (i === 0) {
            await message.reply(chunks[i]);
          } else if (message.channel.isSendable()) {
            await message.channel.send(chunks[i]);
          }
        }
        return;
      }

      let toPost = candidates;
      let capped = false;
      if (toPost.length > 50) {
        toPost = toPost.slice(0, 50);
        capped = true;
      }

      let inducted = 0;
      for (let i = 0; i < toPost.length; i++) {
        try {
          // Re-check: the live reaction handler (or another scan) may have inducted this
          // message since scanForMissedHof built the candidate list.
          if (hasMessageBeenInducted(guildId, toPost[i].message.id)) continue;
          const posted = await inductMessage(toPost[i].message, guildId, config);
          if (posted) inducted++;
        } catch (error) {
          logger.warn({ error, messageId: toPost[i].message.id }, 'Failed to induct message during hof scan');
        }
        if (i < toPost.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      let finalReply = `Inducted ${inducted} of ${candidates.length}.`;
      if (capped) {
        finalReply += ' Capped at 50 for this run — re-run `!hof scan` to post the rest.';
      }
      await message.reply(finalReply);
      return;
    } finally {
      hofScanInFlight.delete(guildId);
    }
  }

  await message.reply('Unknown subcommand. Use `!hof help` for usage.');
}

async function handlePrefixGif(message: Message, key: string, numberArg?: string): Promise<void> {
  const guildId = message.guild!.id;
  const userId = message.author.id;

  // Check cooldown
  const cooldownKey = `${userId}-${key}`;
  const lastUsed = cooldowns.get(cooldownKey);
  if (lastUsed && Date.now() - lastUsed < COOLDOWN_MS) {
    return; // Silent cooldown for prefix commands
  }

  const { buildMediaMessage, parseListNumber, entryForListNumber } = await import('../../services/media.js');
  const { listGifUrlsForKey } = await import('../../db/queries.js');
  // Same order as `!gif list`, so `!haytin 4` posts the list's #4
  const entries = listGifUrlsForKey(guildId, key);
  if (entries.length === 0) {
    return; // Silent - unknown key, do nothing per PRD
  }

  // `!<key> <#>` picks that entry; anything else after the key is ignored (random pick)
  const number = numberArg ? parseListNumber([numberArg]) : null;
  let entry = entries[Math.floor(Math.random() * entries.length)];
  if (number) {
    const picked = entryForListNumber(entries, number);
    if (!picked) {
      await message.reply(`**${key}** only has ${entries.length} item${entries.length === 1 ? '' : 's'}. Pick 1–${entries.length}.`);
      return;
    }
    entry = picked;
  }

  cooldowns.set(cooldownKey, Date.now());
  if (message.channel.isSendable()) {
    try {
      await message.channel.send(buildMediaMessage(entry));
    } catch {
      await message.channel.send(entry.url); // e.g. upload rejected after a boost lapsed
    }
  }
}

async function handlePrefixGifAdmin(message: Message, args: string[]): Promise<void> {
  // !gif add <key> [url:<url>]   (or a file attached, or as a reply to a message with media)
  // !gif remove key:<key> <#> | url:<url>
  // !gif list key:<key> | !gif keys
  // !gif delete <key> | !gif rename <old> to <new>   (Manage Server only)
  const { listGifKeys, listGifUrlsForKey } = await import('../../db/queries.js');
  const { addGifEntry, removeGifEntry, removeGifEntryByNumber, parseListNumber, deleteGifKeyAndMedia, uploadLimitBytes, MediaError, ADD_REPLIES, normalizeGifKey } = await import('../../services/media.js');
  const { memberGifAccess, logGifAction, CONTRIBUTOR_DENIED } = await import('../../services/gifLog.js');

  const guildId = message.guild!.id;
  const sub = args[0]?.toLowerCase();
  const actorId = message.author.id;
  const access = memberGifAccess(message.member, message.member?.permissions, guildId);

  if (!sub) {
    await message.reply('Usage: `!gif add <key> url:<url>` (or attach a file, or reply to a message with media) | `!gif remove key:<key> <#>` | `!gif list key:<key>` | `!gif keys`');
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

  // Handle delete and rename BEFORE key:/url: parsing (they use different syntax)
  if (sub === 'delete') {
    if (access !== 'admin') {
      await message.reply('You need Manage Server permission to delete a whole key.');
      return;
    }
    // Everything after "!gif delete " is the key name
    const deleteKey = normalizeGifKey(args.slice(1).join(' '));
    if (!deleteKey) {
      await message.reply('Usage: `!gif delete <keyname>` - Deletes ALL URLs for a key\nExample: `!gif delete key:veggie`');
      return;
    }
    const count = await deleteGifKeyAndMedia(guildId, deleteKey, entries =>
      logGifAction(message.client, guildId, actorId, { kind: 'delete', key: deleteKey, entries }));
    await message.reply(count > 0 ? `Deleted **${deleteKey}** (${count} URLs removed).` : `Key **${deleteKey}** not found.`);
    return;
  }

  if (sub === 'rename') {
    if (access !== 'admin') {
      await message.reply('You need Manage Server permission to rename a key.');
      return;
    }
    // Parse: !gif rename <oldkey> to <newkey>
    const renameArgs = args.slice(1).join(' '); // everything after "!gif rename"
    const toIndex = renameArgs.toLowerCase().indexOf(' to ');
    if (toIndex === -1) {
      await message.reply('Usage: `!gif rename <oldkey> to <newkey>`\nExample: `!gif rename key:veggie to veggie`');
      return;
    }
    const oldKey = normalizeGifKey(renameArgs.slice(0, toIndex));
    const newKey = normalizeGifKey(renameArgs.slice(toIndex + 4));
    if (!oldKey || !newKey) {
      await message.reply('Usage: `!gif rename <oldkey> to <newkey>`\nExample: `!gif rename key:veggie to veggie`');
      return;
    }
    const { renameGifKey } = await import('../../db/queries.js');
    const count = renameGifKey(guildId, oldKey, newKey);
    if (count > 0) await logGifAction(message.client, guildId, actorId, { kind: 'rename', oldKey, newKey, count });
    await message.reply(count > 0 ? `Renamed **${oldKey}** to **${newKey}** (${count} URLs).` : `Key **${oldKey}** not found.`);
    return;
  }

  // Parse key: and url: from remaining args (for add, remove, list)
  const fullArgs = args.slice(1).join(' ');
  const keyMatch = fullArgs.match(/key:(\S+)/);
  const urlMatch = fullArgs.match(/url:(\S+)/);
  const key = keyMatch?.[1] ? normalizeGifKey(keyMatch[1]) || undefined : undefined;

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
    const list = entries.map((e, i) => `${i + 1}. ${e.file_path ? '📁 ' : ''}${e.url}`).join('\n');
    await message.reply(`**${key}** (${entries.length}, 📁 = saved copy):\n${list}`);
    return;
  }

  // Admins and gif contributors from here
  if (!access) {
    await message.reply(CONTRIBUTOR_DENIED);
    return;
  }

  const url = urlMatch?.[1];
  const onRemoved = (entries: import('../../db/models.js').GifCommand[]) =>
    logGifAction(message.client, guildId, actorId, { kind: 'remove', entries });

  if (sub === 'add') {
    // `key:` is optional for add: `!gif add goal` works too
    const addKey = key ?? (args[1] ? normalizeGifKey(args[1]) || undefined : undefined);
    const usage = 'Usage: `!gif add <key> url:<url>`, `!gif add <key>` with a file attached, or reply to a message with media using `!gif add <key>`';
    if (!addKey || addKey.startsWith('url:')) {
      await message.reply(usage);
      return;
    }

    // A url: or a file attached to the command message wins; otherwise take
    // every piece of media from the message being replied to.
    let addUrls: string[] = [];
    const ownUrl = url ?? message.attachments.first()?.url;
    if (ownUrl) {
      addUrls = [ownUrl];
    } else if (message.reference?.messageId) {
      const { mediaUrlsFromMessage } = await import('../../services/media.js');
      try {
        addUrls = mediaUrlsFromMessage(await message.fetchReference());
      } catch {
        await message.reply("Couldn't load the message you replied to.");
        return;
      }
      if (addUrls.length === 0) {
        await message.reply("The message you replied to doesn't have any media in it.");
        return;
      }
    }
    if (addUrls.length === 0) {
      await message.reply(usage);
      return;
    }

    const limit = uploadLimitBytes(message.guild!.premiumTier);
    const onAdded = (entry: import('../../db/models.js').GifCommand) =>
      logGifAction(message.client, guildId, actorId, { kind: 'add', entry });
    const replies: string[] = [];
    for (const addUrl of addUrls) {
      try {
        const result = await addGifEntry(message.client.rest, guildId, addKey, addUrl, actorId, limit, onAdded);
        replies.push(ADD_REPLIES[result](addKey));
      } catch (err) {
        replies.push(err instanceof MediaError ? err.message : 'Something went wrong saving that file.');
      }
    }
    await message.reply(replies.length === 1 ? replies[0] : replies.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  } else if (sub === 'remove') {
    const number = parseListNumber(args.slice(1));
    if (!key || (!url && !number)) {
      await message.reply('Usage: `!gif remove key:<key> <#>` (the number from `!gif list key:<key>`), or `!gif remove key:<key> url:<url>`');
      return;
    }
    if (number) {
      const removed = await removeGifEntryByNumber(guildId, key, number, onRemoved);
      await message.reply(removed ? `Removed #${number} from **${key}** (<${removed.url}>).` : `**${key}** has no #${number}. Check \`!gif list key:${key}\`.`);
      return;
    }
    const removed = await removeGifEntry(guildId, key, url!, onRemoved);
    await message.reply(removed.length > 0 ? `Removed from **${key}**.` : `URL not found for **${key}**.`);
  }
}

async function handlePrefixRemind(message: Message, args: string[]): Promise<void> {
  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const timezone = config?.timezone ?? 'America/Denver';

  // !remind cancel <id>
  if (args[0]?.toLowerCase() === 'cancel') {
    const id = parseInt(args[1], 10);
    if (isNaN(id)) {
      await message.reply('Usage: `!remind cancel <id>` — use `!reminders` to see your reminder IDs.');
      return;
    }
    const deleted = cancelReminder(id, message.author.id);
    if (deleted) {
      await message.reply(`Reminder #${id} cancelled.`);
    } else {
      await message.reply(`Couldn't find reminder #${id} (or it's not yours).`);
    }
    return;
  }

  // !remind help
  if (args.length === 0 || args[0]?.toLowerCase() === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('Remind Me')
      .setDescription([
        '**Set a reminder:**',
        '`!remind <time> <message>`',
        '`!remind <time> <message> --dm`',
        '',
        '**Time formats:**',
        '`30s`, `5m`, `2h`, `1d`, `7y`, `1h30m`, `1y 2d`',
        '`tomorrow`, `tomorrow 3pm`',
        '`3/18 8pm`, `Mar 18 8pm`',
        '',
        '**Manage:**',
        '`!reminders` — list your reminders',
        '`!remind cancel <id>` — cancel one',
        '',
        '**Examples:**',
        '`!remind 2h check the game`',
        '`!remind tomorrow 7pm game starts --dm`',
        '`!remind 3/18 8pm UTA vs EDM`',
      ].join('\n'))
      .setColor(0x006847);
    await message.reply({ embeds: [embed] });
    return;
  }

  // Parse: find where time ends and message begins
  const dm = args[args.length - 1] === '--dm';
  const msgArgs = dm ? args.slice(0, -1) : args;

  let parsed = null;
  let timeWordCount = 0;
  for (let i = 1; i <= Math.min(3, msgArgs.length); i++) {
    const timeStr = msgArgs.slice(0, i).join(' ');
    const attempt = parseTime(timeStr, timezone);
    if (attempt) {
      parsed = attempt;
      timeWordCount = i;
    }
  }

  if (!parsed) {
    await message.reply('I couldn\'t understand that time. Try `!remind help` for formats.');
    return;
  }

  let reminderMsg = msgArgs.slice(timeWordCount).join(' ');

  // If replying to a message, include quoted content and link
  if (message.reference?.messageId) {
    try {
      const refMsg = await message.channel.messages.fetch(message.reference.messageId);
      const messageLink = `https://discord.com/channels/${guildId}/${message.channel.id}/${refMsg.id}`;
      const author = refMsg.author?.displayName ?? refMsg.author?.username ?? 'Unknown';
      const quoted = refMsg.content ? `> ${refMsg.content.split('\n').join('\n> ')}` : '';
      const attribution = `— ${author}`;
      if (reminderMsg) {
        reminderMsg = quoted ? `${reminderMsg}\n\n${quoted}\n${attribution}\n${messageLink}` : `${reminderMsg}\n${messageLink}`;
      } else {
        reminderMsg = quoted ? `${quoted}\n${attribution}\n${messageLink}` : `${attribution}\n${messageLink}`;
      }
    } catch {
      // Referenced message may have been deleted
    }
  }

  if (!reminderMsg) {
    await message.reply('What should I remind you about? `!remind <time> <message>` or reply to a message.');
    return;
  }

  if (parsed.date.toMillis() <= Date.now()) {
    await message.reply('That time is in the past! Try a future time.');
    return;
  }

  const count = countUserReminders(guildId, message.author.id);
  if (count >= 25) {
    await message.reply('You\'ve hit the max number of reminders (25). Use `!reminders` to see your active reminders and `!remind cancel <id>` to cancel ones you no longer need.');
    return;
  }

  createReminder(
    guildId,
    message.channel.id,
    message.author.id,
    reminderMsg,
    parsed.date.toUTC().toISO()!,
    dm,
  );

  const localTime = parsed.date.toFormat('h:mm a ZZZZ');
  await message.reply({
    content: `Got it! I'll remind you ${parsed.relative} (at ${localTime}).${dm ? ' (via DM)' : ''}`,
    allowedMentions: { parse: [] },
  });
}

async function handlePrefixReminders(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const config = getGuildConfig(guildId);
  const timezone = config?.timezone ?? 'America/Denver';

  const reminders = getUserReminders(guildId, message.author.id);

  if (reminders.length === 0) {
    await message.reply('You have no active reminders.');
    return;
  }

  const lines = reminders.map(r => {
    const fireAt = DateTime.fromISO(r.fire_at, { zone: 'utc' }).setZone(timezone);
    const dmTag = r.dm ? ' (DM)' : '';
    return `**#${r.id}** — ${fireAt.toFormat('MMM d, h:mm a')}${dmTag}\n${r.message}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`Your Reminders (${reminders.length})`)
    .setDescription(lines.join('\n\n'))
    .setColor(0x006847)
    .setFooter({ text: 'Cancel with: !remind cancel <id>' });

  await message.reply({ embeds: [embed] });
}
