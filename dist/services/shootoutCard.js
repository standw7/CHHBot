"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shootoutState = shootoutState;
exports.isDecided = isDecided;
exports.goalsFor = goalsFor;
exports.buildShootoutCard = buildShootoutCard;
const discord_js_1 = require("discord.js");
const goalCard_js_1 = require("./goalCard.js");
const ATTEMPT_TYPES = {
    'goal': 'goal',
    'shot-on-goal': 'save',
    'missed-shot': 'miss',
    'failed-shot-attempt': 'miss',
};
function shootoutState(pbp) {
    const soPlays = pbp.plays.filter(p => p.periodDescriptor?.periodType === 'SO');
    if (soPlays.length === 0)
        return null;
    const spots = pbp.rosterSpots ?? [];
    const attempts = [];
    for (const play of soPlays) {
        const result = ATTEMPT_TYPES[play.typeDescKey];
        if (!result)
            continue;
        const d = play.details;
        const shooterId = d?.scoringPlayerId ?? d?.shootingPlayerId;
        const spot = spots.find(s => s.playerId === shooterId);
        attempts.push({
            eventId: play.eventId,
            teamAbbrev: d?.eventOwnerTeamId === pbp.homeTeam.id ? pbp.homeTeam.abbrev : pbp.awayTeam.abbrev,
            shooter: spot?.lastName.default ?? 'Unknown',
            result,
            shotType: d?.shotType,
            missReason: result === 'miss' && d?.reason ? formatReason(d.reason) : undefined,
        });
    }
    // The NHL can flag the end a poll after the deciding attempt, so also work it out
    // from the attempts — otherwise the deciding attempt would post twice.
    const complete = isDecided(attempts, pbp.awayTeam.abbrev, pbp.homeTeam.abbrev)
        || soPlays.some(p => p.typeDescKey === 'shootout-complete')
        || pbp.gameState === 'FINAL' || pbp.gameState === 'OFF';
    return { away: pbp.awayTeam, home: pbp.homeTeam, attempts, complete };
}
/** True once one team has won: out of reach within the first 3 rounds, or ahead after an even round. */
function isDecided(attempts, away, home) {
    const shots = (abbrev) => attempts.filter(a => a.teamAbbrev === abbrev);
    const awayShots = shots(away).length;
    const homeShots = shots(home).length;
    const awayGoals = shots(away).filter(a => a.result === 'goal').length;
    const homeGoals = shots(home).filter(a => a.result === 'goal').length;
    if (awayShots === homeShots && awayShots >= MIN_ROUNDS)
        return awayGoals !== homeGoals;
    if (awayShots <= MIN_ROUNDS && homeShots <= MIN_ROUNDS) {
        return awayGoals + (MIN_ROUNDS - awayShots) < homeGoals || homeGoals + (MIN_ROUNDS - homeShots) < awayGoals;
    }
    return false;
}
function formatReason(reason) {
    if (reason.includes('post'))
        return 'hit post';
    if (reason.includes('crossbar'))
        return 'hit crossbar';
    return reason.replace(/-/g, ' ');
}
function goalsFor(state, abbrev) {
    return state.attempts.filter(a => a.teamAbbrev === abbrev && a.result === 'goal').length;
}
const MARK = { goal: '✅', save: '❌', miss: '❌' };
const EMPTY = '⬜';
const MIN_ROUNDS = 3;
// One row per team: a mark per attempt, padded with empty boxes to the 3 guaranteed rounds
function marksRow(state, abbrev, rounds) {
    const marks = state.attempts.filter(a => a.teamAbbrev === abbrev).map(a => MARK[a.result]);
    // Once it's over, don't show boxes for rounds that were never needed
    const width = state.complete ? marks.length : rounds;
    while (marks.length < width)
        marks.push(EMPTY);
    return marks.join(' ');
}
function attemptLine(a, guild) {
    const detail = a.result === 'miss' ? a.missReason ?? 'missed' : a.result === 'save' ? 'saved' : a.shotType ?? 'scores';
    return `${(0, goalCard_js_1.getTeamEmoji)(a.teamAbbrev, guild)} ${a.shooter} ${MARK[a.result]} *${detail}*`;
}
function buildShootoutCard(state, spoilerMode, primaryTeam, guild) {
    const { away, home, attempts } = state;
    const awayCount = attempts.filter(a => a.teamAbbrev === away.abbrev).length;
    const homeCount = attempts.filter(a => a.teamAbbrev === home.abbrev).length;
    const rounds = Math.max(MIN_ROUNDS, awayCount, homeCount);
    // Scoreboard: away on top, like the rest of the bot's cards
    const awayEmoji = (0, goalCard_js_1.getTeamEmoji)(away.abbrev, guild);
    const homeEmoji = (0, goalCard_js_1.getTeamEmoji)(home.abbrev, guild);
    const lines = [
        `${awayEmoji} **${away.abbrev}**  ${marksRow(state, away.abbrev, rounds)}`,
        `${homeEmoji} **${home.abbrev}**  ${marksRow(state, home.abbrev, rounds)}`,
        '',
    ];
    // Attempts grouped into rounds (a round = one shot from each team)
    const firstTeam = attempts[0]?.teamAbbrev;
    for (let r = 0; r < Math.max(awayCount, homeCount); r++) {
        const inRound = [firstTeam, firstTeam === away.abbrev ? home.abbrev : away.abbrev]
            .map(abbrev => attempts.filter(a => a.teamAbbrev === abbrev)[r])
            .filter((a) => a !== undefined);
        const label = r < MIN_ROUNDS ? `Round ${r + 1}` : `Round ${r + 1} · sudden death`;
        lines.push(`**${label}**`, ...inRound.map(a => attemptLine(a, guild)));
    }
    let color = 0x006847;
    if (state.complete) {
        const awayGoals = goalsFor(state, away.abbrev);
        const homeGoals = goalsFor(state, home.abbrev);
        const winner = awayGoals > homeGoals ? away : home;
        const winnerName = winner.commonName?.default ?? winner.name?.default ?? winner.abbrev;
        const result = `🏆 ${(0, goalCard_js_1.getTeamEmoji)(winner.abbrev, guild)} **${winnerName}** win the shootout ${Math.max(awayGoals, homeGoals)}–${Math.min(awayGoals, homeGoals)}`;
        lines.push('', spoilerMode === 'off' ? result : `||${result}||`);
        if (primaryTeam && spoilerMode === 'off') {
            color = winner.abbrev === primaryTeam ? 0xFFD700 : 0x8B0000;
        }
    }
    else if (attempts.length === 0) {
        lines.push('*First shooter coming up…*');
    }
    return new discord_js_1.EmbedBuilder()
        .setTitle(`🥅 Shootout · ${awayEmoji} ${away.abbrev} @ ${home.abbrev} ${homeEmoji}`)
        .setDescription(lines.join('\n'))
        .setColor(color);
}
//# sourceMappingURL=shootoutCard.js.map