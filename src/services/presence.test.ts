import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatLiveStatus, formatNextGameStatus } from './presence.js';
import type { LiveStatusInput } from './presence.js';

function live(overrides: Partial<LiveStatusInput>): LiveStatusInput {
  return {
    teamCode: 'UTA',
    homeTeam: { abbrev: 'UTA', score: 2 },
    awayTeam: { abbrev: 'EDM', score: 1 },
    periodDescriptor: { number: 2, periodType: 'REG', maxRegulationPeriods: 3 },
    clock: { timeRemaining: '12:34', inIntermission: false },
    ...overrides,
  };
}

describe('formatLiveStatus', () => {
  test('home game in regulation, our team first', () => {
    assert.equal(formatLiveStatus(live({})), 'UTA 2-1 EDM · 2nd 12:34');
  });

  test('away game still lists our team first', () => {
    const s = formatLiveStatus(live({
      homeTeam: { abbrev: 'VGK', score: 3 },
      awayTeam: { abbrev: 'UTA', score: 1 },
    }));
    assert.equal(s, 'UTA 1-3 VGK · 2nd 12:34');
  });

  test('strips leading zero from the clock', () => {
    const s = formatLiveStatus(live({ clock: { timeRemaining: '01:20', inIntermission: false } }));
    assert.equal(s, 'UTA 2-1 EDM · 2nd 1:20');
  });

  test('1st and 3rd period ordinals', () => {
    assert.match(formatLiveStatus(live({ periodDescriptor: { number: 1, periodType: 'REG', maxRegulationPeriods: 3 } })), /· 1st /);
    assert.match(formatLiveStatus(live({ periodDescriptor: { number: 3, periodType: 'REG', maxRegulationPeriods: 3 } })), /· 3rd /);
  });

  test('intermission', () => {
    const s = formatLiveStatus(live({
      periodDescriptor: { number: 1, periodType: 'REG', maxRegulationPeriods: 3 },
      clock: { timeRemaining: '17:00', inIntermission: true },
    }));
    assert.equal(s, 'UTA 2-1 EDM · 1st INT');
  });

  test('overtime', () => {
    const s = formatLiveStatus(live({
      periodDescriptor: { number: 4, periodType: 'OT', maxRegulationPeriods: 3 },
      clock: { timeRemaining: '03:12', inIntermission: false },
    }));
    assert.equal(s, 'UTA 2-1 EDM · OT 3:12');
  });

  test('playoff double overtime', () => {
    const s = formatLiveStatus(live({
      periodDescriptor: { number: 5, periodType: 'OT', maxRegulationPeriods: 3 },
      clock: { timeRemaining: '10:00', inIntermission: false },
    }));
    assert.equal(s, 'UTA 2-1 EDM · 2OT 10:00');
  });

  test('shootout has no clock', () => {
    const s = formatLiveStatus(live({
      periodDescriptor: { number: 5, periodType: 'SO', maxRegulationPeriods: 3 },
      clock: { timeRemaining: '00:00', inIntermission: false },
    }));
    assert.equal(s, 'UTA 2-1 EDM · SO');
  });

  test('falls back to period number when descriptor missing', () => {
    const s = formatLiveStatus(live({ periodDescriptor: undefined, period: 4 }));
    assert.equal(s, 'UTA 2-1 EDM · OT 12:34');
  });
});

describe('formatNextGameStatus', () => {
  test('home game uses vs, Mountain time', () => {
    // Sat Oct 10 2026, 7:00 PM MDT
    const s = formatNextGameStatus('UTA', { abbrev: 'UTA' }, { abbrev: 'EDM' }, '2026-10-11T01:00:00Z', 'America/Denver');
    assert.equal(s, 'Next: vs EDM · Sat 7:00 PM MT');
  });

  test('away game uses @', () => {
    const s = formatNextGameStatus('UTA', { abbrev: 'VGK' }, { abbrev: 'UTA' }, '2026-10-11T02:30:00Z', 'America/Denver');
    assert.equal(s, 'Next: @ VGK · Sat 8:30 PM MT');
  });
});
