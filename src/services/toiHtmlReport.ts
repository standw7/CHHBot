/**
 * Fallback source for shift data: the NHL's HTML TOI shift reports
 * (nhl.com/scores/htmlreports/<season>/TH|TV<game>.HTM).
 *
 * The shiftcharts API sometimes never gets populated for a game (e.g. 2026020164 and
 * 2026020177 still return zero rows weeks later), while these reports are always
 * published. Parsed into ShiftChartRow so the rest of the TOI pipeline is unchanged.
 */
import pino from 'pino';
import type { ShiftChartRow } from '../nhl/types.js';

const logger = pino({ name: 'toi-html' });

const SHIFT_TYPE = 517;

/** e.g. 2026020164 → https://www.nhl.com/scores/htmlreports/20262027/TH020164.HTM */
export function shiftReportUrl(gameId: number, side: 'home' | 'away'): string {
  const id = String(gameId);
  const season = Number(id.slice(0, 4));
  return `https://www.nhl.com/scores/htmlreports/${season}${season + 1}/${side === 'home' ? 'TH' : 'TV'}${id.slice(4)}.HTM`;
}

function periodNumber(p: string): number | null {
  if (p === 'OT') return 4;
  if (p === 'SO') return null; // shootout attempts aren't shifts
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const cell = (inner: string) => `<td[^>]*>\\s*${inner}\\s*</td>\\s*`;
// Shift # | Per | Start (elapsed / remaining) | End (elapsed / remaining) | Duration
const SHIFT_ROW = new RegExp(
  cell('(\\d+)') + cell('(\\d+|OT|SO)') + cell('(\\d+:\\d\\d)\\s*/\\s*\\d+:\\d\\d') + cell('(\\d+:\\d\\d)\\s*/\\s*\\d+:\\d\\d') + cell('(\\d+:\\d\\d)'),
  'g',
);
const HEADING = /class="playerHeading[^"]*"[^>]*>\s*(\d+)\s+([^<]*?)\s*<\/td>/g;

/**
 * Shifts for one team's report. `sweaterToId` maps jersey number → NHL playerId for that
 * team (from the boxscore); players not in it are skipped.
 */
export function parseShiftReport(html: string, teamAbbrev: string, sweaterToId: Map<number, number>): ShiftChartRow[] {
  const headings = [...html.matchAll(HEADING)];
  const rows: ShiftChartRow[] = [];
  headings.forEach((h, i) => {
    const playerId = sweaterToId.get(Number(h[1]));
    if (playerId === undefined) return;
    const [lastName = '', firstName = ''] = h[2].split(',').map(s => s.trim());
    const section = html.slice(h.index! + h[0].length, headings[i + 1]?.index ?? html.length);
    for (const m of section.matchAll(SHIFT_ROW)) {
      const period = periodNumber(m[2]);
      if (period === null) continue;
      rows.push({ playerId, firstName, lastName, teamAbbrev, period, startTime: m[3], endTime: m[4], duration: m[5], typeCode: SHIFT_TYPE });
    }
  });
  return rows;
}

export interface ReportTeam {
  abbrev: string;
  players: { playerId: number; sweaterNumber?: number }[];
}

/** Both teams' shifts from the HTML reports, or null if either report can't be fetched. */
export async function fetchShiftReports(gameId: number, home: ReportTeam, away: ReportTeam): Promise<ShiftChartRow[] | null> {
  const load = async (side: 'home' | 'away', team: ReportTeam) => {
    const url = shiftReportUrl(gameId, side);
    const res = await fetch(url, { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
    if (!res.ok) {
      logger.info({ gameId, url, status: res.status }, 'Shift report not available');
      return null;
    }
    // The reports are Windows-1252; names aren't used for matching, so decoding loosely is fine
    const html = new TextDecoder('latin1').decode(await res.arrayBuffer());
    const sweaters = new Map(team.players.flatMap(p => (p.sweaterNumber !== undefined ? [[p.sweaterNumber, p.playerId] as const] : [])));
    return parseShiftReport(html, team.abbrev, sweaters);
  };
  try {
    const [h, a] = await Promise.all([load('home', home), load('away', away)]);
    return h && a ? [...h, ...a] : null;
  } catch (err) {
    logger.warn({ err, gameId }, 'Shift report fetch failed');
    return null;
  }
}
