"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure Tusky settings (admin only)')
    .addSubcommand(sub => sub
    .setName('set')
    .setDescription('Set a configuration value')
    .addStringOption(opt => opt
    .setName('setting')
    .setDescription('The setting to change')
    .setRequired(true)
    .addChoices({ name: 'team', value: 'primary_team' }, { name: 'gameday_channel', value: 'gameday_channel_id' }, { name: 'hof_channel', value: 'hof_channel_id' }, { name: 'bot_channel', value: 'bot_commands_channel_id' }, { name: 'news_channel', value: 'news_channel_id' }, { name: 'delay', value: 'spoiler_delay_seconds' }, { name: 'spoiler_mode', value: 'spoiler_mode' }, { name: 'command_mode', value: 'command_mode' }, { name: 'link_fix', value: 'link_fix_enabled' }, { name: 'timezone', value: 'timezone' }))
    .addStringOption(opt => opt.setName('value').setDescription('The new value').setRequired(true)))
    .addSubcommand(sub => sub.setName('show').setDescription('Show current configuration'));
const VALID_SPOILER_MODES = ['off', 'wrap_scores', 'minimal_embed'];
const VALID_COMMAND_MODES = ['slash_only', 'slash_plus_prefix'];
async function execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
    }
    if (!interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'You need Manage Server permission to do this.', ephemeral: true });
        return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'show') {
        await handleShow(interaction, guildId);
    }
    else if (subcommand === 'set') {
        await handleSet(interaction, guildId);
    }
}
async function handleShow(interaction, guildId) {
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    if (!config) {
        await interaction.reply({ content: 'No configuration set yet. Use `/config set` to get started.', ephemeral: true });
        return;
    }
    const lines = [
        `**Team:** ${config.primary_team}`,
        `**Game Day Channel:** ${config.gameday_channel_id ? `<#${config.gameday_channel_id}>` : 'Not set'}`,
        `**Hall of Fame Channel:** ${config.hof_channel_id ? `<#${config.hof_channel_id}>` : 'Not set'}`,
        `**Bot Commands Channel:** ${config.bot_commands_channel_id ? `<#${config.bot_commands_channel_id}>` : 'Not set'}`,
        `**News Channel:** ${config.news_channel_id ? `<#${config.news_channel_id}>` : 'Not set'}`,
        `**Spoiler Delay:** ${config.spoiler_delay_seconds}s`,
        `**Spoiler Mode:** ${config.spoiler_mode}`,
        `**Command Mode:** ${config.command_mode}`,
        `**Link Fix (auto-embed):** ${config.link_fix_enabled ? 'on' : 'off'}`,
        `**Timezone:** ${config.timezone}`,
    ];
    await interaction.reply({ content: `**Tusky Configuration**\n${lines.join('\n')}`, ephemeral: true });
}
async function handleSet(interaction, guildId) {
    const setting = interaction.options.getString('setting', true);
    const value = interaction.options.getString('value', true);
    // Validate the value based on setting
    const updates = {};
    switch (setting) {
        case 'primary_team':
            updates.primary_team = value.toUpperCase();
            break;
        case 'gameday_channel_id': {
            const channelId = value.replace(/[<#>]/g, '');
            updates.gameday_channel_id = channelId;
            break;
        }
        case 'hof_channel_id': {
            const channelId = value.replace(/[<#>]/g, '');
            updates.hof_channel_id = channelId;
            break;
        }
        case 'bot_commands_channel_id': {
            const channelId = value.replace(/[<#>]/g, '');
            updates.bot_commands_channel_id = channelId;
            break;
        }
        case 'news_channel_id': {
            const channelId = value.replace(/[<#>]/g, '');
            updates.news_channel_id = channelId;
            break;
        }
        case 'spoiler_delay_seconds': {
            const num = parseInt(value, 10);
            if (isNaN(num) || num < 0 || num > 300) {
                await interaction.reply({ content: 'Delay must be a number between 0 and 300 seconds.', ephemeral: true });
                return;
            }
            updates.spoiler_delay_seconds = num;
            break;
        }
        case 'spoiler_mode':
            if (!VALID_SPOILER_MODES.includes(value)) {
                await interaction.reply({ content: `Spoiler mode must be one of: ${VALID_SPOILER_MODES.join(', ')}`, ephemeral: true });
                return;
            }
            updates.spoiler_mode = value;
            break;
        case 'link_fix_enabled': {
            const lower = value.toLowerCase();
            if (!['on', 'off', '1', '0'].includes(lower)) {
                await interaction.reply({ content: 'Link fix must be: on or off', ephemeral: true });
                return;
            }
            updates.link_fix_enabled = (lower === 'on' || lower === '1') ? 1 : 0;
            break;
        }
        case 'command_mode':
            if (!VALID_COMMAND_MODES.includes(value)) {
                await interaction.reply({ content: `Command mode must be one of: ${VALID_COMMAND_MODES.join(', ')}`, ephemeral: true });
                return;
            }
            updates.command_mode = value;
            break;
        case 'timezone':
            updates.timezone = value;
            break;
        default:
            await interaction.reply({ content: 'Unknown setting.', ephemeral: true });
            return;
    }
    (0, queries_js_1.upsertGuildConfig)(guildId, updates);
    await interaction.reply({ content: `Updated **${setting}** to **${value}**.`, ephemeral: true });
}
//# sourceMappingURL=config.js.map