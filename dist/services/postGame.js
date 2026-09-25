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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStandingsLine = formatStandingsLine;
exports.formatStarLine = formatStarLine;
exports.buildThreeStarsCard = buildThreeStarsCard;
exports.startPostGameFollowUp = startPostGameFollowUp;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const goalCard_js_1 = require("./goalCard.js");
const logger = (0, pino_1.default)({ name: 'post-game' });
// After the final card, re-check the NHL every minute for up to an hour for
// updated standings and the published three stars.
const FOLLOW_UP_INTERVAL_MS = 60_000;
const FOLLOW_UP_MAX_ATTEMPTS = 60;
const CARD_COLOR = 0x006847;
function ordinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13)
        return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
function findTeam(standings, team) {
    return standings.find(s => s.teamAbbrev.default === team);
}
/**
 * e.g. "**3rd in Central** (↑ from 4th) · 94 pts · holding a division playoff spot".
 * `before` is the pre-game snapshot (null → no arrow). Returns null if the team is missing.
 */
function formatStandingsLine(before, after, team) {
    const us = findTeam(after, team);
    if (!us)
        return null;
    let place = `**${ordinal(us.divisionSequence)} in ${us.divisionName}**`;
    const prev = before ? findTeam(before, team) : undefined;
    if (prev && prev.divisionSequence !== us.divisionSequence) {
        const arrow = us.divisionSequence < prev.divisionSequence ? '↑' : '↓';
        place += ` (${arrow} from ${ordinal(prev.divisionSequence)})`;
    }
    const parts = [place, `${us.points} pts`];
    if (us.divisionSequence <= 3) {
        parts.push('holding a division playoff spot');
    }
    else if (us.wildcardSequence === 1 || us.wildcardSequence === 2) {
        parts.push(`${ordinal(us.wildcardSequence)} wild card`);
    }
    else {
        const wc2 = after.find(s => s.conferenceAbbrev === us.conferenceAbbrev && s.wildcardSequence === 2);
        if (wc2) {
            const gap = wc2.points - us.points;
            parts.push(gap > 0 ? `${gap} pt${gap === 1 ? '' : 's'} out of a wild card spot` : 'tied on points with the 2nd wild card');
        }
    }
    return parts.join(' · ');
}
/** e.g. "⭐ C. Keller (UTA): 2G 1A" or "⭐⭐⭐ K. Vejmelka (UTA): .957 SV%, 1.01 GAA". */
function formatStarLine(star) {
    const name = star.name?.default ?? `${star.firstName?.default ?? ''} ${star.lastName?.default ?? ''}`.trim();
    const team = star.teamAbbrev ? ` (${star.teamAbbrev})` : '';
    let stats;
    if (star.position === 'G') {
        const sv = star.savePctg !== undefined ? `${star.savePctg.toFixed(3).replace(/^0/, '')} SV%` : '';
        const gaa = star.goalsAgainstAverage !== undefined ? `${star.goalsAgainstAverage.toFixed(2)} GAA` : '';
        stats = [sv, gaa].filter(Boolean).join(', ');
    }
    else {
        stats = `${star.goals ?? 0}G ${star.assists ?? 0}A`;
    }
    return `${'⭐'.repeat(star.star)} ${name}${team}${stats ? `: ${stats}` : ''}`;
}
function buildThreeStarsCard(stars, awayAbbrev, homeAbbrev, guild) {
    const sorted = [...stars].sort((a, b) => a.star - b.star);
    const away = guild ? `${(0, goalCard_js_1.getTeamEmoji)(awayAbbrev, guild)} ${awayAbbrev}` : awayAbbrev;
    const home = guild ? `${homeAbbrev} ${(0, goalCard_js_1.getTeamEmoji)(homeAbbrev, guild)}` : homeAbbrev;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`⭐ Three Stars · ${away} @ ${home}`)
        .setDescription(sorted.map(formatStarLine).join('\n'))
        .setColor(CARD_COLOR);
    if (sorted[0]?.headshot)
        embed.setThumbnail(sorted[0].headshot);
    return embed;
}
/**
 * Polls once a minute (up to an hour): edits the standings line into the final card
 * once the team's games played increments, and posts the three stars card once the
 * NHL publishes them. Not persisted — a restart drops a pending follow-up.
 */
function startPostGameFollowUp(f) {
    const beforeUs = f.standingsBefore ? findTeam(f.standingsBefore, f.teamCode) : undefined;
    let standingsDone = !f.trackStandings || !f.finalMessage || !beforeUs;
    let starsDone = false;
    let attempt = 0;
    const tick = async () => {
        attempt++;
        try {
            if (!starsDone) {
                const landing = await nhlClient.getLanding(f.gameId);
                const stars = landing?.summary?.threeStars;
                if (stars && stars.length > 0) {
                    starsDone = true;
                    const channel = await f.client.channels.fetch(f.channelId);
                    if (channel?.isTextBased()) {
                        const guild = f.client.guilds.cache.get(f.guildId);
                        await channel.send({ embeds: [buildThreeStarsCard(stars, f.awayAbbrev, f.homeAbbrev, guild)] });
                        logger.info({ guildId: f.guildId, gameId: f.gameId }, 'Three stars card posted');
                    }
                }
            }
            if (!standingsDone && beforeUs && f.finalMessage) {
                const standings = (await nhlClient.getStandings(true))?.standings;
                const nowUs = standings ? findTeam(standings, f.teamCode) : undefined;
                if (standings && nowUs && nowUs.gamesPlayed > beforeUs.gamesPlayed) {
                    standingsDone = true;
                    const line = formatStandingsLine(f.standingsBefore, standings, f.teamCode);
                    const original = f.finalMessage.embeds[0];
                    if (line && original) {
                        const embed = discord_js_1.EmbedBuilder.from(original).addFields({ name: '📊 Standings', value: line, inline: false });
                        await f.finalMessage.edit({ embeds: [embed] });
                        logger.info({ guildId: f.guildId, gameId: f.gameId }, 'Standings added to final card');
                    }
                }
            }
        }
        catch (error) {
            logger.error({ error, guildId: f.guildId, gameId: f.gameId, attempt }, 'Post-game follow-up error');
        }
        if ((!starsDone || !standingsDone) && attempt < FOLLOW_UP_MAX_ATTEMPTS) {
            setTimeout(tick, FOLLOW_UP_INTERVAL_MS);
        }
        else if (!starsDone || !standingsDone) {
            logger.warn({ guildId: f.guildId, gameId: f.gameId, starsDone, standingsDone }, 'Post-game follow-up gave up');
        }
    };
    setTimeout(tick, FOLLOW_UP_INTERVAL_MS);
}
//# sourceMappingURL=postGame.js.map