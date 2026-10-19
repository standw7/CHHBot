import type { ShiftChartRow } from '../nhl/types.js';

const SHIFT_TYPE = 517;
const PERIOD_SECONDS = 1200;

/** One shift in absolute game seconds; on ice for start <= t < end. */
export interface Shift {
  playerId: number;
  team: string;
  start: number;
  end: number;
}

/** 5v5 seconds. against: `${teamId}-${opponentId}`; together: `${minId}-${maxId}` same-team pairs (both teams); toi: per skater. */
export interface FiveOnFive {
  against: Map<string, number>;
  together: Map<string, number>;
  toi: Map<number, number>;
}

function toSeconds(mmss: string): number {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
}

export function normalizeShifts(rows: ShiftChartRow[]): Shift[] {
  return rows
    .filter(r => r.typeCode === SHIFT_TYPE && r.duration)
    .map(r => {
      const offset = (r.period - 1) * PERIOD_SECONDS;
      return { playerId: r.playerId, team: r.teamAbbrev, start: offset + toSeconds(r.startTime), end: offset + toSeconds(r.endTime) };
    });
}

/** Right after the final the NHL may publish shifts that haven't closed yet. */
export function hasOpenShifts(rows: ShiftChartRow[]): boolean {
  return rows.some(r => r.typeCode === SHIFT_TYPE && (!r.duration || !r.endTime));
}

/** Complete when nothing is open and every boxscore skater's shifts sum to his TOI (± tolerance). */
export function isShiftDataComplete(
  shifts: Shift[],
  boxscoreToiSec: Map<number, number>,
  hadOpenShifts: boolean,
  toleranceSec = 5
): boolean {
  if (hadOpenShifts) return false;
  const totals = new Map<number, number>();
  for (const s of shifts) totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + (s.end - s.start));
  for (const [playerId, toi] of boxscoreToiSec) {
    if (Math.abs((totals.get(playerId) ?? 0) - toi) > toleranceSec) return false;
  }
  return true;
}

function add(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Per-second walk: a second counts when each team has exactly 5 skaters + 1 goalie on the ice. */
export function computeFiveOnFive(shifts: Shift[], goalieIds: Set<number>, team: string, opponent: string): FiveOnFive {
  const end = shifts.reduce((max, s) => Math.max(max, s.end), 0);
  const onIce: Shift[][] = Array.from({ length: end }, () => []);
  for (const s of shifts) for (let t = s.start; t < s.end; t++) onIce[t].push(s);

  const result: FiveOnFive = { against: new Map(), together: new Map(), toi: new Map() };
  for (const second of onIce) {
    const skaters = (t: string) => second.filter(s => s.team === t && !goalieIds.has(s.playerId)).map(s => s.playerId);
    const goalies = (t: string) => second.filter(s => s.team === t && goalieIds.has(s.playerId)).length;
    const us = skaters(team);
    const them = skaters(opponent);
    if (us.length !== 5 || them.length !== 5 || goalies(team) !== 1 || goalies(opponent) !== 1) continue;

    for (const a of us) for (const b of them) add(result.against, `${a}-${b}`);
    for (const side of [us, them]) {
      for (const id of side) result.toi.set(id, (result.toi.get(id) ?? 0) + 1);
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          add(result.together, `${Math.min(side[i], side[j])}-${Math.max(side[i], side[j])}`);
        }
      }
    }
  }
  return result;
}

export interface ChartPlayer {
  id: number;
  label: string; // "C. McDavid"
  position: 'F' | 'D';
}

export function chartLabel(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}. ${lastName}`;
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

/** Greedy linemate grouping: seed = most 5v5 TOI left, then the teammates he shared the most 5v5 time with. */
function groupByLinemates(players: ChartPlayer[], f: FiveOnFive, groupSize: number): ChartPlayer[] {
  const remaining = players.filter(p => (f.toi.get(p.id) ?? 0) > 0);
  const ordered: ChartPlayer[] = [];
  while (remaining.length > 0) {
    remaining.sort((a, b) => (f.toi.get(b.id) ?? 0) - (f.toi.get(a.id) ?? 0));
    const seed = remaining.shift()!;
    const mates = [...remaining]
      .sort((a, b) => (f.together.get(pairKey(seed.id, b.id)) ?? 0) - (f.together.get(pairKey(seed.id, a.id)) ?? 0))
      .slice(0, groupSize - 1);
    ordered.push(seed, ...mates);
    for (const m of mates) remaining.splice(remaining.indexOf(m), 1);
  }
  return ordered;
}

/** Chart order: forwards in trios, then defense in pairs; skaters with no 5v5 time are left out. */
export function orderPlayers(players: ChartPlayer[], fiveOnFive: FiveOnFive): { forwards: ChartPlayer[]; defense: ChartPlayer[] } {
  return {
    forwards: groupByLinemates(players.filter(p => p.position === 'F'), fiveOnFive, 3),
    defense: groupByLinemates(players.filter(p => p.position === 'D'), fiveOnFive, 2),
  };
}
