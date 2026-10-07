import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeaderMove, inGameTotals, categoriesForGoal, leaderAlertsForGoal } from './leaders.js';
import type { LeaderRow, LeaderSnapshot, LeaderCategory } from './leaders.js';
import type { LandingGoal } from '../nhl/types.js';

const row = (id: number, name: string, team: string, value: number): LeaderRow => ({ id, name, team, value });
const ME = { id: 1, name: 'Schmaltz', team: 'UTA' };

describe('evaluateLeaderMove', () => {
  test('moving into the top 3 lists the top 3', () => {
    const board = [row(2, 'Bouchard', 'EDM', 6), row(3, 'Cotter', 'VAN', 5), row(4, 'Draisaitl', 'EDM', 4), row(5, 'Eichel', 'VGK', 3)];
    const alert = evaluateLeaderMove('goals', ME, 3, 5, board);
    assert.deepEqual(alert, {
      title: '📈 Schmaltz moves into a tie for 2nd in the NHL in goals',
      lines: ['1. Bouchard (EDM) 6', 'T-2. Cotter (VAN) 5 · Schmaltz (UTA) 5'],
    });
  });

  test('going from tied for 1st to sole leader', () => {
    const board = [row(2, 'Bouchard', 'EDM', 5), row(3, 'Cotter', 'VAN', 4)];
    const alert = evaluateLeaderMove('goals', ME, 5, 6, board);
    assert.equal(alert?.title, '📈 Schmaltz takes the NHL lead in goals');
    assert.deepEqual(alert?.lines, ['1. Schmaltz (UTA) 6', '2. Bouchard (EDM) 5', '3. Cotter (VAN) 4']);
  });

  test('tying for 1st counts as taking the lead', () => {
    const board = [row(2, 'Bouchard', 'EDM', 6), row(3, 'Cotter', 'VAN', 4)];
    assert.equal(evaluateLeaderMove('goals', ME, 5, 6, board)?.title, '📈 Schmaltz ties for the NHL lead in goals');
  });

  test('already sole leader extending the lead is not announced', () => {
    const board = [row(2, 'Bouchard', 'EDM', 5)];
    assert.equal(evaluateLeaderMove('goals', ME, 6, 7, board), null);
  });

  test('moving 3rd → 2nd is not announced', () => {
    const board = [row(2, 'Bouchard', 'EDM', 8), row(3, 'Cotter', 'VAN', 6), row(4, 'Draisaitl', 'EDM', 4)];
    assert.equal(evaluateLeaderMove('goals', ME, 5, 7, board), null);
  });

  test('staying outside the top 3 is not announced', () => {
    const board = [row(2, 'A', 'EDM', 9), row(3, 'B', 'VAN', 8), row(4, 'C', 'EDM', 7)];
    assert.equal(evaluateLeaderMove('goals', ME, 5, 6, board), null);
  });

  test('more than 5 players sharing the top 3 → no alert', () => {
    const board = [1, 2, 3, 4, 5].map(i => row(10 + i, `P${i}`, 'XXX', 1));
    assert.equal(evaluateLeaderMove('goalsSh', ME, 0, 1, board), null);
  });

  test('exactly 5 sharing the top 3 is allowed', () => {
    const board = [row(2, 'A', 'EDM', 2), row(3, 'B', 'VAN', 1), row(4, 'C', 'NYI', 1), row(5, 'D', 'LAK', 1)];
    const alert = evaluateLeaderMove('goalsSh', ME, 0, 1, board);
    assert.equal(alert?.title, '📈 Schmaltz moves into a tie for 2nd in the NHL in shorthanded goals');
    assert.deepEqual(alert?.lines, ['1. A (EDM) 2', 'T-2. B (VAN) 1 · C (NYI) 1 · D (LAK) 1 · Schmaltz (UTA) 1']);
  });

  test('the player himself in the board is replaced, not double counted', () => {
    const board = [row(1, 'Schmaltz', 'UTA', 4), row(2, 'Bouchard', 'EDM', 6), row(3, 'Cotter', 'VAN', 5), row(4, 'D', 'EDM', 5)];
    assert.equal(evaluateLeaderMove('goals', ME, 4, 5, board)?.title, '📈 Schmaltz moves into a tie for 2nd in the NHL in goals');
  });
});

function g(overrides: Partial<LandingGoal>): LandingGoal {
  return {
    eventId: 1, strength: 'ev', playerId: 1,
    firstName: { default: 'A' }, lastName: { default: 'A' }, name: { default: 'A' },
    teamAbbrev: { default: 'UTA' }, goalsToDate: 1, awayScore: 0, homeScore: 1, timeInPeriod: '01:00',
    assists: [],
    ...overrides,
  } as LandingGoal;
}
const assistBy = (playerId: number) => ({ playerId, firstName: { default: 'X' }, lastName: { default: 'X' }, name: { default: 'X' }, assistsToDate: 1 });

