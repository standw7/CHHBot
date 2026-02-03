import { Client, Message } from 'discord.js';
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
        case 'next':
          await handlePrefixNext(message);
          break;
        case 'watch':
          await handlePrefixWatch(message);
          break;
        case 'replay':
          await handlePrefixReplay(message);
          break;
        case 'gif':
          await handlePrefixGifAdmin(message, args.slice(1));
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
  // Simplified prefix version - directs to slash command for full functionality
  await message.reply('Use `/watch` for full broadcast info, or this feature will show basic info soon.');
}

async function handlePrefixReplay(message: Message): Promise<void> {
  await message.reply('Use `/replay` for the latest goal replay.');
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
  }
}
