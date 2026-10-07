import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findReplayUrl, buildGoalCard } from './goalCard.js';
import type { GoalCardData } from './goalCard.js';
import type { LandingResponse, LandingGoal } from '../nhl/types.js';

function goal(overrides: Partial<LandingGoal> & { eventId: number }): LandingGoal {
  return {
    strength: 'ev',
    playerId: 1,
    firstName: { default: 'First' },
    lastName: { default: 'Last' },
    name: { default: 'F. Last' },
    teamAbbrev: { default: 'UTA' },
    goalsToDate: 1,
    awayScore: 0,
    homeScore: 1,
    timeInPeriod: '10:00',
    assists: [],
    ...overrides,
  };
}

function landing(goals: LandingGoal[]): LandingResponse {
  return {
    id: 1,
    gameState: 'LIVE',
    homeTeam: {} as LandingResponse['homeTeam'],
    awayTeam: {} as LandingResponse['awayTeam'],
    summary: {
      scoring: [
        {
          periodDescriptor: { number: 1, periodType: 'REG' },
          goals,
        },
      ],
    },
  };
}

describe('findReplayUrl', () => {
  test('returns the highlightClipSharingUrl when the goal has one', () => {
    const g = goal({ eventId: 5, highlightClipSharingUrl: 'https://nhl.com/video/5' });
    const result = findReplayUrl(landing([g]), 5);
    assert.equal(result, 'https://nhl.com/video/5');
  });

  test('returns undefined when the goal has no highlightClipSharingUrl yet', () => {
    const g = goal({ eventId: 5 });
    const result = findReplayUrl(landing([g]), 5);
    assert.equal(result, undefined);
  });

  test('returns undefined when no goal matches the given eventId', () => {
    const g = goal({ eventId: 5, highlightClipSharingUrl: 'https://nhl.com/video/5' });
    const result = findReplayUrl(landing([g]), 999);
    assert.equal(result, undefined);
  });
});

describe('buildGoalCard leader alerts', () => {
  const base = {
    play: { eventId: 1, typeCode: 505, typeDescKey: 'goal', periodDescriptor: { number: 2, periodType: 'REG' }, timeInPeriod: '05:00', timeRemaining: '15:00' },
    homeTeam: { id: 1, abbrev: 'UTA', logo: '', score: 2 },
    awayTeam: { id: 2, abbrev: 'EDM', logo: '', score: 1 },
    scoringTeamAbbrev: 'UTA',
    scoringTeamLogo: 'https://example.com/uta.png',
    primaryTeam: 'UTA',
  } as unknown as GoalCardData;

  test('each alert becomes a field with the top 3', () => {
    const { embed } = buildGoalCard({
      ...base,
      leaderAlerts: [{ title: '📈 Schmaltz takes the NHL lead in goals', lines: ['1. Schmaltz (UTA) 6', '2. Bouchard (EDM) 5'] }],
    }, 'off');
    assert.deepEqual(embed.data.fields, [
      { name: '📈 Schmaltz takes the NHL lead in goals', value: '1. Schmaltz (UTA) 6\n2. Bouchard (EDM) 5', inline: false },
    ]);
  });

  test('no alerts → no fields', () => {
    const { embed } = buildGoalCard(base, 'off');
    assert.equal(embed.data.fields, undefined);
  });
});
