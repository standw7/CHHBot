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
const spoiler_js_1 = require("../../services/spoiler.js");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('replay')
    .setDescription('Show the most recent goal replay/highlight');
async function execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
    }
    const config = (0, queries_js_1.getGuildConfig)(guildId);
    const teamCode = config?.primary_team ?? 'UTA';
    const spoilerMode = (config?.spoiler_mode ?? 'off');
    await interaction.deferReply();
    // Find current or most recent game
    const schedule = await nhlClient.getSchedule(teamCode);
    if (!schedule || !schedule.games || schedule.games.length === 0) {
        await interaction.editReply('No games found.');
        return;
    }
    // Look for a live game first, then the most recent completed game
    let targetGame = schedule.games.find(g => g.gameState === 'LIVE' || g.gameState === 'CRIT');
    if (!targetGame) {
        const now = new Date();
        const pastGames = schedule.games
            .filter(g => (g.gameState === 'FINAL' || g.gameState === 'OFF') && new Date(g.startTimeUTC) <= now)
            .sort((a, b) => new Date(b.startTimeUTC).getTime() - new Date(a.startTimeUTC).getTime());
        targetGame = pastGames[0];
    }
    if (!targetGame) {
        await interaction.editReply('No current or recent games found.');
        return;
    }
    // Use landing endpoint for rich goal data (includes names, highlights)
    const landing = await nhlClient.getLanding(targetGame.id);
    if (!landing?.summary?.scoring) {
        await interaction.editReply('Could not fetch game data.');
        return;
    }
    // Find the most recent goal across all periods
    const allGoals = [];
    for (const period of landing.summary.scoring) {
        allGoals.push(...period.goals);
    }
    if (allGoals.length === 0) {
        await interaction.editReply('No goals yet in this game.');
        return;
    }
    const lastGoal = allGoals[allGoals.length - 1];
    const scorerName = `${lastGoal.firstName.default} ${lastGoal.lastName.default}`;
    const teamAbbrev = lastGoal.teamAbbrev.default;
    const period = lastGoal.timeInPeriod;
    // Get replay URL - only use highlightClipSharingUrl (nhl.com links)
    // Avoid pptReplayUrl and playbackUrl as they point to wsr.nhle.com which blocks public access
    let replayUrl = lastGoal.highlightClipSharingUrl;
    if (!replayUrl) {
        // Try play-by-play endpoint for a sharing URL
        const pbp = await nhlClient.getPlayByPlay(targetGame.id);
        const pbpGoals = pbp?.plays.filter(p => p.typeDescKey === 'goal') ?? [];
        const matchingPlay = pbpGoals.find(p => p.eventId === lastGoal.eventId) ?? pbpGoals[pbpGoals.length - 1];
        if (matchingPlay?.details?.highlightClipSharingUrl) {
            replayUrl = matchingPlay.details.highlightClipSharingUrl;
        }
    }
    const awayAbbrev = landing.awayTeam.abbrev;
    const homeAbbrev = landing.homeTeam.abbrev;
    const scoreLine = `${awayAbbrev} ${landing.awayTeam.score} - ${homeAbbrev} ${landing.homeTeam.score}`;
    let description = `**Most recent goal:** ${scorerName} (${teamAbbrev}) - ${period}`;
    if (spoilerMode !== 'off') {
        description += `\n${(0, spoiler_js_1.wrapScore)(scoreLine, spoilerMode)}`;
    }
    else {
        description += `\n${scoreLine}`;
    }
    if (replayUrl) {
        description += `\n\n[Watch Replay](${replayUrl})`;
    }
    else {
        description += `\n\nReplay unavailable. [View on NHL.com](${(0, endpoints_js_1.gamecenterWebUrl)(targetGame.id)})`;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`Replay - ${awayAbbrev} @ ${homeAbbrev}`)
        .setDescription(description)
        .setColor(0x006847);
    if (lastGoal.headshot) {
        embed.setThumbnail(lastGoal.headshot);
    }
    await interaction.editReply({ embeds: [embed] });
}
//# sourceMappingURL=replay.js.map