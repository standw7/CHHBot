"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeName = normalizeName;
exports.isOut = isOut;
exports.teamInjuries = teamInjuries;
exports.formatInjuryLines = formatInjuryLines;
exports.loadTeamInjuries = loadTeamInjuries;
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'injuries' });
// The NHL API has no injury list, so this uses ESPN's league-wide injury report.
const ESPN_INJURIES_URL = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries';
/** Lowercase, accents and punctuation stripped, so "Montréal" matches "Montreal" and "J.J." matches "JJ". */
function normalizeName(name) {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}
/** Day-to-day players may still play; everyone else on the report is out. */
function isOut(status) {
    return normalizeName(status) !== 'daytoday';
}
/** One team's injuries, keyed by normalized player name, from an ESPN report. */
function teamInjuries(report, teamFullName) {
    const team = report.injuries?.find(t => normalizeName(t.displayName) === normalizeName(teamFullName));
    if (!team)
        return report.injuries ? new Map() : null; // a team with no injuries isn't listed
    return new Map(team.injuries.map(i => [normalizeName(i.athlete.displayName), {
            name: i.athlete.displayName,
            lastName: i.athlete.lastName ?? i.athlete.displayName.split(' ').slice(-1)[0],
            status: i.status,
            designation: i.details?.fantasyStatus?.abbreviation,
            part: i.details?.type,
            returnDate: i.details?.returnDate,
        }]));
}
const DESIGNATION_LABELS = {
    'IR': 'IR',
    'IR-LT': 'LTIR',
    'IR-NR': 'IR (non-roster)',
    'OUT': 'Out',
    'DAY-TO-DAY': 'Day-to-day',
};
function statusLabel(e) {
    return DESIGNATION_LABELS[(e.designation ?? '').toUpperCase()]
        ?? (normalizeName(e.status) === 'injured reserve' ? 'IR' : e.status);
}
function formatReturn(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
/**
 * Card lines, soonest estimated return first: "**Guenther** — IR · upper body · est. return Dec 5".
 * Return dates on or before `todayISO` are left off (stale estimates).
 */
function formatInjuryLines(injuries, todayISO) {
    const upcoming = (e) => (e.returnDate && e.returnDate.slice(0, 10) > todayISO ? e.returnDate.slice(0, 10) : undefined);
    return [...injuries.values()]
        .sort((a, b) => (upcoming(a) ?? '9999').localeCompare(upcoming(b) ?? '9999') || a.lastName.localeCompare(b.lastName))
        .map(e => {
        const parts = [statusLabel(e)];
        if (e.part)
            parts.push(e.part.toLowerCase());
        const ret = upcoming(e);
        if (ret)
            parts.push(`est. return ${formatReturn(ret)}`);
        return `**${e.lastName}** — ${parts.join(' · ')}`;
    });
}
/** The team's current injuries, or null if the report can't be loaded (callers then skip filtering). */
async function loadTeamInjuries(teamFullName) {
    try {
        // No custom User-Agent: ESPN 403s "Tusky-Discord-Bot/1.0" but accepts Node's default
        const res = await fetch(ESPN_INJURIES_URL);
        if (!res.ok) {
            logger.warn({ status: res.status }, 'Injury report request failed');
            return null;
        }
        return teamInjuries((await res.json()), teamFullName);
    }
    catch (err) {
        logger.warn({ err }, 'Failed to load injury report');
        return null;
    }
}
//# sourceMappingURL=injuries.js.map