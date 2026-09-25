import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { SEASON_GOAL_THRESHOLDS, CAREER_POINT_THRESHOLDS } from './milestones.js';

const logger = pino({ name: 'milestone-watch' });

// All figures are regular-season totals before tonight's game.
export interface WatchPlayer {
  name: string;
  careerGamesPlayed: number;
  careerGoals: number;
  careerPoints: number;
  seasonGoals: number;
}

// Lines are grouped by kind in this order, then by roster order within a kind.
type Kind = 'debut' | 'career_goals' | 'career_points' | 'season_goals' | 'games';
const KIND_ORDER: Kind[] = ['debut', 'career_goals', 'career_points', 'season_goals', 'games'];

/**
 * Milestones a player could reach tonight: 1 goal from a season/career goal mark,
 * within 2 points of a career point mark, a hundredth game, or an NHL debut.
 * Uses the same thresholds as the goal-card milestones.
 */
export function findUpcomingMilestones(players: WatchPlayer[]): string[] {
  const found: { kind: Kind; line: string }[] = [];

  for (const p of players) {
    if (p.careerGamesPlayed === 0) {
      found.push({ kind: 'debut', line: `${p.name}: NHL debut if he plays tonight` });
      continue;
    }

    if (p.careerGoals > 0 && (p.careerGoals + 1) % 100 === 0) {
      found.push({ kind: 'career_goals', line: `${p.name}: 1 goal from ${p.careerGoals + 1} career goals` });
    }

    const pointMark = CAREER_POINT_THRESHOLDS.find(t => t - p.careerPoints >= 1 && t - p.careerPoints <= 2);
    if (pointMark !== undefined) {
      const away = pointMark - p.careerPoints;
      found.push({
        kind: 'career_points',
        line: `${p.name}: ${away} point${away === 1 ? '' : 's'} from ${pointMark} career points`,
      });
    }

    if (SEASON_GOAL_THRESHOLDS.includes(p.seasonGoals + 1)) {
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
export async function loadWatchPlayers(teamCode: string, season: number): Promise<WatchPlayer[] | null> {
  const roster = await nhlClient.getRoster(teamCode);
  if (!roster) return null;

  const rosterPlayers = [...roster.forwards, ...roster.defensemen, ...roster.goalies];
  const players: WatchPlayer[] = [];
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
