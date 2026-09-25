import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isRewardsPingDue, REWARDS_PING_INTERVAL_MS } from './rewardsReminder.js';

const NOW = Date.parse('2026-10-10T02:00:00Z');

describe('isRewardsPingDue', () => {
  test('first ping is due when none has been sent this game', () => {
    assert.equal(isRewardsPingDue(null, NOW), true);
  });

  test('not due right after a ping', () => {
    assert.equal(isRewardsPingDue(NOW - 1_000, NOW), false);
  });

  test('not due one second before the interval', () => {
    assert.equal(isRewardsPingDue(NOW - REWARDS_PING_INTERVAL_MS + 1_000, NOW), false);
  });

  test('due exactly at the interval', () => {
    assert.equal(isRewardsPingDue(NOW - REWARDS_PING_INTERVAL_MS, NOW), true);
  });

  test('due when overdue (e.g. after a bot restart)', () => {
    assert.equal(isRewardsPingDue(NOW - 2 * REWARDS_PING_INTERVAL_MS, NOW), true);
  });

  test('interval is 45 minutes', () => {
    assert.equal(REWARDS_PING_INTERVAL_MS, 45 * 60_000);
  });
});