describe('inGameTotals', () => {
  test('counts goals by strength and assists, excluding shootout goals', () => {
    const goals = [
      g({ playerId: 1, strength: 'pp' }),
      g({ playerId: 2, assists: [assistBy(1)] }),
      g({ playerId: 1, strength: 'sh' }),
      g({ playerId: 1, periodType: 'SO' }),
    ];
    assert.deepEqual(inGameTotals(1, goals), { goals: 2, assists: 1, points: 3, goalsPp: 1, goalsSh: 1 });
  });
});

describe('categoriesForGoal', () => {
  test('scorer: goals + points, plus PP/SH by strength; assisters: assists + points', () => {
    assert.deepEqual(categoriesForGoal(g({ strength: 'ev' }), 'scorer'), ['goals', 'points']);
    assert.deepEqual(categoriesForGoal(g({ strength: 'pp' }), 'scorer'), ['goals', 'points', 'goalsPp']);
    assert.deepEqual(categoriesForGoal(g({ strength: 'sh' }), 'scorer'), ['goals', 'points', 'goalsSh']);
    assert.deepEqual(categoriesForGoal(g({ strength: 'pp' }), 'assister'), ['assists', 'points']);
  });
});

describe('leaderAlertsForGoal', () => {
  const zero: Record<LeaderCategory, number> = { goals: 0, assists: 0, points: 0, goalsPp: 0, goalsSh: 0 };
  const snapshot: LeaderSnapshot = {
    goals: [row(10, 'Bouchard', 'EDM', 5), row(11, 'Cotter', 'VAN', 4), row(12, 'Draisaitl', 'EDM', 4)],
    assists: [row(20, 'McDavid', 'EDM', 7), row(21, 'Eichel', 'VGK', 5), row(22, 'Hronek', 'VAN', 5)],
    points: [row(20, 'McDavid', 'EDM', 9), row(10, 'Bouchard', 'EDM', 8), row(11, 'Cotter', 'VAN', 7)],
    goalsPp: [],
    goalsSh: [],
  };

  test('scorer enters top 3 in goals; assister enters top 3 in assists', () => {
    const goal = g({ eventId: 5, playerId: 1, lastName: { default: 'Schmaltz' }, assists: [{ ...assistBy(2), lastName: { default: 'Keller' } }] });
    const alerts = leaderAlertsForGoal({
      goal,
      goalsSoFar: [goal],
      teamCode: 'UTA',
      snapshot,
      seasonBefore: new Map([[1, { ...zero, goals: 3, points: 4 }], [2, { ...zero, assists: 4, points: 5 }]]),
    });
    assert.deepEqual(alerts.map(a => a.title), [
      '📈 Schmaltz moves into a tie for 2nd in the NHL in goals',
      '📈 Keller moves into a tie for 2nd in the NHL in assists',
    ]);
  });

  test('a teammate on the board gets his in-game goals added', () => {
    // Guenther (UTA) is on the board at 4 and scored earlier tonight → 5, tied with Bouchard
    const board: LeaderSnapshot = { ...snapshot, goals: [row(10, 'Bouchard', 'EDM', 5), row(30, 'Guenther', 'UTA', 4), row(11, 'Cotter', 'VAN', 3)] };
    const earlier = g({ eventId: 4, playerId: 30, lastName: { default: 'Guenther' } });
    const goal = g({ eventId: 5, playerId: 1, lastName: { default: 'Schmaltz' } });
    const alerts = leaderAlertsForGoal({
      goal,
      goalsSoFar: [earlier, goal],
      teamCode: 'UTA',
      snapshot: board,
      seasonBefore: new Map([[1, { ...zero, goals: 2 }]]),
    });
    // Without the in-game adjustment Guenther would be 4 and listed alone in 2nd
    assert.deepEqual(alerts[0]?.lines, ['T-1. Bouchard (EDM) 5 · Guenther (UTA) 5', 'T-3. Cotter (VAN) 3 · Schmaltz (UTA) 3']);
  });

  test('player without known season totals is skipped', () => {
    const goal = g({ eventId: 5, playerId: 1, lastName: { default: 'Schmaltz' } });
    assert.deepEqual(leaderAlertsForGoal({ goal, goalsSoFar: [goal], teamCode: 'UTA', snapshot, seasonBefore: new Map() }), []);
  });
});
