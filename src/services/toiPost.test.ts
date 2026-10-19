import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { toiChartInputFromGame, toiChartTitle, pickLatestCompletedGame } from './toiPost.js';
import type { BoxTeam } from './toiPost.js';
import type { ShiftChartRow, ScheduleGame } from '../nhl/types.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/2026020133.json', import.meta.url), 'utf8')) as {
  shifts: ShiftChartRow[];
  box: { home: string; away: string; homePlayers: Omit<BoxTeam, 'abbrev'>; awayPlayers: Omit<BoxTeam, 'abbrev'> };
};
const home: BoxTeam = { abbrev: fixture.box.home, ...fixture.box.homePlayers };
const away: BoxTeam = { abbrev: fixture.box.away, ...fixture.box.awayPlayers };

describe('toiChartInputFromGame', () => {
  test('fixture: Utah rows vs Edmonton columns, forwards then defense, 5v5 seconds', () => {
    const input = toiChartInputFromGame(fixture.shifts, home, away, 'UTA');
    assert.ok(input && input !== 'incomplete');
    assert.equal(input.teamCode, 'UTA');
    assert.equal(input.rows.length, 18);
    assert.equal(input.cols.length, 18);
    assert.equal(input.rowDividerAfter, 12);
    assert.equal(input.colDividerAfter, 12);
    const weegar = input.rows.find(r => r.label === 'M. Weegar')!;
    const drai = input.cols.find(c => c.label === 'L. Draisaitl')!;
    assert.equal(Math.round(input.seconds(weegar.id, drai.id) / 6) / 10, 11.3);
    assert.ok(input.rows.every(r => !['K. Vejmelka', 'V. Kolosov'].includes(r.label)), 'no goalies');
  });

  test('works when Utah is the away team', () => {
    const input = toiChartInputFromGame(fixture.shifts, home, away, 'EDM');
    assert.ok(input && input !== 'incomplete');
    assert.ok(input.rows.some(r => r.label === 'C. McDavid'));
  });

  test('team not in the game → null', () => {
    assert.equal(toiChartInputFromGame(fixture.shifts, home, away, 'BOS'), null);
  });

  test("a goalie's missing shift → incomplete (goalies count toward completeness)", () => {
    const goalieId = home.goalies[0].playerId;
    const lastGoalieShift = fixture.shifts.map((r, i) => ({ r, i })).filter(x => x.r.playerId === goalieId).pop()!.i;
    const rows = fixture.shifts.filter((_, i) => i !== lastGoalieShift);
    assert.equal(toiChartInputFromGame(rows, home, away, 'UTA'), 'incomplete');
  });

  test('open shifts → incomplete', () => {
    const rows = fixture.shifts.map((r, i) => (i === 0 ? { ...r, duration: null } : r));
    assert.equal(toiChartInputFromGame(rows, home, away, 'UTA'), 'incomplete');
  });
});

describe('toiChartTitle', () => {
  test('away @ home with short date', () => {
    assert.equal(toiChartTitle('EDM', 'UTA', '2026-10-17'), '⏱️ Time against opponents · EDM @ UTA · Oct 17');
  });
});

describe('pickLatestCompletedGame', () => {
  const g = (id: number, gameType: number, gameState: string, startTimeUTC: string) =>
    ({ id, gameType, gameState, startTimeUTC }) as ScheduleGame;

  test('latest finished regular-season or playoff game', () => {
    const games = [
      g(1, 2, 'OFF', '2026-10-15T02:00:00Z'),
      g(2, 2, 'FINAL', '2026-10-18T02:00:00Z'),
      g(3, 2, 'LIVE', '2026-10-20T02:00:00Z'),
      g(4, 2, 'FUT', '2026-10-22T02:00:00Z'),
      g(0, 1, 'OFF', '2026-10-19T02:00:00Z'), // preseason
    ];
    assert.equal(pickLatestCompletedGame(games), 2);
  });

  test('no finished games → null', () => {
    assert.equal(pickLatestCompletedGame([g(4, 2, 'FUT', '2026-10-22T02:00:00Z')]), null);
  });
});
