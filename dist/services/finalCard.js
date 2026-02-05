"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFinalCard = buildFinalCard;
const discord_js_1 = require("discord.js");
const spoiler_js_1 = require("./spoiler.js");
const goalCard_js_1 = require("./goalCard.js");
function buildFinalCard(boxscore, spoilerMode, guild) {
    const { homeTeam, awayTeam } = boxscore;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${(0, goalCard_js_1.getTeamEmoji)(awayTeam.abbrev, guild)} ${awayTeam.abbrev} @ ${homeTeam.abbrev} ${(0, goalCard_js_1.getTeamEmoji)(homeTeam.abbrev, guild)} - Final`)
        .setColor(0x006847);
    if ((0, spoiler_js_1.shouldIncludeScoresInEmbed)(spoilerMode)) {
        embed.addFields({ name: `${(0, goalCard_js_1.getTeamEmoji)(homeTeam.abbrev, guild)} ${homeTeam.abbrev}`, value: `Goals: ${homeTeam.score} | Shots: ${homeTeam.sog}`, inline: true }, { name: `${(0, goalCard_js_1.getTeamEmoji)(awayTeam.abbrev, guild)} ${awayTeam.abbrev}`, value: `Goals: ${awayTeam.score} | Shots: ${awayTeam.sog}`, inline: true });
    }
    // Three stars
    const stars = boxscore.summary?.threeStars;
    if (stars && stars.length > 0) {
        const starLines = stars.map(s => {
            const name = s.name?.default
                ?? `${s.firstName?.default ?? ''} ${s.lastName?.default ?? ''}`.trim()
                ?? 'Unknown';
            const num = s.sweaterNumber ? `#${s.sweaterNumber}` : '';
            const team = s.teamAbbrev ?? '';
            const starEmoji = '⭐'.repeat(s.star);
            return `${starEmoji} ${num} ${name} (${team})`;
        }).join('\n');
        embed.addFields({ name: 'Stars of the Game', value: starLines, inline: false });
    }
    // Home team logo as thumbnail
    if (homeTeam.logo) {
        embed.setThumbnail(homeTeam.logo);
    }
    // Spoiler-wrapped score line
    let content;
    const scoreLine = (0, spoiler_js_1.formatScoreLine)(awayTeam.abbrev, awayTeam.score, homeTeam.abbrev, homeTeam.score, awayTeam.sog, homeTeam.sog, spoilerMode);
    if (scoreLine) {
        content = scoreLine;
    }
    return { content, embed };
}
//# sourceMappingURL=finalCard.js.map