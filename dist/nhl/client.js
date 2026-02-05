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
exports.getSchedule = getSchedule;
exports.getWeekSchedule = getWeekSchedule;
exports.getPlayByPlay = getPlayByPlay;
exports.getBoxscore = getBoxscore;
exports.getLanding = getLanding;
exports.getGoalReplay = getGoalReplay;
exports.getTvSchedule = getTvSchedule;
exports.getClubStats = getClubStats;
exports.clearCache = clearCache;
const pino_1 = __importDefault(require("pino"));
const endpoints = __importStar(require("./endpoints.js"));
const logger = (0, pino_1.default)({ name: 'nhl-client' });
const cache = new Map();
const SCHEDULE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CACHE_TTL = 30 * 1000; // 30 seconds
async function fetchJson(url, cacheTtl = DEFAULT_CACHE_TTL) {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
            });
            if (!response.ok) {
                if (response.status === 404) {
                    logger.warn({ url, status: 404 }, 'NHL API returned 404');
                    return null;
                }
                if (response.status === 429 || response.status >= 500) {
                    const delay = Math.pow(2, attempt) * 1000;
                    logger.warn({ url, status: response.status, attempt, delay }, 'NHL API error, retrying');
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                logger.error({ url, status: response.status }, 'NHL API unexpected status');
                return null;
            }
            const data = await response.json();
            cache.set(url, { data, expiresAt: Date.now() + cacheTtl });
            return data;
        }
        catch (error) {
            const delay = Math.pow(2, attempt) * 1000;
            logger.error({ url, attempt, error }, 'NHL API fetch error, retrying');
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    logger.error({ url }, 'NHL API request failed after 3 attempts');
    return null;
}
async function getSchedule(teamCode) {
    return fetchJson(endpoints.scheduleUrl(teamCode), SCHEDULE_CACHE_TTL);
}
async function getWeekSchedule(teamCode) {
    return fetchJson(endpoints.weekScheduleUrl(teamCode), SCHEDULE_CACHE_TTL);
}
async function getPlayByPlay(gameId) {
    return fetchJson(endpoints.playByPlayUrl(gameId));
}
async function getBoxscore(gameId) {
    return fetchJson(endpoints.boxscoreUrl(gameId));
}
async function getLanding(gameId) {
    return fetchJson(endpoints.landingUrl(gameId));
}
async function getGoalReplay(gameId, eventNumber) {
    return fetchJson(endpoints.goalReplayUrl(gameId, eventNumber));
}
async function getTvSchedule(date) {
    const url = date ? endpoints.tvScheduleDateUrl(date) : endpoints.tvScheduleNowUrl();
    return fetchJson(url, SCHEDULE_CACHE_TTL);
}
async function getClubStats(teamCode) {
    return fetchJson(endpoints.clubStatsUrl(teamCode), SCHEDULE_CACHE_TTL);
}
function clearCache() {
    cache.clear();
}
//# sourceMappingURL=client.js.map