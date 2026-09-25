import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findUpcomingMilestones } from './milestoneWatch.js';
import type { WatchPlayer } from './milestoneWatch.js';

function player(overrides: Partial<WatchPlayer>): WatchPlayer {
  return {
    name: 'Keller',
    careerGamesPlayed: 450,
    careerGoals: 150,
    careerPoints: 330,
    seasonGoals: 5,
    ...overrides,
  };
}

describe('findUpcomingMilestones', () => {
  test('nothing close → empty', () => {
    assert.deepEqual(findUpcomingMilestones([player({})]), []);
  });

  test('1 goal from a season goal threshold', () => {
    assert.deepEqual(findUpcomingMilestones([player({ seasonGoals: 19 })]), ['Keller: 1 goal from 20 this season']);
  });

  test('2 goals from a season threshold is not shown', () => {
    assert.deepEqual(findUpcomingMilestones([player({ seasonGoals: 18 })]), []);
  });

  test('1 goal from the next hundred career goals', () => {
    assert.deepEqual(findUpcomingMilestones([player({ careerGoals: 299 })]), ['Keller: 1 goal from 300 career goals']);
  });

  test('career points: 2 away and 1 away shown, 3 away not', () => {
    assert.deepEqual(findUpcomingMilestones([player({ careerPoints: 248 })]), ['Keller: 2 points from 250 career points']);
    assert.deepEqual(findUpcomingMilestones([player({ careerPoints: 249 })]), ['Keller: 1 point from 250 career points']);
    assert.deepEqual(findUpcomingMilestones([player({ careerPoints: 247 })]), []);
  });

  test('career points only at the named thresholds (not every hundred)', () => {
    assert.deepEqual(findUpcomingMilestones([player({ careerPoints: 599 })]), []);
  });

  test('next game is a hundredth game', () => {
    assert.deepEqual(findUpcomingMilestones([player({ careerGamesPlayed: 699 })]), ['Keller: 700th NHL game if he plays tonight']);
  });

  test('NHL debut, with no other lines for a player with zero stats', () => {
    const p = player({ name: 'But', careerGamesPlayed: 0, careerGoals: 0, careerPoints: 0, seasonGoals: 0 });
    assert.deepEqual(findUpcomingMilestones([p]), ['But: NHL debut if he plays tonight']);
  });

  test('multiple milestones for one player, and ordering across players', () => {
    const lines = findUpcomingMilestones([
      player({ name: 'Cooley', careerGamesPlayed: 199 }),
      player({ name: 'Keller', seasonGoals: 29, careerGoals: 399 }),
      player({ name: 'But', careerGamesPlayed: 0, careerGoals: 0, careerPoints: 0, seasonGoals: 0 }),
    ]);
    assert.deepEqual(lines, [
      'But: NHL debut if he plays tonight',
      'Keller: 1 goal from 400 career goals',
      'Keller: 1 goal from 30 this season',
      'Cooley: 200th NHL game if he plays tonight',
    ]);
  });
});
