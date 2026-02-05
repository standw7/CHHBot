"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const statsLookup_js_1 = require("../../services/statsLookup.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('stats')
    .setDescription('Look up team stat leaders')
    .addStringOption(opt => opt.setName('category')
    .setDescription('Stat category (e.g. goals, assists, pim, save%). Defaults to points.')
    .setRequired(false));
async function execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    const query = interaction.options.getString('category') ?? 'points';
    await interaction.deferReply();
    const embed = await (0, statsLookup_js_1.buildStatsEmbed)(teamCode, query);
    await interaction.editReply({ embeds: [embed] });
}
//# sourceMappingURL=stats.js.map