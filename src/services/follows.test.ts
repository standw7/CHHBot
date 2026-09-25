import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchRosterPlayer, buildFollowDm, buildFirstStarDm } from './follows.js';
import type { FollowablePlayer } from './follows.js';
import type { LandingGoal } from '../nhl/types.js';

const roster: FollowablePlayer[] = [
  { id: 1, firstName: 'Clayton', lastName: 'Keller', sweaterNumber: 9 },
  { id: 2, firstName: 'Logan', lastName: 'Cooley', sweaterNumber: 92 },
  { id: 3, firstName: 'Michal', lastName: 'Hrábal', sweaterNumber: 30 },
  { id: 4, firstName: 'Mikhail', lastName: 'Sergachev', sweaterNumber: 98 },
  { id: 5, firstName: 'Ian', lastName: 'Cole', sweaterNumber: 28 },
];

describe('matchRosterPlayer', () => {
  test('last name, any case', () => {
    assert.deepEqual(matchRosterPlayer('keller', roster), { kind: 'match', player: roster[0] });
  });

  test('full name', () => {
    assert.deepEqual(matchRosterPlayer('Clayton Keller', roster), { kind: 'match', player: roster[0] });
  });

  test('jersey number, with or without #', () => {
    assert.deepEqual(matchRosterPlayer('92', roster), { kind: 'match', player: roster[1] });
    assert.deepEqual(matchRosterPlayer('#9', roster), { kind: 'match', player: roster[0] });
  });

  test('accents ignored', () => {
    assert.deepEqual(matchRosterPlayer('hrabal', roster), { kind: 'match', player: roster[2] });
  });

  test('partial name when unique', () => {
    assert.deepEqual(matchRosterPlayer('serg', roster), { kind: 'match', player: roster[3] });
  });

  test('ambiguous partial lists candidates', () => {
    assert.deepEqual(matchRosterPlayer('co', roster), { kind: 'ambiguous', players: [roster[1], roster[4]] });
  });

  test('exact last name beats partial matches', () => {
    const r = [...roster, { id: 6, firstName: 'Sam', lastName: 'Coleman', sweaterNumber: 20 }];
    assert.deepEqual(matchRosterPlayer('cole', r), { kind: 'match', player: roster[4] });
  });

  test('no match', () => {
    assert.deepEqual(matchRosterPlayer('mcdavid', roster), { kind: 'none' });
    assert.deepEqual(matchRosterPlayer('   ', roster), { kind: 'none' });
  });
});

function goal(overrides: Partial<LandingGoal>): LandingGoal {
  return {
    eventId: 100,
    strength: 'ev',
    playerId: 1,
    firstName: { default: 'Clayton' },
    lastName: { default: 'Keller' },
    name: { default: 'C. Keller' },
    teamAbbrev: { default: 'UTA' },
    goalsToDate: 3,
    awayScore: 2,
    homeScore: 1,
    timeInPeriod: '07:26',
    assists: [
      { playerId: 2, firstName: { default: 'Logan' }, lastName: { default: 'Cooley' }, name: { default: 'L. Cooley' }, assistsToDate: 4 },
      { playerId: 4, firstName: { default: 'Mikhail' }, lastName: { default: 'Sergachev' }, name: { default: 'M. Sergachev' }, assistsToDate: 5 },
    ],
    ...overrides,
  } as LandingGoal;
}

const base = {
  teamCode: 'UTA',
  homeAbbrev: 'VGK',
  awayAbbrev: 'UTA',
  periodNumber: 2,
  periodType: 'REG',
  cardUrl: 'https://discord.com/channels/1/2/3',
};

describe('buildFollowDm', () => {
  test('followed scorer', () => {
    assert.equal(
      buildFollowDm({ ...base, goal: goal({}), followed: new Set([1]) }),
      '🚨 **Keller** scored!\nUTA 2-1 VGK · 2nd 7:26 · [Goal card](https://discord.com/channels/1/2/3)'
    );
  });

  test('followed assister', () => {
    assert.equal(
      buildFollowDm({ ...base, goal: goal({}), followed: new Set([2]) }),
      "🍎 **Cooley** assisted on Keller's goal\nUTA 2-1 VGK · 2nd 7:26 · [Goal card](https://discord.com/channels/1/2/3)"
    );
  });

  test('scorer and assister followed → one DM with both', () => {
    assert.equal(
      buildFollowDm({ ...base, goal: goal({}), followed: new Set([1, 4]) }),
      "🚨 **Keller** scored!\n🍎 **Sergachev** assisted on Keller's goal\nUTA 2-1 VGK · 2nd 7:26 · [Goal card](https://discord.com/channels/1/2/3)"
    );
  });

  test('nobody followed on this goal → null', () => {
    assert.equal(buildFollowDm({ ...base, goal: goal({}), followed: new Set([5]) }), null);
  });

  test('shootout goal → null', () => {
    assert.equal(buildFollowDm({ ...base, periodType: 'SO', goal: goal({}), followed: new Set([1]) }), null);
  });

  test('home game score order, overtime label, no card link', () => {
    assert.equal(
      buildFollowDm({ ...base, homeAbbrev: 'UTA', awayAbbrev: 'EDM', periodNumber: 4, periodType: 'OT', cardUrl: undefined, goal: goal({ homeScore: 3, awayScore: 2, timeInPeriod: '01:05' }), followed: new Set([1]) }),
      '🚨 **Keller** scored!\nUTA 3-2 EDM · OT 1:05'
    );
  });
});

describe('buildFirstStarDm', () => {
  test('skater with card link', () => {
    assert.equal(
      buildFirstStarDm('Keller', '2G 1A', 'UTA', 'VGK', 'https://discord.com/channels/1/2/4'),
      '⭐ **Keller** was named first star! UTA @ VGK · 2G 1A · [Three stars](https://discord.com/channels/1/2/4)'
    );
  });

  test('goalie, no stats or link', () => {
    assert.equal(buildFirstStarDm('Vejmelka', '', 'EDM', 'UTA'), '⭐ **Vejmelka** was named first star! EDM @ UTA');
  });
});
