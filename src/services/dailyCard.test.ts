import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectDailyCard,
  pickOffDayPhrase,
  OFF_DAY_PHRASES,
  calculateSeasonSeries,
} from './dailyCard.js';
import type { ScheduleGame } from '../nhl/types.js';

const ZONE = 'America/Denver';
const WINDOW = { start: '2026-09-29', end: '2027-04-10' };

function game(overrides: Partial<ScheduleGame> & { id: number }): ScheduleGame {
  return {
    season: 20262027,
    gameType: 2,
    gameDate: '2026-10-10',
    startTimeUTC: '2026-10-10T19:00:00Z',
    homeTeam: { id: 1, abbrev: 'UTA', logo: 'https://example.com/uta.png' },
    awayTeam: { id: 2, abbrev: 'DAL', logo: 'https://example.com/dal.png' },
    gameState: 'FUT',
    venue: { default: 'Delta Center' },
    ...overrides,
  };
}

describe('selectDailyCard', () => {
  test('returns the game when a game is scheduled today', () => {
    const todayGame = game({ id: 1, gameDate: '2026-11-05', startTimeUTC: '2026-11-06T02:00:00Z' }); // 8pm MST on 11-05
    const games = [todayGame];
    const result = selectDailyCard(games, '2026-11-05', ZONE, WINDOW);
    assert.equal(result.kind, 'game');
    if (result.kind === 'game') {
      assert.equal(result.game.id, 1);
    }
  });

  test('returns offday when in season with no game today', () => {
    const games = [
      game({ id: 1, gameDate: '2026-11-03', startTimeUTC: '2026-11-04T02:00:00Z' }), // past
      game({ id: 2, gameDate: '2026-11-07', startTimeUTC: '2026-11-08T02:00:00Z' }), // future
    ];
    const result = selectDailyCard(games, '2026-11-05', ZONE, WINDOW);
    assert.equal(result.kind, 'offday');
    if (result.kind === 'offday') {
      assert.equal(result.nextGame?.id, 2);
    }
  });

  test('day before season_start with only preseason games yields none', () => {
    const games = [
      game({ id: 1, gameType: 1, gameDate: '2026-09-27', startTimeUTC: '2026-09-28T02:00:00Z' }), // preseason
      game({ id: 2, gameType: 1, gameDate: '2026-09-30', startTimeUTC: '2026-10-01T02:00:00Z' }), // preseason
    ];
    const result = selectDailyCard(games, '2026-09-28', ZONE, WINDOW);
    assert.equal(result.kind, 'none');
  });

  test('on season_start with no game yields offday', () => {
    const games = [
      game({ id: 1, gameType: 2, gameDate: '2026-10-05', startTimeUTC: '2026-10-06T02:00:00Z' }), // future
    ];
    const result = selectDailyCard(games, WINDOW.start, ZONE, WINDOW);
    assert.equal(result.kind, 'offday');
  });

  test('on season_end yields offday', () => {
    const games = [
      game({ id: 1, gameType: 2, gameDate: '2027-04-05', startTimeUTC: '2027-04-06T02:00:00Z' }), // past
    ];
    const result = selectDailyCard(games, WINDOW.end, ZONE, WINDOW);
    assert.equal(result.kind, 'offday');
  });

  test('day after season_end with no playoff games yields none', () => {
    const games = [
      game({ id: 1, gameType: 2, gameDate: '2027-04-05', startTimeUTC: '2027-04-06T02:00:00Z' }), // past, regular season
    ];
    const result = selectDailyCard(games, '2027-04-11', ZONE, WINDOW);
    assert.equal(result.kind, 'none');
  });

  test('day after season_end with a future playoff (gameType 3) game yields offday', () => {
    const games = [
      game({ id: 1, gameType: 3, gameDate: '2027-04-13', startTimeUTC: '2027-04-14T02:00:00Z' }), // future playoff game
    ];
    const result = selectDailyCard(games, '2027-04-11', ZONE, WINDOW);
    assert.equal(result.kind, 'offday');
  });

  test('a game late in UTC still counts as tonight in America/Denver', () => {
    // 11:30pm MST on 11-05 == 06:30 UTC on 11-06
    const lateGame = game({ id: 1, gameDate: '2026-11-05', startTimeUTC: '2026-11-06T06:30:00Z' });
    const result = selectDailyCard([lateGame], '2026-11-05', ZONE, WINDOW);
    assert.equal(result.kind, 'game');
    if (result.kind === 'game') {
      assert.equal(result.game.id, 1);
    }
  });
});

