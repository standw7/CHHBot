import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { SEASON_GOAL_THRESHOLDS } from './milestones.js';
import { isOut, normalizeName } from './injuries.js';
import type { InjuryEntry } from './injuries.js';

const logger = pino({ name: 'milestone-watch' });

// All figures are regular-season totals before tonight's game.
export interface WatchPlayer {
  name: string;
  fullName?: string; // "Clayton Keller", for matching the injury report
  dayToDay?: boolean; // on the injury report as day-to-day: may or may not play
  careerGamesPlayed: number;
  careerGoals: number;
  careerPoints: number;
  careerAssists: number;
  seasonGoals: number;
}

// Lines are grouped by kind in this order, then by roster order within a kind.
type Kind = 'debut' | 'career_goals' | 'career_points' | 'career_assists' | 'season_goals' | 'games';
const KIND_ORDER: Kind[] = ['debut', 'career_goals', 'career_points', 'career_assists', 'season_goals', 'games'];

/**
 * Milestones a player could reach tonight: 1 goal from a season/career goal mark,
 * within 2 of the next hundred career points or assists, a hundredth game, or an NHL debut.
 * Uses the same thresholds as the goal-card milestones.
 */
export function findUpcomingMilestones(players: WatchPlayer[]): string[] {
  const found: { kind: Kind; line: string }[] = [];

  for (const p of players) {
    const tag = p.dayToDay ? ' (day-to-day)' : '';
    const before = found.length;
    findForPlayer(p, found);
    for (let i = before; i < found.length; i++) found[i].line += tag;
  }

  return KIND_ORDER.flatMap(kind => found.filter(f => f.kind === kind).map(f => f.line));
}

/**
 * Drops players who are out (injured reserve, out) per the injury report and flags
 * day-to-day ones. With no report (null), everyone is kept.
 */
export function excludeInjured(players: WatchPlayer[], injuries: Map<string, InjuryEntry> | null): WatchPlayer[] {
  if (!injuries) return players;
  const result: WatchPlayer[] = [];
  for (const p of players) {
    const status = p.fullName ? injuries.get(normalizeName(p.fullName))?.status : undefined;
    if (status === undefined) result.push(p);
    else if (!isOut(status)) result.push({ ...p, dayToDay: true });
  }
  return result;
}

function findForPlayer(p: WatchPlayer, found: { kind: Kind; line: string }[]): void {
  if (p.careerGamesPlayed === 0) {
    found.push({ kind: 'debut', line: `${p.name}: NHL debut if he plays tonight` });
    return;
  }

  if (p.careerGoals > 0 && (p.careerGoals + 1) % 100 === 0) {
    found.push({ kind: 'career_goals', line: `${p.name}: 1 goal from ${p.careerGoals + 1} career goals` });
  }

  const pointMark = (Math.floor(p.careerPoints / 100) + 1) * 100;
  const away = pointMark - p.careerPoints;
  if (away <= 2) {
    found.push({
      kind: 'career_points',
      line: `${p.name}: ${away} point${away === 1 ? '' : 's'} from ${pointMark} career points`,
    });
  }

  const assistMark = (Math.floor(p.careerAssists / 100) + 1) * 100;
  const assistsAway = assistMark - p.careerAssists;
  if (assistsAway <= 2) {
    found.push({
      kind: 'career_assists',
      line: `${p.name}: ${assistsAway} assist${assistsAway === 1 ? '' : 's'} from ${assistMark} career assists`,
    });
  }

  if (SEASON_GOAL_THRESHOLDS.includes(p.seasonGoals + 1)) {
    found.push({ kind: 'season_goals', line: `${p.name}: 1 goal from ${p.seasonGoals + 1} this season` });
  }

  if ((p.careerGamesPlayed + 1) % 100 === 0) {
    found.push({ kind: 'games', line: `${p.name}: ${p.careerGamesPlayed + 1}th NHL game if he plays tonight` });
  }
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
      fullName: `${rp.firstName.default} ${rp.lastName.default}`,
      careerGamesPlayed: career?.gamesPlayed ?? 0,
      careerGoals: career?.goals ?? 0,
      careerPoints: career?.points ?? 0,
      careerAssists: career?.assists ?? 0,
      seasonGoals,
    });
  }
  return players;
}
