import pino from 'pino';

const logger = pino({ name: 'injuries' });

// The NHL API has no injury list, so this uses ESPN's league-wide injury report.
const ESPN_INJURIES_URL = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries';

export interface InjuryEntry {
  name: string; // "Dylan Guenther"
  lastName: string;
  status: string; // ESPN: "Injured Reserve", "Out", "Day-To-Day"
  designation?: string; // ESPN's finer one: "IR", "IR-LT", "IR-NR", "OUT", "Day-To-Day"
  part?: string; // "Upper Body", "Knee", "Undisclosed"
  returnDate?: string; // ESPN's estimate, YYYY-MM-DD
}

interface EspnInjury {
  status: string;
  athlete: { displayName: string; lastName?: string };
  details?: { type?: string; returnDate?: string; fantasyStatus?: { abbreviation?: string } };
}

export interface EspnInjuryResponse {
  injuries?: { displayName: string; injuries: EspnInjury[] }[]; // displayName: "Utah Mammoth"
}

/** Lowercase, accents and punctuation stripped, so "Montréal" matches "Montreal" and "J.J." matches "JJ". */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Day-to-day players may still play; everyone else on the report is out. */
export function isOut(status: string): boolean {
  return normalizeName(status) !== 'daytoday';
}

/** One team's injuries, keyed by normalized player name, from an ESPN report. */
export function teamInjuries(report: EspnInjuryResponse, teamFullName: string): Map<string, InjuryEntry> | null {
  const team = report.injuries?.find(t => normalizeName(t.displayName) === normalizeName(teamFullName));
  if (!team) return report.injuries ? new Map() : null; // a team with no injuries isn't listed
  return new Map(team.injuries.map(i => [normalizeName(i.athlete.displayName), {
    name: i.athlete.displayName,
    lastName: i.athlete.lastName ?? i.athlete.displayName.split(' ').slice(-1)[0],
    status: i.status,
    designation: i.details?.fantasyStatus?.abbreviation,
    part: i.details?.type,
    returnDate: i.details?.returnDate,
  }]));
}

const DESIGNATION_LABELS: Record<string, string> = {
  'IR': 'IR',
  'IR-LT': 'LTIR',
  'IR-NR': 'IR (non-roster)',
  'OUT': 'Out',
  'DAY-TO-DAY': 'Day-to-day',
};

function statusLabel(e: InjuryEntry): string {
  return DESIGNATION_LABELS[(e.designation ?? '').toUpperCase()]
    ?? (normalizeName(e.status) === 'injured reserve' ? 'IR' : e.status);
}

function formatReturn(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Card lines, soonest estimated return first: "**Guenther** — IR · upper body · est. return Dec 5".
 * Return dates on or before `todayISO` are left off (stale estimates).
 */
export function formatInjuryLines(injuries: Map<string, InjuryEntry>, todayISO: string): string[] {
  const upcoming = (e: InjuryEntry) => (e.returnDate && e.returnDate.slice(0, 10) > todayISO ? e.returnDate.slice(0, 10) : undefined);
  return [...injuries.values()]
    .sort((a, b) => (upcoming(a) ?? '9999').localeCompare(upcoming(b) ?? '9999') || a.lastName.localeCompare(b.lastName))
    .map(e => {
      const parts = [statusLabel(e)];
      if (e.part) parts.push(e.part.toLowerCase());
      const ret = upcoming(e);
      if (ret) parts.push(`est. return ${formatReturn(ret)}`);
      return `**${e.lastName}** — ${parts.join(' · ')}`;
    });
}

/** The team's current injuries, or null if the report can't be loaded (callers then skip filtering). */
export async function loadTeamInjuries(teamFullName: string): Promise<Map<string, InjuryEntry> | null> {
  try {
    // No custom User-Agent: ESPN 403s "Tusky-Discord-Bot/1.0" but accepts Node's default
    const res = await fetch(ESPN_INJURIES_URL);
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Injury report request failed');
      return null;
    }
    return teamInjuries((await res.json()) as EspnInjuryResponse, teamFullName);
  } catch (err) {
    logger.warn({ err }, 'Failed to load injury report');
    return null;
  }
}
