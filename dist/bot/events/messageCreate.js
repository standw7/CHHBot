"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMessageHandler = registerMessageHandler;
const queries_js_1 = require("../../db/queries.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'prefix-commands' });
// Cooldown tracking for prefix gif commands
const cooldowns = new Map();
const COOLDOWN_MS = 5000;
function registerMessageHandler(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot)
            return;
        if (!message.guild)
            return;
        // --- @mention handler for stats ---
        if (client.user && message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true })) {
            try {
                await handleMentionStats(message, client);
            }
            catch (error) {
                logger.error({ error }, '@mention stats error');
            }
            return;
        }
        if (!message.content.startsWith('!'))
            return;
        const config = (0, queries_js_1.getGuildConfig)(message.guild.id);
        if (!config || config.command_mode !== 'slash_plus_prefix')
            return;
        const args = message.content.slice(1).trim().split(/\s+/);
        const command = args[0]?.toLowerCase();
        if (!command)
            return;
        try {
            switch (command) {
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
                default:
                    // Check if it's a registered gif key
                    await handlePrefixGif(message, command);
                    break;
            }
        }
        catch (error) {
            logger.error({ error, command }, 'Prefix command error');
        }
    });
}
async function handleMentionStats(message, client) {
    const { buildStatsEmbed, buildStatsHelpEmbed } = await import('../../services/statsLookup.js');
    const guildId = message.guild.id;
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    // Strip the mention from the message to get the query
    const query = message.content
        .replace(/<@!?\d+>/g, '')
        .trim();
    if (!query) {
        const embed = buildStatsHelpEmbed();
        await message.reply({ embeds: [embed] });
        return;
    }
    const embed = await buildStatsEmbed(teamCode, query);
    await message.reply({ embeds: [embed] });
}
async function handlePrefixStats(message, args) {
    const { buildStatsEmbed } = await import('../../services/statsLookup.js');
    const guildId = message.guild.id;
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    const query = args.join(' ') || 'points';
    const embed = await buildStatsEmbed(teamCode, query);
    await message.reply({ embeds: [embed] });
}
async function handlePrefixHelp(message) {
    const { EmbedBuilder } = await import('discord.js');
    const { listGifKeys } = await import('../../db/queries.js');
    const guildId = message.guild.id;
    const gifKeys = listGifKeys(guildId);
    const gifKeysText = gifKeys.length > 0
        ? gifKeys.map(k => `\`!${k}\``).join(', ')
        : 'None registered yet';
    const embed = new EmbedBuilder()
        .setTitle('Tusky Commands')
        .setColor(0x006847)
        .addFields({ name: '!next', value: 'Show the next scheduled game', inline: false }, { name: '!watch', value: 'Where to watch the current/next game', inline: false }, { name: '!replay', value: 'Most recent goal replay/highlight', inline: false }, { name: '!stats [category]', value: 'Look up team stat leaders (e.g. `!stats goals`, `!stats pim`). Defaults to points.', inline: false }, { name: '@Tusky <question>', value: 'Ask about stats (e.g. `@Tusky who leads in penalty minutes?`)', inline: false }, { name: '!help', value: 'Show this help message', inline: false }, { name: '\u200B', value: '**Media Commands**', inline: false }, { name: '!<key>', value: `Post a random gif/media for a key\nRegistered keys: ${gifKeysText}`, inline: false }, { name: '\u200B', value: '**Gif Management (Admin)**', inline: false }, { name: '!gif add key:<key> url:<url>', value: 'Add a media URL to a key', inline: false }, { name: '!gif remove key:<key> url:<url>', value: 'Remove a media URL from a key', inline: false }, { name: '!gif list key:<key>', value: 'List all URLs for a key', inline: false }, { name: '!gif keys', value: 'List all registered keys', inline: false }, { name: '\u200B', value: '**News Feeds (Admin)**', inline: false }, { name: '!feed add <url> <label>', value: 'Add an RSS feed to the news channel', inline: false }, { name: '!feed remove <label>', value: 'Remove a feed', inline: false }, { name: '!feed list', value: 'List all registered feeds', inline: false }, { name: '\u200B', value: '**Auto Features**', inline: false }, { name: 'Link Fix', value: 'Automatically converts x.com/twitter and instagram links for proper embeds (toggle with `/config set setting:link_fix value:on/off`)', inline: false }, { name: '\u200B', value: '**Testing (Admin)**', inline: false }, { name: '!sim', value: 'Run a fake game simulation to test goal cards and final summary', inline: false }, { name: '!sim reset', value: 'Reset simulation data so you can run it again', inline: false }, { name: '\u200B', value: '**Slash Commands**', inline: false }, { name: '/config show', value: 'View current bot configuration', inline: false }, { name: '/config set', value: 'Change bot settings (Admin)', inline: false })
        .setFooter({ text: 'Tusky - Utah Mammoth Hockey Bot' });
    await message.reply({ embeds: [embed] });
}
async function handlePrefixNext(message) {
    const guildId = message.guild.id;
    const config = (0, queries_js_1.getGuildConfig)(guildId);
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
        .addFields({ name: 'Opponent', value: opponent.abbrev, inline: true }, { name: 'Location', value: isHome ? 'Home' : 'Away', inline: true }, { name: 'Date', value: formattedDate, inline: true }, { name: 'Time', value: formattedTime, inline: true })
        .setURL(gamecenterWebUrl(nextGame.id))
        .setColor(0x006847);
    if (nextGame.venue?.default) {
        embed.addFields({ name: 'Venue', value: nextGame.venue.default, inline: true });
    }
    await message.reply({ embeds: [embed] });
}
async function handlePrefixWatch(message) {
    const guildId = message.guild.id;
    const config = (0, queries_js_1.getGuildConfig)(guildId);
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
    let broadcasts = [];
    if (tvSchedule?.games) {
        const tvGame = tvSchedule.games.find(g => g.id === targetGame.id);
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
    }
    else {
        const national = broadcasts.filter(b => b.market === 'N' || b.market === 'national');
        const home = broadcasts.filter(b => b.market === 'H' || b.market === 'home');
        const away = broadcasts.filter(b => b.market === 'A' || b.market === 'away');
        if (national.length > 0)
            embed.addFields({ name: 'National TV', value: national.map(b => b.network).join(', '), inline: true });
        if (home.length > 0)
            embed.addFields({ name: 'Home TV', value: home.map(b => b.network).join(', '), inline: true });
        if (away.length > 0)
            embed.addFields({ name: 'Away TV', value: away.map(b => b.network).join(', '), inline: true });
    }
    await message.reply({ embeds: [embed] });
}
async function handlePrefixReplay(message) {
    const guildId = message.guild.id;
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    const spoilerMode = (config?.spoiler_mode ?? 'off');
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
    const allGoals = [];
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
    }
    else {
        description += `\n${scoreLine}`;
    }
    if (replayUrl) {
        description += `\n\n[Watch Replay](${replayUrl})`;
    }
    else {
        description += `\n\nReplay unavailable. [View on NHL.com](${gamecenterWebUrl(targetGame.id)})`;
    }
    const embed = new EmbedBuilder()
        .setTitle(`Replay - ${landing.awayTeam.abbrev} @ ${landing.homeTeam.abbrev}`)
        .setDescription(description)
        .setColor(0x006847);
    if (lastGoal.headshot)
        embed.setThumbnail(lastGoal.headshot);
    await message.reply({ embeds: [embed] });
}
async function handlePrefixFeed(message, args) {
    const { PermissionFlagsBits, EmbedBuilder } = await import('discord.js');
    const { addFeedSource, removeFeedSource, getFeedSources } = await import('../../db/queries.js');
    const guildId = message.guild.id;
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === 'help') {
        await message.reply('**Feed Commands:**\n' +
            '`!feed add <twitter/x profile URL>` - Add a Twitter/X account (admin)\n' +
            '`!feed add <rss url> <label>` - Add a generic RSS feed (admin)\n' +
            '`!feed remove <label>` - Remove a feed (admin)\n' +
            '`!feed list` - List all registered feeds\n\n' +
            'Feeds post to the configured news channel. Set it with:\n' +
            '`/config set setting:news_channel value:#channel`');
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
    // Admin-only from here
    const member = message.member;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await message.reply('You need Manage Server permission to manage feeds.');
        return;
    }
    if (sub === 'add') {
        const input = args[1];
        if (!input) {
            await message.reply('Usage:\n' +
                '`!feed add https://x.com/username` - Add a Twitter/X account\n' +
                '`!feed add <rss url> <label>` - Add a generic RSS feed');
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
                await message.reply(`Could not find a working RSS feed for **@${username}**. Twitter RSS bridges can be unreliable.\n` +
                    'You can try adding a specific RSS URL manually: `!feed add <rss-url> <label>`');
                return;
            }
            const label = args.slice(2).join(' ') || `@${username}`;
            addFeedSource(guildId, result.url, label, message.author.id);
            await message.reply(`Added **${label}** using ${result.bridge}.\nFeed URL: ${result.url}`);
        }
        else {
            // Generic RSS feed
            const label = args.slice(2).join(' ');
            if (!label) {
                await message.reply('For non-Twitter feeds, provide a label: `!feed add <url> <label>`');
                return;
            }
            addFeedSource(guildId, input, label, message.author.id);
            await message.reply(`Added feed **${label}**.`);
        }
    }
    else if (sub === 'remove') {
        const label = args.slice(1).join(' ');
        if (!label) {
            await message.reply('Usage: `!feed remove <label>`');
            return;
        }
        const removed = removeFeedSource(guildId, label);
        await message.reply(removed ? `Removed feed **${label}**.` : `Feed "${label}" not found.`);
    }
    else {
        await message.reply('Unknown subcommand. Use `!feed help` for usage.');
    }
}
async function handlePrefixSim(message, args) {
    const { PermissionFlagsBits } = await import('discord.js');
    const member = message.member;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await message.reply('You need Manage Server permission to run simulations.');
        return;
    }
    const sub = args[0]?.toLowerCase();
    if (sub === 'reset') {
        const { resetSimulation } = await import('../../services/simulator.js');
        resetSimulation(message.guild.id);
        await message.reply('Simulation data reset. You can run `!sim` again.');
        return;
    }
    await message.reply('Starting game simulation. Goal cards will post to the gameday channel with your configured spoiler delay...');
    const { runSimulation } = await import('../../services/simulator.js');
    runSimulation(message.client, message.guild.id).catch(err => {
        logger.error({ err }, 'Simulation error');
    });
}
async function handlePrefixGif(message, key) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    // Check cooldown
    const cooldownKey = `${userId}-${key}`;
    const lastUsed = cooldowns.get(cooldownKey);
    if (lastUsed && Date.now() - lastUsed < COOLDOWN_MS) {
        return; // Silent cooldown for prefix commands
    }
    const urls = (0, queries_js_1.getGifUrls)(guildId, key);
    if (urls.length === 0) {
        return; // Silent - unknown key, do nothing per PRD
    }
    const url = urls[Math.floor(Math.random() * urls.length)];
    cooldowns.set(cooldownKey, Date.now());
    if (message.channel.isSendable()) {
        await message.channel.send(url);
    }
}
async function handlePrefixGifAdmin(message, args) {
    // Parse: !gif add key:<key> url:<url>
    // or: !gif remove key:<key> url:<url>
    // or: !gif list key:<key>
    // or: !gif keys
    const { PermissionFlagsBits } = await import('discord.js');
    const { addGifUrl, removeGifUrl, listGifKeys, listGifUrlsForKey } = await import('../../db/queries.js');
    const guildId = message.guild.id;
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
    }
    else if (sub === 'remove') {
        if (!key || !url) {
            await message.reply('Usage: `!gif remove key:<key> url:<url>`');
            return;
        }
        const removed = removeGifUrl(guildId, key, url);
        await message.reply(removed ? `Removed from **${key}**.` : `URL not found for **${key}**.`);
    }
}
//# sourceMappingURL=messageCreate.js.map