"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMoneyPuckSkaters = getMoneyPuckSkaters;
exports.clearMoneyPuckCache = clearMoneyPuckCache;
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'moneypuck' });
const SKATERS_CSV_URL = 'https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/skaters.csv';
// Cache stores only the filtered "all" situation rows (~800 players, ~50KB in memory)
let cache = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
async function getMoneyPuckSkaters(teamCode) {
    // Check cache
    if (cache && cache.expiresAt > Date.now()) {
        return filterByTeam(cache.data, teamCode);
    }
    try {
        const response = await fetch(SKATERS_CSV_URL, {
            headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
        });
        if (!response.ok) {
            logger.warn({ status: response.status }, 'MoneyPuck CSV fetch failed');
            return null;
        }
        const csv = await response.text();
        const skaters = parseCSVEfficient(csv);
        cache = { data: skaters, expiresAt: Date.now() + CACHE_TTL };
        logger.info({ playerCount: skaters.length }, 'MoneyPuck data cached');
        return filterByTeam(skaters, teamCode);
    }
    catch (error) {
        logger.error({ error }, 'MoneyPuck fetch error');
        return null;
    }
}
function parseCSVEfficient(csv) {
    const lines = csv.split('\n');
    if (lines.length === 0)
        return [];
    // Parse header to get column indices
    const headers = lines[0].split(',');
    const idx = {
        playerId: headers.indexOf('playerId'),
        name: headers.indexOf('name'),
        team: headers.indexOf('team'),
        position: headers.indexOf('position'),
        situation: headers.indexOf('situation'),
        gamesPlayed: headers.indexOf('games_played'),
        hits: headers.indexOf('I_F_hits'),
        takeaways: headers.indexOf('I_F_takeaways'),
        giveaways: headers.indexOf('I_F_giveaways'),
        blockedShots: headers.indexOf('shotsBlockedByPlayer'),
        xGoals: headers.indexOf('I_F_xGoals'),
    };
    const skaters = [];
    // Only keep "all" situation rows (filters ~6000 rows down to ~800)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line)
            continue;
        const values = line.split(',');
        if (values[idx.situation] !== 'all')
            continue;
        skaters.push({
            playerId: values[idx.playerId] ?? '',
            name: values[idx.name] ?? '',
            team: values[idx.team] ?? '',
            position: values[idx.position] ?? '',
            gamesPlayed: parseInt(values[idx.gamesPlayed] ?? '0', 10),
            hits: parseInt(values[idx.hits] ?? '0', 10),
            takeaways: parseInt(values[idx.takeaways] ?? '0', 10),
            giveaways: parseInt(values[idx.giveaways] ?? '0', 10),
            blockedShots: parseInt(values[idx.blockedShots] ?? '0', 10),
            xGoals: parseFloat(values[idx.xGoals] ?? '0'),
        });
    }
    return skaters;
}
function filterByTeam(skaters, teamCode) {
    const normalizedTeam = teamCode.toUpperCase();
    return skaters.filter(s => s.team.toUpperCase() === normalizedTeam);
}
function clearMoneyPuckCache() {
    cache = null;
}
//# sourceMappingURL=moneyPuck.js.map