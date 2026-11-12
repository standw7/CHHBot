"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const gifLog_js_1 = require("../../services/gifLog.js");
const media_js_1 = require("../../services/media.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('gif')
    .setDescription('Media commands for goal gifs, player memes, etc.')
    .addSubcommand(sub => sub
    .setName('play')
    .setDescription('Play a random gif/media for a key')
    .addStringOption(opt => opt.setName('name').setDescription('The gif key (e.g. goal, yams)').setRequired(true))
    .addIntegerOption(opt => opt.setName('number').setDescription('Play a specific one: its number in /gif list').setMinValue(1)))
    .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Add media to a key: a link, or attach a file (admins & gif contributors)')
    .addStringOption(opt => opt.setName('key').setDescription('The gif key').setRequired(true))
    .addStringOption(opt => opt.setName('url').setDescription('The media URL (Tenor/Klipy stay links; files are saved)'))
    .addAttachmentOption(opt => opt.setName('file').setDescription('Or attach an image, gif, video or audio clip (max 10 MB)')))
    .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove media from a key by its list number or URL (admins & gif contributors)')
    .addStringOption(opt => opt.setName('key').setDescription('The gif key').setRequired(true))
    .addIntegerOption(opt => opt.setName('number').setDescription('The number shown by /gif list').setMinValue(1))
    .addStringOption(opt => opt.setName('url').setDescription('Or the media URL to remove')))
    .addSubcommand(sub => sub.setName('list').setDescription('List all URLs for a key')
    .addStringOption(opt => opt.setName('key').setDescription('The gif key').setRequired(true)))
    .addSubcommand(sub => sub.setName('keys').setDescription('List all registered gif keys'));
// Cooldown tracking: Map<`${userId}-${key}`, timestamp>
const cooldowns = new Map();
const COOLDOWN_MS = 5000;
async function execute(interaction) {
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
async function handlePlay(interaction, guildId) {
    const key = (0, media_js_1.normalizeGifKey)(interaction.options.getString('name', true));
    const userId = interaction.user.id;
    // Check cooldown
    const cooldownKey = `${userId}-${key}`;
    const lastUsed = cooldowns.get(cooldownKey);
    if (lastUsed && Date.now() - lastUsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastUsed)) / 1000);
        await interaction.reply({ content: `Cooldown: wait ${remaining}s before using this again.`, ephemeral: true });
        return;
    }
    const entries = (0, queries_js_1.listGifUrlsForKey)(guildId, key); // same order as /gif list
    if (entries.length === 0) {
        await interaction.reply({ content: `No media found for "${key}".`, ephemeral: true });
        return;
    }
    const number = interaction.options.getInteger('number');
    const entry = number ? (0, media_js_1.entryForListNumber)(entries, number) : entries[Math.floor(Math.random() * entries.length)];
    if (!entry) {
        await interaction.reply({ content: `**${key}** only has ${entries.length} item${entries.length === 1 ? '' : 's'}. Pick 1–${entries.length}.`, ephemeral: true });
        return;
    }
    cooldowns.set(cooldownKey, Date.now());
    try {
        await interaction.reply((0, media_js_1.buildMediaMessage)(entry));
    }
    catch {
        await interaction.reply(entry.url); // e.g. upload rejected after a boost lapsed
    }
}
async function handleAdd(interaction, guildId) {
    if (!(0, gifLog_js_1.memberGifAccess)(interaction.member, interaction.memberPermissions, guildId)) {
        await interaction.reply({ content: gifLog_js_1.CONTRIBUTOR_DENIED, ephemeral: true });
        return;
    }
    const key = (0, media_js_1.normalizeGifKey)(interaction.options.getString('key', true));
    const url = interaction.options.getString('url') ?? interaction.options.getAttachment('file')?.url;
    if (!url) {
        await interaction.reply({ content: 'Give a `url` or attach a `file`.', ephemeral: true });
        return;
    }
    // Downloading can take longer than Discord's 3s reply window
    await interaction.deferReply({ ephemeral: true });
    try {
        const limit = (0, media_js_1.uploadLimitBytes)(interaction.guild?.premiumTier ?? 0);
        const onAdded = (entry) => (0, gifLog_js_1.logGifAction)(interaction.client, guildId, interaction.user.id, { kind: 'add', entry });
        const result = await (0, media_js_1.addGifEntry)(interaction.client.rest, guildId, key, url, interaction.user.id, limit, onAdded);
        await interaction.editReply(media_js_1.ADD_REPLIES[result](key));
    }
    catch (err) {
        await interaction.editReply(err instanceof media_js_1.MediaError ? err.message : 'Something went wrong saving that file.');
    }
}
async function handleRemove(interaction, guildId) {
    if (!(0, gifLog_js_1.memberGifAccess)(interaction.member, interaction.memberPermissions, guildId)) {
        await interaction.reply({ content: gifLog_js_1.CONTRIBUTOR_DENIED, ephemeral: true });
        return;
    }
    const key = (0, media_js_1.normalizeGifKey)(interaction.options.getString('key', true));
    const onRemoved = (entries) => (0, gifLog_js_1.logGifAction)(interaction.client, guildId, interaction.user.id, { kind: 'remove', entries });
    const number = interaction.options.getInteger('number');
    if (number) {
        const entry = await (0, media_js_1.removeGifEntryByNumber)(guildId, key, number, onRemoved);
        await interaction.reply({
            content: entry ? `Removed #${number} from **${key}** (<${entry.url}>).` : `**${key}** has no #${number}. Check \`/gif list\`.`,
            ephemeral: true,
        });
        return;
    }
    const url = interaction.options.getString('url');
    if (!url) {
        await interaction.reply({ content: 'Give a `number` from `/gif list` or a `url`.', ephemeral: true });
        return;
    }
    const removed = await (0, media_js_1.removeGifEntry)(guildId, key, url, onRemoved);
    if (removed.length > 0) {
        await interaction.reply({ content: `Removed media from **${key}**.`, ephemeral: true });
    }
    else {
        await interaction.reply({ content: `URL not found for key **${key}**.`, ephemeral: true });
    }
}
async function handleList(interaction, guildId) {
    const key = (0, media_js_1.normalizeGifKey)(interaction.options.getString('key', true));
    const entries = (0, queries_js_1.listGifUrlsForKey)(guildId, key);
    if (entries.length === 0) {
        await interaction.reply({ content: `No media registered for **${key}**.`, ephemeral: true });
        return;
    }
    const list = entries.map((e, i) => `${i + 1}. ${e.file_path ? '📁 ' : ''}${e.url}`).join('\n');
    await interaction.reply({ content: `**${key}** (${entries.length} items, 📁 = saved copy):\n${list}`, ephemeral: true });
}
async function handleKeys(interaction, guildId) {
    const keys = (0, queries_js_1.listGifKeys)(guildId);
    if (keys.length === 0) {
        await interaction.reply({ content: 'No gif keys registered yet. Use `/gif add` to add some.', ephemeral: true });
        return;
    }
    await interaction.reply({ content: `**Registered keys:** ${keys.join(', ')}`, ephemeral: true });
}
//# sourceMappingURL=gif.js.map