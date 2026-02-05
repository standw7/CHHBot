"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchStatCategory = matchStatCategory;
exports.buildStatsEmbed = buildStatsEmbed;
exports.buildStatsHelpEmbed = buildStatsHelpEmbed;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../nhl/client.js");
function formatPctg(value) {
    return (value * 100).toFixed(1) + '%';
}
function formatToi(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatPlusMinus(value) {
    return value > 0 ? `+${value}` : `${value}`;
}
function formatGaa(value) {
    return value.toFixed(2);
}
function formatRecord(goalie) {
    return `${goalie.wins}-${goalie.losses}-${goalie.overtimeLosses}`;
}
const STAT_CATEGORIES = [
    // Skater stats
    { key: 'goals', label: 'Goal', abbrev: 'G', type: 'skater', field: 'goals' },
    { key: 'assists', label: 'Assist', abbrev: 'A', type: 'skater', field: 'assists' },
    { key: 'points', label: 'Point', abbrev: 'P', type: 'skater', field: 'points' },
    { key: 'plusminus', label: '+/-', abbrev: '+/-', type: 'skater', field: 'plusMinus', format: formatPlusMinus },
    { key: 'pim', label: 'Penalty Minute', abbrev: 'PIM', type: 'skater', field: 'penaltyMinutes' },
    { key: 'shots', label: 'Shot', abbrev: 'S', type: 'skater', field: 'shots' },
    { key: 'shootingpct', label: 'Shooting %', abbrev: 'SH%', type: 'skater', field: 'shootingPctg', format: formatPctg },
    { key: 'toi', label: 'TOI/GP', abbrev: 'TOI', type: 'skater', field: 'avgTimeOnIcePerGame', format: formatToi },
    { key: 'faceoffpct', label: 'Faceoff %', abbrev: 'FO%', type: 'skater', field: 'faceoffWinPctg', format: formatPctg },
    { key: 'ppg', label: 'Power Play Goal', abbrev: 'PPG', type: 'skater', field: 'powerPlayGoals' },
    { key: 'shg', label: 'Shorthanded Goal', abbrev: 'SHG', type: 'skater', field: 'shorthandedGoals' },
    { key: 'gwg', label: 'Game-Winning Goal', abbrev: 'GWG', type: 'skater', field: 'gameWinningGoals' },
    { key: 'otg', label: 'Overtime Goal', abbrev: 'OTG', type: 'skater', field: 'overtimeGoals' },
    // Goalie stats
    { key: 'wins', label: 'Win', abbrev: 'W', type: 'goalie', field: 'wins' },
    { key: 'losses', label: 'Loss', abbrev: 'L', type: 'goalie', field: 'losses' },
    { key: 'otl', label: 'OT Loss', abbrev: 'OTL', type: 'goalie', field: 'overtimeLosses' },
    { key: 'gaa', label: 'Goals Against Average', abbrev: 'GAA', type: 'goalie', field: 'goalsAgainstAverage', sortAscending: true, format: formatGaa },
    { key: 'savepct', label: 'Save %', abbrev: 'SV%', type: 'goalie', field: 'savePercentage', format: formatPctg },
    { key: 'shutouts', label: 'Shutout', abbrev: 'SO', type: 'goalie', field: 'shutouts' },
    { key: 'record', label: 'Record', abbrev: 'W-L-OTL', type: 'goalie', field: 'wins' }, // Special handling
];
// Ordered so longer phrases are checked before shorter ones
const KEYWORD_MAPPINGS = [
    // Multi-word phrases first (longest match)
    { keywords: ['goals scored'], categoryKey: 'goals' },
    { keywords: ['points per game', 'pts/game'], categoryKey: 'points' }, // Note: API doesn't have PPG stat, using points
    { keywords: ['plus-minus', 'plus minus', 'plusminus', '+/-'], categoryKey: 'plusminus' },
    { keywords: ['penalty minutes', 'pim'], categoryKey: 'pim' },
    { keywords: ['shots on goal', 'sog'], categoryKey: 'shots' },
    { keywords: ['shooting percentage', 'shooting %', 'shot%', 'sh%'], categoryKey: 'shootingpct' },
    { keywords: ['time on ice', 'ice time', 'toi'], categoryKey: 'toi' },
    { keywords: ['faceoff percentage', 'faceoff %', 'fo%', 'faceoffs'], categoryKey: 'faceoffpct' },
    { keywords: ['power-play goals', 'power play goals', 'ppg'], categoryKey: 'ppg' },
    { keywords: ['shorthanded goals', 'short-handed goals', 'shg'], categoryKey: 'shg' },
    { keywords: ['game-winning goals', 'game winning goals', 'game winner', 'gwg'], categoryKey: 'gwg' },
    { keywords: ['overtime goals', 'otg'], categoryKey: 'otg' },
    { keywords: ['save percentage', 'save %', 'sv%', 'save pct'], categoryKey: 'savepct' },
    { keywords: ['goals against average', 'gaa'], categoryKey: 'gaa' },
    { keywords: ['shutouts', 'shutout'], categoryKey: 'shutouts' },
    { keywords: ['record', 'wins', 'losses', 'otl'], categoryKey: 'record' },
    // Single words last
    { keywords: ['points', 'pts'], categoryKey: 'points' },
    { keywords: ['goals', 'goal'], categoryKey: 'goals' },
    { keywords: ['assists', 'assist'], categoryKey: 'assists' },
    { keywords: ['shots', 'shot'], categoryKey: 'shots' },
];
function matchStatCategory(input) {
    const lower = input.toLowerCase().trim();
    for (const mapping of KEYWORD_MAPPINGS) {
        for (const keyword of mapping.keywords) {
            if (lower.includes(keyword)) {
                const cat = STAT_CATEGORIES.find(c => c.key === mapping.categoryKey);
                if (cat)
                    return cat;
            }
        }
    }
    // No match found
    return null;
}
// --- Embed builder ---
const MEDALS = ['🥇', '🥈', '🥉'];
function positionLabel(code) {
    switch (code) {
        case 'C': return 'C';
        case 'L': return 'LW';
        case 'R': return 'RW';
        case 'D': return 'D';
        default: return code;
    }
}
async function buildStatsEmbed(teamCode, query) {
    const category = matchStatCategory(query);
    if (!category) {
        return buildStatNotSupportedEmbed(query);
    }
    const stats = await (0, client_js_1.getClubStats)(teamCode);
    if (!stats) {
        return new discord_js_1.EmbedBuilder()
            .setTitle('Stats Unavailable')
            .setDescription('Could not fetch stats from the NHL API.')
            .setColor(0xff0000);
    }
    if (category.type === 'goalie') {
        if (category.key === 'record') {
            return buildGoalieRecordEmbed(stats.goalies, teamCode);
        }
        return buildGoalieEmbed(stats.goalies, category, teamCode);
    }
    return buildSkaterEmbed(stats.skaters, category, teamCode);
}
function buildStatNotSupportedEmbed(query) {
    return new discord_js_1.EmbedBuilder()
        .setTitle('Stat Not Supported')
        .setDescription(`I couldn't find a stat matching "**${query}**".\n\n` +
        '**Supported skater stats:**\n' +
        'goals, assists, points, +/-, PIM, shots, shooting%, TOI, faceoff%, PPG, SHG, GWG, OTG\n\n' +
        '**Supported goalie stats:**\n' +
        'wins, losses, OTL, record, GAA, save%, shutouts\n\n' +
        '*Note: Hits, blocks, takeaways, giveaways, PP%, PK%, and xG are not available from this API.*')
        .setColor(0xff6600)
        .setFooter({ text: 'Try !stats help for usage examples' });
}
function buildSkaterEmbed(skaters, category, teamCode) {
    const field = category.field;
    const sorted = [...skaters].sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        return category.sortAscending ? aVal - bVal : bVal - aVal;
    });
    const top5 = sorted.slice(0, 5);
    const format = category.format ?? ((v) => `${v}`);
    const lines = top5.map((player, i) => {
        const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`;
        const name = `${player.firstName.default} ${player.lastName.default}`;
        const pos = positionLabel(player.positionCode);
        const val = format(player[field]);
        return `${prefix} **${name}** (${pos}) - **${val}** ${category.abbrev} (${player.gamesPlayed} GP)`;
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${teamCode} ${category.label} Leaders`)
        .setDescription(lines.join('\n'))
        .setColor(0x006847)
        .setFooter({ text: '2025-2026 Season' });
    if (top5[0]?.headshot) {
        embed.setThumbnail(top5[0].headshot);
    }
    return embed;
}
function buildGoalieEmbed(goalies, category, teamCode) {
    const field = category.field;
    const sorted = [...goalies].sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        return category.sortAscending ? aVal - bVal : bVal - aVal;
    });
    const top5 = sorted.slice(0, 5);
    const format = category.format ?? ((v) => `${v}`);
    const lines = top5.map((player, i) => {
        const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`;
        const name = `${player.firstName.default} ${player.lastName.default}`;
        const val = format(player[field]);
        return `${prefix} **${name}** (G) - **${val}** ${category.abbrev} (${player.gamesPlayed} GP)`;
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${teamCode} ${category.label} Leaders`)
        .setDescription(lines.join('\n'))
        .setColor(0x006847)
        .setFooter({ text: '2025-2026 Season' });
    if (top5[0]?.headshot) {
        embed.setThumbnail(top5[0].headshot);
    }
    return embed;
}
function buildGoalieRecordEmbed(goalies, teamCode) {
    // Sort by wins descending
    const sorted = [...goalies].sort((a, b) => b.wins - a.wins);
    const top5 = sorted.slice(0, 5);
    const lines = top5.map((player, i) => {
        const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`;
        const name = `${player.firstName.default} ${player.lastName.default}`;
        const record = formatRecord(player);
        return `${prefix} **${name}** (G) - **${record}** (${player.gamesPlayed} GP)`;
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${teamCode} Goalie Records`)
        .setDescription(lines.join('\n'))
        .setColor(0x006847)
        .setFooter({ text: '2025-2026 Season' });
    if (top5[0]?.headshot) {
        embed.setThumbnail(top5[0].headshot);
    }
    return embed;
}
function buildStatsHelpEmbed() {
    return new discord_js_1.EmbedBuilder()
        .setTitle('Stats Lookup')
        .setDescription('Ask me about team stats! Examples:\n\n' +
        '`@Tusky who leads in goals?`\n' +
        '`@Tusky penalty minutes`\n' +
        '`@Tusky save percentage`\n' +
        '`/stats goals`\n' +
        '`!stats pim`\n\n' +
        '**Skater stats:**\n' +
        'goals, assists, points, +/-, PIM, shots, shooting%, TOI, faceoff%, PPG, SHG, GWG, OTG\n\n' +
        '**Goalie stats:**\n' +
        'wins, losses, OTL, record, GAA, save%, shutouts')
        .setColor(0x006847);
}
//# sourceMappingURL=statsLookup.js.map