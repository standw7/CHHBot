import * as nhlClient from '../nhl/client.js';
import type { LandingGoal, PlayerSeasonStats } from '../nhl/types.js';

export type LeaderCategory = 'goals' | 'assists' | 'points' | 'goalsPp' | 'goalsSh';

export const LEADER_CATEGORIES: LeaderCategory[] = ['goals', 'assists', 'points', 'goalsPp', 'goalsSh'];

const CATEGORY_LABEL: Record<LeaderCategory, string> = {
  goals: 'goals',
  assists: 'assists',
  points: 'points',
  goalsPp: 'power-play goals',
  goalsSh: 'shorthanded goals',
};

// More players than this sharing the top 3 (e.g. 30 tied at 1 SH goal in October) → no alert.
const MAX_TOP3_ROWS = 5;

export interface LeaderRow {
  id: number;
  name: string; // last name
  team: string;
  value: number;
}

export type LeaderSnapshot = Record<LeaderCategory, LeaderRow[]>;

export interface LeaderAlert {
  title: string;
  lines: string[];
}

function ordinal(n: number): string {
  return `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
}

/**
 * Whether going from `before` to `after` moves the player into the NHL top 3 or into 1st
 * (alone or tied) in a category, given everyone else's current values. Ranks share ties:
 * rank = 1 + number of players strictly ahead. Returns the alert with the top 3, or null.
 */
export function evaluateLeaderMove(
  category: LeaderCategory,
  player: { id: number; name: string; team: string },
  before: number,
  after: number,
  board: LeaderRow[]
): LeaderAlert | null {
  const others = board.filter(r => r.id !== player.id);
  const rankFor = (v: number) => 1 + others.filter(r => r.value > v).length;
  const rankBefore = rankFor(before);
  const rankAfter = rankFor(after);

  const tiedBefore = others.some(r => r.value === before);
  const tied = others.some(r => r.value === after);

  const entered = rankBefore > 3 && rankAfter <= 3;
  // Reaching 1st from below, or going from tied for 1st to sole leader
  const tookLead = rankAfter === 1 && (rankBefore > 1 || (tiedBefore && !tied));
  if (!entered && !tookLead) return null;

  const everyone = [...others, { ...player, value: after }].sort((a, b) => b.value - a.value);
  const ranked = everyone.map(r => ({ ...r, rank: 1 + everyone.filter(o => o.value > r.value).length }));
  const top = ranked.filter(r => r.rank <= 3);
  if (top.length > MAX_TOP3_ROWS) return null;

  const label = CATEGORY_LABEL[category];
  let title: string;
  if (rankAfter === 1) {
    title = tied ? `${player.name} ties for the NHL lead in ${label}` : `${player.name} takes the NHL lead in ${label}`;
  } else {
    title = tied
      ? `${player.name} moves into a tie for ${ordinal(rankAfter)} in the NHL in ${label}`
      : `${player.name} moves into ${ordinal(rankAfter)} in the NHL in ${label}`;
  }

  const lines: string[] = [];
  for (const rank of [...new Set(top.map(r => r.rank))]) {
    const group = top.filter(r => r.rank === rank);
    const prefix = group.length > 1 ? `T-${rank}.` : `${rank}.`;
    lines.push(`${prefix} ${group.map(r => `${r.name} (${r.team}) ${r.value}`).join(' · ')}`);
  }
  return { title: `📈 ${title}`, lines };
}

/** A player's in-game totals from the goals so far (shootout goals excluded). */
export function inGameTotals(playerId: number, goalsSoFar: LandingGoal[]): Record<LeaderCategory, number> {
  const real = goalsSoFar.filter(g => g.periodType !== 'SO');
  const scored = real.filter(g => g.playerId === playerId);
  const assists = real.filter(g => g.assists.some(a => a.playerId === playerId)).length;
  return {
    goals: scored.length,
    assists,
    points: scored.length + assists,
    goalsPp: scored.filter(g => g.strength === 'pp').length,
    goalsSh: scored.filter(g => g.strength === 'sh').length,
  };
}

/** Categories a goal can change for its scorer or an assister. */
export function categoriesForGoal(goal: LandingGoal, role: 'scorer' | 'assister'): LeaderCategory[] {
  if (role === 'assister') return ['assists', 'points'];
  const cats: LeaderCategory[] = ['goals', 'points'];
  if (goal.strength === 'pp') cats.push('goalsPp');
  if (goal.strength === 'sh') cats.push('goalsSh');
  return cats;
}

const SNAPSHOT_DEPTH = 100;

/** League top-100 per category, or null if unavailable. Taken when a game goes LIVE. */
export async function loadLeaderSnapshot(): Promise<LeaderSnapshot | null> {
  const res = await nhlClient.getSkaterLeaders(LEADER_CATEGORIES, SNAPSHOT_DEPTH);
  if (!res) return null;
  const snapshot = {} as LeaderSnapshot;
  for (const cat of LEADER_CATEGORIES) {
    snapshot[cat] = (res[cat] ?? []).map(e => ({ id: e.id, name: e.lastName.default, team: e.teamAbbrev, value: e.value }));
  }
  return snapshot;
}

/** A player's pre-game season totals per category from his landing featured stats. */
export function seasonTotalsFrom(stats: PlayerSeasonStats | undefined): Record<LeaderCategory, number> {
  return {
    goals: stats?.goals ?? 0,
    assists: stats?.assists ?? 0,
    points: stats?.points ?? 0,
    goalsPp: stats?.powerPlayGoals ?? 0,
    goalsSh: stats?.shorthandedGoals ?? 0,
  };
}

/**
 * NHL top-3 alerts for one goal: the scorer and each assister, in the categories this
 * goal changes. Team players on the board get their in-game totals added; everyone
 * else uses the pre-game snapshot.
 */
export function leaderAlertsForGoal(input: {
  goal: LandingGoal;
  goalsSoFar: LandingGoal[]; // up to and including this goal
  teamCode: string;
  snapshot: LeaderSnapshot;
  seasonBefore: Map<number, Record<LeaderCategory, number>>; // pre-game season totals by playerId
}): LeaderAlert[] {
  const { goal, goalsSoFar, teamCode, snapshot, seasonBefore } = input;
  if (goal.periodType === 'SO') return [];
  const priorGoals = goalsSoFar.filter(g => g.eventId !== goal.eventId);

  const subjects = [
    { id: goal.playerId, name: goal.lastName.default, role: 'scorer' as const },
    ...goal.assists.map(a => ({ id: a.playerId, name: a.lastName.default, role: 'assister' as const })),
  ];

  const alerts: LeaderAlert[] = [];
  for (const subject of subjects) {
    const season = seasonBefore.get(subject.id);
    if (!season) continue;
    const beforeGame = inGameTotals(subject.id, priorGoals);
    const afterGame = inGameTotals(subject.id, goalsSoFar);
    for (const cat of categoriesForGoal(goal, subject.role)) {
      const board = snapshot[cat].map(r =>
        r.team === teamCode ? { ...r, value: r.value + inGameTotals(r.id, goalsSoFar)[cat] } : r
      );
      const alert = evaluateLeaderMove(
        cat,
        { id: subject.id, name: subject.name, team: teamCode },
        season[cat] + beforeGame[cat],
        season[cat] + afterGame[cat],
        board
      );
      if (alert) alerts.push(alert);
    }
  }
  return alerts;
}
