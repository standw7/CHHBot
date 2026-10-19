"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toiChartInputFromGame = toiChartInputFromGame;
const toiChart_js_1 = require("./toiChart.js");
function toSeconds(mmss) {
    const [m, s] = mmss.split(':').map(Number);
    return m * 60 + s;
}
function chartPlayers(team) {
    return [
        ...team.forwards.map(p => ({ id: p.playerId, label: p.name.default, position: 'F' })),
        ...team.defense.map(p => ({ id: p.playerId, label: p.name.default, position: 'D' })),
    ];
}
/**
 * Chart input for `teamCode` (rows) vs its opponent (columns), or null if the team isn't
 * in this game, or 'incomplete' while shift data doesn't yet match the boxscore.
 */
function toiChartInputFromGame(rows, home, away, teamCode) {
    const us = home.abbrev === teamCode ? home : away.abbrev === teamCode ? away : null;
    if (!us)
        return null;
    const them = us === home ? away : home;
    const shifts = (0, toiChart_js_1.normalizeShifts)(rows);
    const skaters = [home, away].flatMap(t => [...t.forwards, ...t.defense]);
    const boxToi = new Map(skaters.map(p => [p.playerId, toSeconds(p.toi)]));
    if (!(0, toiChart_js_1.isShiftDataComplete)(shifts, boxToi, (0, toiChart_js_1.hasOpenShifts)(rows)))
        return 'incomplete';
    const goalieIds = new Set([...home.goalies, ...away.goalies].map(g => g.playerId));
    const five = (0, toiChart_js_1.computeFiveOnFive)(shifts, goalieIds, us.abbrev, them.abbrev);
    const ours = (0, toiChart_js_1.orderPlayers)(chartPlayers(us), five);
    const theirs = (0, toiChart_js_1.orderPlayers)(chartPlayers(them), five);
    return {
        rows: [...ours.forwards, ...ours.defense],
        cols: [...theirs.forwards, ...theirs.defense],
        rowDividerAfter: ours.forwards.length,
        colDividerAfter: theirs.forwards.length,
        seconds: (rowId, colId) => five.against.get(`${rowId}-${colId}`) ?? 0,
        teamCode,
    };
}
//# sourceMappingURL=toiPost.js.map