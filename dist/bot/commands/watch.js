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
const queries_js_1 = require("../../db/queries.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('watch')
    .setDescription('Show where to watch the current or next game');
async function execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    await interaction.deferReply();
    const schedule = await nhlClient.getSchedule(teamCode);
    if (!schedule || !schedule.games || schedule.games.length === 0) {
        await interaction.editReply('No games found to look up broadcast info.');
        return;
    }
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // Find today's game or the next upcoming game
    let targetGame = schedule.games.find(g => {
        const gameDate = g.gameDate || g.startTimeUTC.split('T')[0];
        return gameDate === todayStr;
    });
    if (!targetGame) {
        targetGame = schedule.games.find(g => {
            const gameDate = new Date(g.startTimeUTC);
            return gameDate > now;
        });
    }
    if (!targetGame) {
        await interaction.editReply('No current or upcoming games found for broadcast info.');
        return;
    }
    // Try TV schedule endpoint first
    const gameDate = targetGame.gameDate || targetGame.startTimeUTC.split('T')[0];
    const tvSchedule = await nhlClient.getTvSchedule(gameDate);
    let broadcasts = [];
    if (tvSchedule?.games) {
        const tvGame = tvSchedule.games.find(g => g.id === targetGame.id);
        if (tvGame?.tvBroadcasts) {
            broadcasts = tvGame.tvBroadcasts.map(b => ({ network: b.network, market: b.market }));
        }
    }
    // Fallback to landing page
    if (broadcasts.length === 0) {
        const landing = await nhlClient.getLanding(targetGame.id);
        if (landing?.tvBroadcasts) {
            broadcasts = landing.tvBroadcasts.map(b => ({ network: b.network, market: b.market }));
        }
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('Where to Watch')
        .setDescription(`**${targetGame.awayTeam.abbrev}** @ **${targetGame.homeTeam.abbrev}**`)
        .setColor(0x006847);
    if (broadcasts.length === 0) {
        embed.addFields({ name: 'Broadcast Info', value: 'No broadcast data available. Check your local listings.' });
    }
    else {
        const national = broadcasts.filter(b => b.market === 'N' || b.market === 'national');
        const home = broadcasts.filter(b => b.market === 'H' || b.market === 'home');
        const away = broadcasts.filter(b => b.market === 'A' || b.market === 'away');
        const other = broadcasts.filter(b => !['N', 'national', 'H', 'home', 'A', 'away'].includes(b.market));
        if (national.length > 0) {
            embed.addFields({ name: 'National TV', value: national.map(b => b.network).join(', '), inline: true });
        }
        if (home.length > 0) {
            embed.addFields({ name: 'Home TV', value: home.map(b => b.network).join(', '), inline: true });
        }
        if (away.length > 0) {
            embed.addFields({ name: 'Away TV', value: away.map(b => b.network).join(', '), inline: true });
        }
        if (other.length > 0) {
            embed.addFields({ name: 'Other', value: other.map(b => b.network).join(', '), inline: true });
        }
        if (national.length === 0 && home.length === 0 && away.length === 0) {
            embed.setFooter({ text: 'Partial coverage data' });
        }
    }
    await interaction.editReply({ embeds: [embed] });
}
//# sourceMappingURL=watch.js.map