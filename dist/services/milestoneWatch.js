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
exports.findUpcomingMilestones = findUpcomingMilestones;
exports.loadWatchPlayers = loadWatchPlayers;
const pino_1 = __importDefault(require("pino"));
const nhlClient = __importStar(require("../nhl/client.js"));
const milestones_js_1 = require("./milestones.js");
const logger = (0, pino_1.default)({ name: 'milestone-watch' });
const KIND_ORDER = ['debut', 'career_goals', 'career_points', 'season_goals', 'games'];
/**
 * Milestones a player could reach tonight: 1 goal from a season/career goal mark,
 * within 2 points of a career point mark, a hundredth game, or an NHL debut.
 * Uses the same thresholds as the goal-card milestones.
 */
function findUpcomingMilestones(players) {
    const found = [];
    for (const p of players) {
        if (p.careerGamesPlayed === 0) {
            found.push({ kind: 'debut', line: `${p.name}: NHL debut if he plays tonight` });
            continue;
        }
        if (p.careerGoals > 0 && (p.careerGoals + 1) % 100 === 0) {
            found.push({ kind: 'career_goals', line: `${p.name}: 1 goal from ${p.careerGoals + 1} career goals` });
        }
        const pointMark = milestones_js_1.CAREER_POINT_THRESHOLDS.find(t => t - p.careerPoints >= 1 && t - p.careerPoints <= 2);
        if (pointMark !== undefined) {
            const away = pointMark - p.careerPoints;
            found.push({
                kind: 'career_points',
                line: `${p.name}: ${away} point${away === 1 ? '' : 's'} from ${pointMark} career points`,
            });
        }
        if (milestones_js_1.SEASON_GOAL_THRESHOLDS.includes(p.seasonGoals + 1)) {
            found.push({ kind: 'season_goals', line: `${p.name}: 1 goal from ${p.seasonGoals + 1} this season` });
        }
        if ((p.careerGamesPlayed + 1) % 100 === 0) {
            found.push({ kind: 'games', line: `${p.name}: ${p.careerGamesPlayed + 1}th NHL game if he plays tonight` });
        }
    }
    return KIND_ORDER.flatMap(kind => found.filter(f => f.kind === kind).map(f => f.line));
}
/**
 * Loads the current roster's regular-season stats. `season` is the game's season id
 * (e.g. 20262027); until a player's featured season matches it, his season goals are 0
 * (before his first game the NHL still reports last season). Players whose profile
 * fails to load are skipped rather than treated as zeros (which would read as a debut).
 * Returns null if the roster itself can't be loaded.
 */
async function loadWatchPlayers(teamCode, season) {
    const roster = await nhlClient.getRoster(teamCode);
    if (!roster)
        return null;
    const rosterPlayers = [...roster.forwards, ...roster.defensemen, ...roster.goalies];
    const players = [];
    for (const rp of rosterPlayers) {
        const landing = await nhlClient.getPlayerStats(rp.id);
        if (!landing) {
            logger.warn({ playerId: rp.id }, 'Player stats unavailable, skipping for milestone watch');
            continue;
        }
        const career = landing.careerTotals?.regularSeason;
        const featured = landing.featuredStats;
        const seasonGoals = featured?.season === season ? featured.regularSeason?.subSeason.goals ?? 0 : 0;
        players.push({
            name: rp.lastName.default,
            careerGamesPlayed: career?.gamesPlayed ?? 0,
            careerGoals: career?.goals ?? 0,
            careerPoints: career?.points ?? 0,
            seasonGoals,
        });
    }
    return players;
}
//# sourceMappingURL=milestoneWatch.js.map