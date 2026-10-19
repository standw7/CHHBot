"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeShifts = normalizeShifts;
exports.hasOpenShifts = hasOpenShifts;
exports.isShiftDataComplete = isShiftDataComplete;
exports.computeFiveOnFive = computeFiveOnFive;
const SHIFT_TYPE = 517;
const PERIOD_SECONDS = 1200;
function toSeconds(mmss) {
    const [m, s] = mmss.split(':').map(Number);
    return m * 60 + s;
}
function normalizeShifts(rows) {
    return rows
        .filter(r => r.typeCode === SHIFT_TYPE && r.duration)
        .map(r => {
        const offset = (r.period - 1) * PERIOD_SECONDS;
        return { playerId: r.playerId, team: r.teamAbbrev, start: offset + toSeconds(r.startTime), end: offset + toSeconds(r.endTime) };
    });
}
/** Right after the final the NHL may publish shifts that haven't closed yet. */
function hasOpenShifts(rows) {
    return rows.some(r => r.typeCode === SHIFT_TYPE && (!r.duration || !r.endTime));
}
/** Complete when nothing is open and every boxscore skater's shifts sum to his TOI (± tolerance). */
function isShiftDataComplete(shifts, boxscoreToiSec, hadOpenShifts, toleranceSec = 5) {
    if (hadOpenShifts)
        return false;
    const totals = new Map();
    for (const s of shifts)
        totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + (s.end - s.start));
    for (const [playerId, toi] of boxscoreToiSec) {
        if (Math.abs((totals.get(playerId) ?? 0) - toi) > toleranceSec)
            return false;
    }
    return true;
}
function add(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
}
/** Per-second walk: a second counts when each team has exactly 5 skaters + 1 goalie on the ice. */
function computeFiveOnFive(shifts, goalieIds, team, opponent) {
    const end = shifts.reduce((max, s) => Math.max(max, s.end), 0);
    const onIce = Array.from({ length: end }, () => []);
    for (const s of shifts)
        for (let t = s.start; t < s.end; t++)
            onIce[t].push(s);
    const result = { against: new Map(), together: new Map(), toi: new Map() };
    for (const second of onIce) {
        const skaters = (t) => second.filter(s => s.team === t && !goalieIds.has(s.playerId)).map(s => s.playerId);
        const goalies = (t) => second.filter(s => s.team === t && goalieIds.has(s.playerId)).length;
        const us = skaters(team);
        const them = skaters(opponent);
        if (us.length !== 5 || them.length !== 5 || goalies(team) !== 1 || goalies(opponent) !== 1)
            continue;
        for (const a of us)
            for (const b of them)
                add(result.against, `${a}-${b}`);
        for (const side of [us, them]) {
            for (const id of side)
                result.toi.set(id, (result.toi.get(id) ?? 0) + 1);
            for (let i = 0; i < side.length; i++) {
                for (let j = i + 1; j < side.length; j++) {
                    add(result.together, `${Math.min(side[i], side[j])}-${Math.max(side[i], side[j])}`);
                }
            }
        }
    }
    return result;
}
//# sourceMappingURL=toiChart.js.map