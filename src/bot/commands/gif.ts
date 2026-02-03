import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { getGifUrls, addGifUrl, removeGifUrl, listGifKeys, listGifUrlsForKey } from '../../db/queries.js';

export const data = new SlashCommandBuilder()
  .setName('gif')
  .setDescription('Media commands for goal gifs, player memes, etc.')
  .addSubcommand(sub =>
    sub
      .setName('play')
      .setDescription('Play a random gif/media for a key')
      .addStringOption(opt => opt.setName('name').setDescription('The gif key (e.g. goal, yams)').setRequired(true))
  )
  .addSubcommand(sub =>
    sub
      .setName('add')
      .setDescription('Add a media URL to a key (admin only)')
      .addStringOption(opt => opt.setName('key').setDescription('The gif key').setRequired(true))
      .addStringOption(opt => opt.setName('url').setDescription('The media URL').setRequired(true))
  )
  .addSubcommand(sub =>
    sub
      .setName('remove')
      .setDescription('Remove a media URL from a key (admin only)')
      .addStringOption(opt => opt.setName('key').setDescription('The gif key').setRequired(true))
      .addStringOption(opt => opt.setName('url').setDescription('The media URL to remove').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list').setDescription('List all URLs for a key')
      .addStringOption(opt => opt.setName('key').setDescription('The gif key').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('keys').setDescription('List all registered gif keys')
  );

// Cooldown tracking: Map<`${userId}-${key}`, timestamp>
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 5000;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'play':
      await handlePlay(interaction, guildId);
      break;
    case 'add':
      await handleAdd(interaction, guildId);
      break;
    case 'remove':
      await handleRemove(interaction, guildId);
      break;
    case 'list':
      await handleList(interaction, guildId);
      break;
    case 'keys':
      await handleKeys(interaction, guildId);
      break;
  }
}

async function handlePlay(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const key = interaction.options.getString('name', true).toLowerCase();
  const userId = interaction.user.id;

  // Check cooldown
  const cooldownKey = `${userId}-${key}`;
  const lastUsed = cooldowns.get(cooldownKey);
  if (lastUsed && Date.now() - lastUsed < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastUsed)) / 1000);
    await interaction.reply({ content: `Cooldown: wait ${remaining}s before using this again.`, ephemeral: true });
    return;
  }

  const urls = getGifUrls(guildId, key);
  if (urls.length === 0) {
    await interaction.reply({ content: `No media found for "${key}".`, ephemeral: true });
    return;
  }

  const url = urls[Math.floor(Math.random() * urls.length)];
  cooldowns.set(cooldownKey, Date.now());
  await interaction.reply(url);
}

async function handleAdd(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need Manage Server permission to do this.', ephemeral: true });
    return;
  }

  const key = interaction.options.getString('key', true).toLowerCase();
  const url = interaction.options.getString('url', true);
  addGifUrl(guildId, key, url, interaction.user.id);
  await interaction.reply({ content: `Added media to **${key}**.`, ephemeral: true });
}

async function handleRemove(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need Manage Server permission to do this.', ephemeral: true });
    return;
  }

  const key = interaction.options.getString('key', true).toLowerCase();
  const url = interaction.options.getString('url', true);
  const removed = removeGifUrl(guildId, key, url);
  if (removed) {
    await interaction.reply({ content: `Removed media from **${key}**.`, ephemeral: true });
  } else {
    await interaction.reply({ content: `URL not found for key **${key}**.`, ephemeral: true });
  }
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const key = interaction.options.getString('key', true).toLowerCase();
  const entries = listGifUrlsForKey(guildId, key);
  if (entries.length === 0) {
    await interaction.reply({ content: `No media registered for **${key}**.`, ephemeral: true });
    return;
  }

  const list = entries.map((e, i) => `${i + 1}. ${e.url}`).join('\n');
  await interaction.reply({ content: `**${key}** (${entries.length} items):\n${list}`, ephemeral: true });
}

async function handleKeys(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const keys = listGifKeys(guildId);
  if (keys.length === 0) {
    await interaction.reply({ content: 'No gif keys registered yet. Use `/gif add` to add some.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: `**Registered keys:** ${keys.join(', ')}`, ephemeral: true });
}
