"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamEmoji = getTeamEmoji;
exports.buildGoalCard = buildGoalCard;
const discord_js_1 = require("discord.js");
const spoiler_js_1 = require("./spoiler.js");
const STRENGTH_LABELS = {
    ev: 'Even Strength (5v5)',
    pp: 'Power Play',
    sh: 'Short Handed',
};
function getTeamEmoji(abbrev, guild) {
    if (guild) {
        const emoji = guild.emojis.cache.find(e => e.name?.toLowerCase() === abbrev.toLowerCase());
        if (emoji)
            return `<:${emoji.name}:${emoji.id}>`;
    }
    return abbrev;
}
function getGoalEmoji(scoringTeamAbbrev, primaryTeam, guild) {
    // Use :mammothgoal: for primary team goals, red siren for opponent goals
    if (primaryTeam && scoringTeamAbbrev === primaryTeam && guild) {
        const mammothGoal = guild.emojis.cache.find(e => e.name?.toLowerCase() === 'mammothgoal');
        if (mammothGoal)
            return `<:${mammothGoal.name}:${mammothGoal.id}>`;
    }
    return '🚨';
}
function buildGoalCard(data, spoilerMode) {
    const { landingGoal, play, homeTeam, awayTeam, scoringTeamAbbrev, scoringTeamLogo, guild, primaryTeam } = data;
    // Scorer info
    const scorerFirst = landingGoal?.firstName?.default ?? '';
    const scorerLast = landingGoal?.lastName?.default ?? '';
    const scorerName = landingGoal ? `${scorerFirst} ${scorerLast}` : 'Unknown';
    const scorerNumber = landingGoal?.sweaterNumber ?? '';
    const goalCount = landingGoal?.goalsToDate ?? play.details?.scoringPlayerTotal ?? '?';
    const shotType = landingGoal?.shotType ?? play.details?.shotType ?? '';
    const strength = landingGoal?.strength ?? 'ev';
    // Scoring team full name
    const scoringTeamName = getTeamFullName(scoringTeamAbbrev, homeTeam, awayTeam);
    // --- Title ---
    const strengthLabel = STRENGTH_LABELS[strength] ?? strength;
    const numberStr = scorerNumber ? ` #${scorerNumber}` : '';
    const scoringEmoji = getTeamEmoji(scoringTeamAbbrev, guild);
    const goalEmoji = getGoalEmoji(scoringTeamAbbrev, primaryTeam, guild);
    const title = `${scoringEmoji} ${goalEmoji} ${scoringTeamName}${numberStr} ${strengthLabel} Goal ${goalEmoji} ${scoringEmoji}`;
    // --- Description ---
    let description = '';
    // Scorer line: #10 Matty Beniers (13) wrist assists: #19 Jared McCann (12), #62 Brandon Montour (14)
    const numberPrefix = scorerNumber ? `#${scorerNumber} ` : '';
    description += `${numberPrefix}${scorerName} (${goalCount})`;
    if (shotType)
        description += ` ${shotType}`;
    if (landingGoal?.assists && landingGoal.assists.length > 0) {
        const assistList = landingGoal.assists.map(a => {
            const num = a.sweaterNumber ? `#${a.sweaterNumber} ` : '';
            return `${num}${a.firstName.default} ${a.lastName.default} (${a.assistsToDate})`;
        }).join(', ');
        description += ` assists: ${assistList}`;
    }
    else if (landingGoal?.assists?.length === 0) {
        description += ' (unassisted)';
    }
    // Score section (respect spoiler mode)
    const homeScore = landingGoal?.homeScore ?? play.details?.homeScore ?? homeTeam.score;
    const awayScore = landingGoal?.awayScore ?? play.details?.awayScore ?? awayTeam.score;
    if ((0, spoiler_js_1.shouldIncludeScoresInEmbed)(spoilerMode)) {
        const homeTeamName = getTeamFullName(homeTeam.abbrev, homeTeam, awayTeam);
        const awayTeamName = getTeamFullName(awayTeam.abbrev, homeTeam, awayTeam);
        const homeEmoji = getTeamEmoji(homeTeam.abbrev, guild);
        const awayEmoji = getTeamEmoji(awayTeam.abbrev, guild);
        description += `\n\n${homeEmoji} **${homeTeamName}** ${homeEmoji}`;
        description += `\nGoals: **${homeScore}**`;
        if (homeTeam.sog !== undefined)
            description += `\nShots: **${homeTeam.sog}**`;
        description += `\n${awayEmoji} **${awayTeamName}** ${awayEmoji}`;
        description += `\nGoals: **${awayScore}**`;
        if (awayTeam.sog !== undefined)
            description += `\nShots: **${awayTeam.sog}**`;
    }
    // Clock at bottom
    const period = play.periodDescriptor?.periodType === 'OT'
        ? 'OT'
        : play.periodDescriptor?.periodType === 'SO'
            ? 'the shootout'
            : `the ${ordinal(play.periodDescriptor?.number ?? 1)} period`;
    const timeRemaining = play.timeRemaining || play.timeInPeriod;
    description += `\n\n${scoringEmoji} ${timeRemaining} left in ${period}`;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x006847)
        .setThumbnail(scoringTeamLogo);
    // Spoiler-wrapped score line as separate content above embed
    let content;
    const scoreLine = (0, spoiler_js_1.formatScoreLine)(awayTeam.abbrev, awayScore, homeTeam.abbrev, homeScore, awayTeam.sog, homeTeam.sog, spoilerMode);
    if (scoreLine) {
        content = scoreLine;
    }
    return { content, embed };
}
function getTeamFullName(abbrev, homeTeam, awayTeam) {
    const team = abbrev === homeTeam.abbrev ? homeTeam : awayTeam;
    return team.commonName?.default ?? team.name?.default ?? abbrev;
}
function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
//# sourceMappingURL=goalCard.js.map