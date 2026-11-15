import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { teamInjuries, normalizeName, isOut, formatInjuryLines } from './injuries.js';
import { excludeInjured, findUpcomingMilestones } from './milestoneWatch.js';
import type { WatchPlayer } from './milestoneWatch.js';

const report = {
  injuries: [
    { displayName: 'Utah Mammoth', injuries: [
      { status: 'Injured Reserve', athlete: { displayName: 'Dylan Guenther', lastName: 'Guenther' },
        details: { type: 'Upper Body', returnDate: '2026-12-05', fantasyStatus: { abbreviation: 'IR' } } },
      { status: 'Out', athlete: { displayName: 'Logan Cooley', lastName: 'Cooley' },
        details: { type: 'Upper Body', returnDate: '2026-11-16', fantasyStatus: { abbreviation: 'OUT' } } },
      { status: 'Day-To-Day', athlete: { displayName: 'Clayton Keller', lastName: 'Keller' },
        details: { type: 'Lower Body', returnDate: '2026-11-10', fantasyStatus: { abbreviation: 'Day-To-Day' } } },
      { status: 'Injured Reserve', athlete: { displayName: 'Maveric Lamoureux', lastName: 'Lamoureux' },
        details: { type: 'Shoulder', fantasyStatus: { abbreviation: 'IR-LT' } } },
    ] },
    { displayName: 'Carolina Hurricanes', injuries: [
      { status: 'Out', athlete: { displayName: 'Sebastian Aho' } },
    ] },
  ],
};

function player(name: string, fullName: string, careerPoints: number): WatchPlayer {
  return { name, fullName, careerGamesPlayed: 400, careerGoals: 150, careerPoints, careerAssists: 150, seasonGoals: 5 };
}

describe('injury report', () => {
  test('only the named team, accents ignored', () => {
    const utah = teamInjuries(report, 'Utah Mammoth')!;
    assert.equal(utah.size, 4);
    assert.equal(utah.has('sebastian aho'), false);
    assert.equal(normalizeName('Montréal Canadiens'), normalizeName('Montreal Canadiens'));
  });

  test('a team with nobody hurt is an empty map, not "unknown"', () => {
    assert.equal(teamInjuries(report, 'Seattle Kraken')!.size, 0);
  });

  test('day-to-day is not out, everything else is', () => {
    assert.equal(isOut('Day-To-Day'), false);
    assert.equal(isOut('Injured Reserve'), true);
    assert.equal(isOut('Out'), true);
  });
});

describe('formatInjuryLines', () => {
  test('soonest return first; stale and missing dates left off; LTIR label', () => {
    assert.deepEqual(formatInjuryLines(teamInjuries(report, 'Utah Mammoth')!, '2026-11-14'), [
      '**Cooley** — Out · upper body · est. return Nov 16',
      '**Guenther** — IR · upper body · est. return Dec 5',
      '**Keller** — Day-to-day · lower body',
      '**Lamoureux** — LTIR · shoulder',
    ]);
  });

  test('nobody hurt → no lines', () => {
    assert.deepEqual(formatInjuryLines(teamInjuries(report, 'Seattle Kraken')!, '2026-11-14'), []);
  });
});

describe('excludeInjured', () => {
  const players = [
    player('Guenther', 'Dylan Guenther', 199),
    player('Cooley', 'Logan Cooley', 99),
    player('Keller', 'Clayton Keller', 599),
    player('Sergachev', 'Mikhail Sergachev', 399),
  ];

  test('IR and out players are dropped, day-to-day flagged', () => {
    const lines = findUpcomingMilestones(excludeInjured(players, teamInjuries(report, 'Utah Mammoth')));
    assert.deepEqual(lines, [
      'Keller: 1 point from 600 career points (day-to-day)',
      'Sergachev: 1 point from 400 career points',
    ]);
  });

  test('no report → nobody dropped', () => {
    assert.equal(findUpcomingMilestones(excludeInjured(players, null)).length, 4);
  });
});
