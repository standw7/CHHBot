"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapScore = wrapScore;
exports.shouldIncludeScoresInEmbed = shouldIncludeScoresInEmbed;
exports.formatScoreLine = formatScoreLine;
function wrapScore(text, mode) {
    if (mode === 'off')
        return text;
    return `||${text}||`;
}
function shouldIncludeScoresInEmbed(mode) {
    return mode === 'off';
}
function formatScoreLine(awayAbbrev, awayScore, homeAbbrev, homeScore, awaySog, homeSog, mode) {
    if (mode === 'off')
        return null;
    let line = `${awayAbbrev} ${awayScore} - ${homeAbbrev} ${homeScore}`;
    if (awaySog !== undefined && homeSog !== undefined) {
        line += ` (shots ${awaySog}-${homeSog})`;
    }
    return `||${line}||`;
}
//# sourceMappingURL=spoiler.js.map