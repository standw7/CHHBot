"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const teamLookups_js_1 = require("../../services/teamLookups.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('next')
    .setDescription('Show the next scheduled game');
async function execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    const timezone = config?.timezone ?? 'America/Denver';
    await interaction.deferReply();
    const result = await (0, teamLookups_js_1.lookupNextGame)(teamCode, timezone);
    if (result.kind === 'no_schedule') {
        await interaction.editReply('No upcoming games found for this season.');
        return;
    }
    if (result.kind === 'none') {
        await interaction.editReply('No upcoming games found. The season may be over or on a break.');
        return;
    }
    await interaction.editReply({ embeds: [result.embed] });
}
//# sourceMappingURL=next.js.map