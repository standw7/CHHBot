import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { normalizeShifts, hasOpenShifts, isShiftDataComplete, computeFiveOnFive } from './toiChart.js';
import type { Shift } from './toiChart.js';
import type { ShiftChartRow } from '../nhl/types.js';

interface FixturePlayer { playerId: number; name: { default: string }; position: string; toi: string }
interface FixtureSide { forwards: FixturePlayer[]; defense: FixturePlayer[]; goalies: FixturePlayer[] }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/2026020133.json', import.meta.url), 'utf8')) as {
  shifts: ShiftChartRow[];
  box: { home: string; away: string; homePlayers: FixtureSide; awayPlayers: FixtureSide };
};
const allPlayers = [fixture.box.homePlayers, fixture.box.awayPlayers].flatMap(s => [...s.forwards, ...s.defense, ...s.goalies]);
const goalieIds = new Set([...fixture.box.homePlayers.goalies, ...fixture.box.awayPlayers.goalies].map(g => g.playerId));
const idByLast = (last: string) => allPlayers.find(p => p.name.default.endsWith(` ${last}`))!.playerId;
const toSec = (t: string) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
const round1 = (sec: number) => Math.round((sec / 60) * 10) / 10;

describe('computeFiveOnFive regression: 10/17 EDM @ UTA matches HockeyStatCards', () => {
  const result = computeFiveOnFive(normalizeShifts(fixture.shifts), goalieIds, 'UTA', 'EDM');
  const cells: [string, string, number][] = [
    ['Weegar', 'Draisaitl', 11.3],
    ['Weegar', 'McDavid', 11.5],
    ['Sergachev', 'Bouchard', 12.6],
    ['Yamamoto', 'Bouchard', 6.3],
    ['Peeke', 'Hyman', 9.2],
    ['McBain', 'Draisaitl', 1.6],
    ['Schmidt', 'Shea', 7.7],
  ];
  for (const [uta, edm, expected] of cells) {
    test(`${uta} vs ${edm} = ${expected}`, () => {
      assert.equal(round1(result.against.get(`${idByLast(uta)}-${idByLast(edm)}`) ?? 0), expected);
    });
  }
});

// Synthetic helpers: team A skaters 1-6, goalie 9; team B skaters 11-16, goalie 19
const shift = (playerId: number, team: string, start: number, end: number): Shift => ({ playerId, team, start, end });
const line = (ids: number[], team: string, start: number, end: number) => ids.map(id => shift(id, team, start, end));
const goalies = new Set([9, 19]);

describe('computeFiveOnFive synthetic', () => {
  test('3v3 overtime and 6v5 empty-net seconds are excluded', () => {
    const shifts = [
      ...line([1, 2, 3, 4, 5, 9], 'A', 0, 10), ...line([11, 12, 13, 14, 15, 19], 'B', 0, 10),
      ...line([1, 2, 3, 9], 'A', 3600, 3610), ...line([11, 12, 13, 19], 'B', 3600, 3610), // 3v3 OT
      ...line([1, 2, 3, 4, 5, 6], 'A', 3610, 3620), ...line([11, 12, 13, 14, 15, 19], 'B', 3610, 3620), // A pulled goalie
    ];
    const r = computeFiveOnFive(shifts, goalies, 'A', 'B');
    assert.equal(r.against.get('1-11'), 10);
    assert.equal(r.toi.get(1), 10);
  });

  test('shift end is exclusive (back-to-back shifts never overlap)', () => {
    const shifts = [
      ...line([1, 2, 3, 4, 9], 'A', 0, 20), shift(5, 'A', 0, 10), shift(6, 'A', 10, 20),
      ...line([11, 12, 13, 14, 15, 19], 'B', 0, 20),
    ];
    const r = computeFiveOnFive(shifts, goalies, 'A', 'B');
    assert.equal(r.against.get('5-11'), 10);
    assert.equal(r.against.get('6-11'), 10);
    assert.equal(r.against.get('1-11'), 20);
  });

  test('together counts same-team pairs for both teams', () => {
    const shifts = [...line([1, 2, 3, 4, 5, 9], 'A', 0, 30), ...line([11, 12, 13, 14, 15, 19], 'B', 0, 30)];
    const r = computeFiveOnFive(shifts, goalies, 'A', 'B');
    assert.equal(r.together.get('1-2'), 30);
    assert.equal(r.together.get('11-15'), 30);
  });
});

describe('shift data completeness', () => {
  const shifts = [shift(1, 'A', 0, 100), shift(1, 'A', 200, 260)];

  test('matches boxscore within 5 s', () => {
    assert.equal(isShiftDataComplete(shifts, new Map([[1, 160]]), false), true);
    assert.equal(isShiftDataComplete(shifts, new Map([[1, 165]]), false), true);
  });

  test('off by more than 5 s is incomplete', () => {
    assert.equal(isShiftDataComplete(shifts, new Map([[1, 166]]), false), false);
  });

  test('open shifts (empty duration) are incomplete', () => {
    assert.equal(isShiftDataComplete(shifts, new Map([[1, 160]]), true), false);
    const rows = [{ ...fixture.shifts[0], duration: null, endTime: '' }];
    assert.equal(hasOpenShifts(rows), true);
    assert.equal(hasOpenShifts(fixture.shifts), false);
  });

  test('the fixture is complete against its own boxscore', () => {
    const skaters = [fixture.box.homePlayers, fixture.box.awayPlayers].flatMap(s => [...s.forwards, ...s.defense]);
    const toi = new Map(skaters.map(p => [p.playerId, toSec(p.toi)]));
    assert.equal(isShiftDataComplete(normalizeShifts(fixture.shifts), toi, hasOpenShifts(fixture.shifts)), true);
  });
});
