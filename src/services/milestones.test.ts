import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectMilestones } from './milestones.js';
import type { MilestoneInput } from './milestones.js';
import type { LandingGoal } from '../nhl/types.js';

function goal(overrides: Partial<LandingGoal> & { playerId: number }): LandingGoal {
  return {
    eventId: 1,
    strength: 'ev',
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

function baseInput(overrides: Partial<MilestoneInput>): MilestoneInput {
  const scorer = goal({ playerId: 100, eventId: 3, goalsToDate: 5 });
  return {
    goal: scorer,
    goalsSoFar: [scorer],
    periodType: 'REG',
    gameType: 2,
    isPrimaryTeam: true,
    ...overrides,
  };
}

describe('detectMilestones - hat trick / multi-goal games', () => {
  test('hat trick fires on the 3rd goal by the same player', () => {
    const g1 = goal({ playerId: 100, eventId: 1 });
    const g2 = goal({ playerId: 100, eventId: 2 });
    const g3 = goal({ playerId: 100, eventId: 3, goalsToDate: 7 });
    const input = baseInput({ goal: g3, goalsSoFar: [g1, g2, g3] });

    const milestones = detectMilestones(input);
    const hatTrick = milestones.find(m => m.kind === 'hat_trick');
    assert.ok(hatTrick, 'expected a hat_trick milestone');
    assert.equal(hatTrick?.label, "🧢🧢🧢 HAT TRICK! First Last's 3rd of the night");
    assert.equal(hatTrick?.celebrate, true);
  });

  test('no hat trick on the 2nd goal by the same player', () => {
    const g1 = goal({ playerId: 100, eventId: 1 });
    const g2 = goal({ playerId: 100, eventId: 2 });
    const input = baseInput({ goal: g2, goalsSoFar: [g1, g2] });

    const milestones = detectMilestones(input);
    assert.equal(milestones.find(m => m.kind === 'hat_trick'), undefined);
    assert.equal(milestones.find(m => m.kind === 'four_goal'), undefined);
  });

  test('4th goal by the same player is four_goal, not hat_trick', () => {
    const goals = [1, 2, 3, 4].map(eventId => goal({ playerId: 100, eventId }));
    const input = baseInput({ goal: goals[3], goalsSoFar: goals });

    const milestones = detectMilestones(input);
    assert.equal(milestones.find(m => m.kind === 'hat_trick'), undefined);
    const fourGoal = milestones.find(m => m.kind === 'four_goal');
    assert.ok(fourGoal, 'expected a four_goal milestone');
    assert.equal(fourGoal?.label, '🧢🧢🧢🧢 FOUR-GOAL GAME! First Last');
  });

  test('5th goal by the same player is four_goal with n-GOAL GAME label', () => {
    const goals = [1, 2, 3, 4, 5].map(eventId => goal({ playerId: 100, eventId }));
    const input = baseInput({ goal: goals[4], goalsSoFar: goals });

    const milestones = detectMilestones(input);
    const fiveGoal = milestones.find(m => m.kind === 'four_goal');
    assert.ok(fiveGoal, 'expected a four_goal-kind milestone for a 5-goal game');
    assert.equal(fiveGoal?.label, '5-GOAL GAME! First Last');
  });

  test('shootout goals are excluded from hat trick counting', () => {
    const g1 = goal({ playerId: 100, eventId: 1 });
    const g2 = goal({ playerId: 100, eventId: 2 });
    const soGoal = goal({ playerId: 100, eventId: 3, periodType: 'SO' } as Partial<LandingGoal> & { playerId: number });
    const input = baseInput({ goal: soGoal, goalsSoFar: [g1, g2, soGoal], periodType: 'SO' });

    const milestones = detectMilestones(input);
    // Only 2 real (non-SO) goals for this player, so no hat trick should fire
    assert.equal(milestones.find(m => m.kind === 'hat_trick'), undefined);
    assert.equal(milestones.find(m => m.kind === 'four_goal'), undefined);
  });
});

describe('detectMilestones - OT winner', () => {
  test('OT winner fires when periodType is OT', () => {
    const g = goal({ playerId: 200, eventId: 5 });
    const input = baseInput({ goal: g, goalsSoFar: [g], periodType: 'OT' });

    const milestones = detectMilestones(input);
    const otWinner = milestones.find(m => m.kind === 'ot_winner');
    assert.ok(otWinner, 'expected an ot_winner milestone');
    assert.equal(otWinner?.label, 'OT WINNER!');
  });

  test('no OT winner in a shootout (SO)', () => {
    const g = goal({ playerId: 200, eventId: 5 });
    const input = baseInput({ goal: g, goalsSoFar: [g], periodType: 'SO' });

    const milestones = detectMilestones(input);
    assert.equal(milestones.find(m => m.kind === 'ot_winner'), undefined);
  });
});

describe('detectMilestones - shootout goals', () => {
  test('a shootout goal produces no milestones, even after a hat trick in regulation', () => {
    const playerId = 250;
    const g1 = goal({ playerId, eventId: 20 });
    const g2 = goal({ playerId, eventId: 21 });
    const g3 = goal({ playerId, eventId: 22, goalsToDate: 3 }); // hat trick, regulation
    const soGoal = goal({ playerId, eventId: 23, periodType: 'SO', goalsToDate: 3 });
    const input = baseInput({
      goal: soGoal,
      goalsSoFar: [g1, g2, g3, soGoal],
      periodType: 'SO',
      gameType: 2,
      careerBefore: { goals: 0, points: 0 },
    });

    const milestones = detectMilestones(input);
    assert.deepEqual(milestones, []);
  });
});

describe('detectMilestones - season goals', () => {
  test('20th goal of the season fires season_goals', () => {
    const g = goal({ playerId: 300, eventId: 6, goalsToDate: 20 });
    const input = baseInput({ goal: g, goalsSoFar: [g], gameType: 2 });

    const milestones = detectMilestones(input);
    const seasonGoal = milestones.find(m => m.kind === 'season_goals');
    assert.ok(seasonGoal, 'expected a season_goals milestone');
    assert.equal(seasonGoal?.label, '20th goal of the season');
  });

  test('preseason and playoff games yield no season or career milestones', () => {
    const g = goal({ playerId: 300, eventId: 6, goalsToDate: 20 });

    for (const gameType of [1, 3]) {
      const input = baseInput({
        goal: g,
        goalsSoFar: [g],
        gameType,
        careerBefore: { goals: 0, points: 0 },
      });
      const milestones = detectMilestones(input);
      assert.equal(milestones.find(m => m.kind === 'season_goals'), undefined, `gameType ${gameType}`);
      assert.equal(milestones.find(m => m.kind === 'first_nhl_goal'), undefined, `gameType ${gameType}`);
      assert.equal(milestones.find(m => m.kind === 'career_goals'), undefined, `gameType ${gameType}`);
      assert.equal(milestones.find(m => m.kind === 'career_points'), undefined, `gameType ${gameType}`);
    }
  });
});

describe('detectMilestones - career milestones', () => {
  test('first NHL goal fires when careerBefore.goals is 0 and this is the first goal', () => {
    const g = goal({ playerId: 400, eventId: 7, goalsToDate: 1 });
    const input = baseInput({
      goal: g,
      goalsSoFar: [g],
      gameType: 2,
      careerBefore: { goals: 0, points: 0 },
    });

    const milestones = detectMilestones(input);
    const first = milestones.find(m => m.kind === 'first_nhl_goal');
    assert.ok(first, 'expected a first_nhl_goal milestone');
    assert.equal(first?.label, 'FIRST NHL GOAL!');
    // First NHL goal suppresses career_goals/career_points for the same goal
    assert.equal(milestones.find(m => m.kind === 'career_goals'), undefined);
    assert.equal(milestones.find(m => m.kind === 'career_points'), undefined);
  });

  test('career goal #100 computed with 2 earlier goals in the same game', () => {
    const playerId = 500;
    const g1 = goal({ playerId, eventId: 8, goalsToDate: 96 });
    const g2 = goal({ playerId, eventId: 9, goalsToDate: 97 });
    const g3 = goal({ playerId, eventId: 10, goalsToDate: 98 });
    const input = baseInput({
      goal: g3,
      goalsSoFar: [g1, g2, g3],
      gameType: 2,
      careerBefore: { goals: 97, points: 200 }, // before this game; +3 goals this game = 100
    });

    const milestones = detectMilestones(input);
    const careerGoal = milestones.find(m => m.kind === 'career_goals');
    assert.ok(careerGoal, 'expected a career_goals milestone');
    assert.equal(careerGoal?.label, 'Career goal #100');
  });

  test('career point #500 via an earlier assist plus this goal', () => {
    const playerId = 600;
    const otherScorerId = 601;
    const earlierGoalAssistedByPlayer = goal({
      playerId: otherScorerId,
      eventId: 11,
      assists: [{ playerId, firstName: { default: 'First' }, lastName: { default: 'Last' }, name: { default: 'F. Last' }, assistsToDate: 10 }],
    });
    const thisGoal = goal({ playerId, eventId: 12, goalsToDate: 30 });
    const input = baseInput({
      goal: thisGoal,
      goalsSoFar: [earlierGoalAssistedByPlayer, thisGoal],
      gameType: 2,
      // Before this game: 498 points. This game: +1 assist, +1 goal = +2 points = 500
      careerBefore: { goals: 250, points: 498 },
    });

    const milestones = detectMilestones(input);
    const careerPoint = milestones.find(m => m.kind === 'career_points');
    assert.ok(careerPoint, 'expected a career_points milestone');
    assert.equal(careerPoint?.label, 'Career point #500');
  });

  test('career milestones require careerBefore to be known', () => {
    const g = goal({ playerId: 700, eventId: 13, goalsToDate: 1 });
    const input = baseInput({ goal: g, goalsSoFar: [g], gameType: 2, careerBefore: undefined });

    const milestones = detectMilestones(input);
    assert.equal(milestones.find(m => m.kind === 'first_nhl_goal'), undefined);
    assert.equal(milestones.find(m => m.kind === 'career_goals'), undefined);
    assert.equal(milestones.find(m => m.kind === 'career_points'), undefined);
  });
});

describe('detectMilestones - non-primary team', () => {
  test('opponent OT goal (not a multi-goal game) yields no milestones', () => {
    const g = goal({ playerId: 800, eventId: 14 });
    const input = baseInput({
      goal: g,
      goalsSoFar: [g],
      periodType: 'OT',
      gameType: 2,
      isPrimaryTeam: false,
      careerBefore: { goals: 0, points: 0 },
    });

    const milestones = detectMilestones(input);
    assert.deepEqual(milestones, []);
  });

  test('opponent hat trick yields exactly one hat_trick milestone with celebrate: false', () => {
    const g1 = goal({ playerId: 800, eventId: 14 });
    const g2 = goal({ playerId: 800, eventId: 15 });
    const g3 = goal({ playerId: 800, eventId: 16 });
    const input = baseInput({
      goal: g3,
      goalsSoFar: [g1, g2, g3],
      periodType: 'REG',
      gameType: 2,
      isPrimaryTeam: false,
      careerBefore: { goals: 0, points: 0 },
    });

    const milestones = detectMilestones(input);
    assert.equal(milestones.length, 1);
    assert.equal(milestones[0].kind, 'hat_trick');
    assert.equal(milestones[0].celebrate, false);
  });

  test('opponent 20th-of-season goal yields no milestones', () => {
    const g = goal({ playerId: 800, eventId: 16, goalsToDate: 20 });
    const input = baseInput({
      goal: g,
      goalsSoFar: [g],
      periodType: 'REG',
      gameType: 2,
      isPrimaryTeam: false,
      careerBefore: { goals: 0, points: 0 },
    });

    const milestones = detectMilestones(input);
    assert.deepEqual(milestones, []);
  });
});