describe('pickOffDayPhrase', () => {
  test('cycles through all 10 phrases across 10 consecutive dates and wraps', () => {
    const start = '2026-01-01'; // ordinal 1
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const phrase = pickOffDayPhrase(date);
      assert.ok(OFF_DAY_PHRASES.includes(phrase));
      seen.add(phrase);
    }
    assert.equal(seen.size, 10);

    // Wraps: day 1 and day 11 (ordinal 1 and 11) should match (11 % 10 === 1)
    const day1 = pickOffDayPhrase('2026-01-01');
    const day11 = pickOffDayPhrase('2026-01-11');
    assert.equal(day1, day11);
    void start;
  });
});

describe('calculateSeasonSeries', () => {
  const PRIMARY = 'UTA';
  const OPPONENT = 'DAL';

  test('counts a win when the primary team outscored the opponent', () => {
    const games = [
      game({
        id: 1,
        gameType: 2,
        gameState: 'FINAL',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x', score: 4 },
        awayTeam: { id: 2, abbrev: 'DAL', logo: 'x', score: 2 },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 1, losses: 0, otLosses: 0 });
  });

  test('counts a regulation loss', () => {
    const games = [
      game({
        id: 1,
        gameType: 2,
        gameState: 'OFF',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x', score: 2 },
        awayTeam: { id: 2, abbrev: 'DAL', logo: 'x', score: 5 },
        gameOutcome: { lastPeriodType: 'REG' },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 0, losses: 1, otLosses: 0 });
  });

  test('counts an OT loss as OTL, not a regulation loss', () => {
    const games = [
      game({
        id: 1,
        gameType: 2,
        gameState: 'FINAL',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x', score: 3 },
        awayTeam: { id: 2, abbrev: 'DAL', logo: 'x', score: 4 },
        gameOutcome: { lastPeriodType: 'OT' },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 0, losses: 0, otLosses: 1 });
  });

  test('counts a shootout loss as OTL', () => {
    const games = [
      game({
        id: 1,
        gameType: 2,
        gameState: 'FINAL',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x', score: 2 },
        awayTeam: { id: 2, abbrev: 'DAL', logo: 'x', score: 3 },
        gameOutcome: { lastPeriodType: 'SO' },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 0, losses: 0, otLosses: 1 });
  });

  test('ignores preseason games against the same opponent', () => {
    const games = [
      game({
        id: 1,
        gameType: 1,
        gameState: 'FINAL',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x', score: 5 },
        awayTeam: { id: 2, abbrev: 'DAL', logo: 'x', score: 0 },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 0, losses: 0, otLosses: 0 });
  });

  test('ignores unplayed (future) games against the same opponent', () => {
    const games = [
      game({
        id: 1,
        gameType: 2,
        gameState: 'FUT',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x' },
        awayTeam: { id: 2, abbrev: 'DAL', logo: 'x' },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 0, losses: 0, otLosses: 0 });
  });

  test('ignores games against a different opponent', () => {
    const games = [
      game({
        id: 1,
        gameType: 2,
        gameState: 'FINAL',
        homeTeam: { id: 1, abbrev: 'UTA', logo: 'x', score: 4 },
        awayTeam: { id: 3, abbrev: 'COL', logo: 'x', score: 1 },
      }),
    ];
    const result = calculateSeasonSeries(games, PRIMARY, OPPONENT);
    assert.deepEqual(result, { wins: 0, losses: 0, otLosses: 0 });
  });
});
