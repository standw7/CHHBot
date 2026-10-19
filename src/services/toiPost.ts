import type { ShiftChartRow, BoxscoreTeamPlayers } from '../nhl/types.js';
import { normalizeShifts, hasOpenShifts, isShiftDataComplete, computeFiveOnFive, orderPlayers } from './toiChart.js';
import type { ChartPlayer } from './toiChart.js';
import type { ToiChartInput } from './toiRender.js';

/** One side of a boxscore: abbreviation + its players. */
export interface BoxTeam extends BoxscoreTeamPlayers {
  abbrev: string;
}

function toSeconds(mmss: string): number {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
}

function chartPlayers(team: BoxTeam): ChartPlayer[] {
  return [
    ...team.forwards.map(p => ({ id: p.playerId, label: p.name.default, position: 'F' as const })),
    ...team.defense.map(p => ({ id: p.playerId, label: p.name.default, position: 'D' as const })),
  ];
}

/**
 * Chart input for `teamCode` (rows) vs its opponent (columns), or null if the team isn't
 * in this game, or 'incomplete' while shift data doesn't yet match the boxscore.
 */
export function toiChartInputFromGame(
  rows: ShiftChartRow[],
  home: BoxTeam,
  away: BoxTeam,
  teamCode: string
): ToiChartInput | 'incomplete' | null {
  const us = home.abbrev === teamCode ? home : away.abbrev === teamCode ? away : null;
  if (!us) return null;
  const them = us === home ? away : home;

  const shifts = normalizeShifts(rows);
  const skaters = [home, away].flatMap(t => [...t.forwards, ...t.defense]);
  const boxToi = new Map(skaters.map(p => [p.playerId, toSeconds(p.toi)]));
  if (!isShiftDataComplete(shifts, boxToi, hasOpenShifts(rows))) return 'incomplete';

  const goalieIds = new Set([...home.goalies, ...away.goalies].map(g => g.playerId));
  const five = computeFiveOnFive(shifts, goalieIds, us.abbrev, them.abbrev);
  const ours = orderPlayers(chartPlayers(us), five);
  const theirs = orderPlayers(chartPlayers(them), five);

  return {
    rows: [...ours.forwards, ...ours.defense],
    cols: [...theirs.forwards, ...theirs.defense],
    rowDividerAfter: ours.forwards.length,
    colDividerAfter: theirs.forwards.length,
    seconds: (rowId, colId) => five.against.get(`${rowId}-${colId}`) ?? 0,
    teamCode,
  };
}
