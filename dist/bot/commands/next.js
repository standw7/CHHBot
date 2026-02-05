"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const nhlClient = __importStar(require("../../nhl/client.js"));
const endpoints_js_1 = require("../../nhl/endpoints.js");
const queries_js_1 = require("../../db/queries.js");
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
    const schedule = await nhlClient.getSchedule(teamCode);
    if (!schedule || !schedule.games || schedule.games.length === 0) {
        await interaction.editReply('No upcoming games found for this season.');
        return;
    }
    const now = new Date();
    const nextGame = schedule.games.find(g => {
        const gameDate = new Date(g.startTimeUTC);
        return gameDate > now && (g.gameState === 'FUT' || g.gameState === 'PRE');
    });
    if (!nextGame) {
        await interaction.editReply('No upcoming games found. The season may be over or on a break.');
        return;
    }
    const gameDate = new Date(nextGame.startTimeUTC);
    const formattedDate = gameDate.toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
    const formattedTime = gameDate.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
    });
    const isHome = nextGame.homeTeam.abbrev === teamCode;
    const opponent = isHome ? nextGame.awayTeam : nextGame.homeTeam;
    const locationText = isHome ? 'Home' : 'Away';
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('Next Game')
        .setDescription(`**${nextGame.awayTeam.abbrev}** @ **${nextGame.homeTeam.abbrev}**`)
        .addFields({ name: 'Opponent', value: opponent.abbrev, inline: true }, { name: 'Location', value: locationText, inline: true }, { name: 'Date', value: formattedDate, inline: true }, { name: 'Time', value: formattedTime, inline: true })
        .setURL((0, endpoints_js_1.gamecenterWebUrl)(nextGame.id))
        .setColor(0x006847);
    if (nextGame.venue?.default) {
        embed.addFields({ name: 'Venue', value: nextGame.venue.default, inline: true });
    }
    const teamLogo = isHome ? nextGame.homeTeam.logo : nextGame.awayTeam.logo;
    if (teamLogo) {
        embed.setThumbnail(teamLogo);
    }
    await interaction.editReply({ embeds: [embed] });
}
//# sourceMappingURL=next.js.map