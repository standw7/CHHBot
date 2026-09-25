import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initialRewardsSchedule, dueRewardsSlot, REWARDS_PING_INTERVAL_MS } from './rewardsReminder.js';

const MIN = 60_000;
const SCHEDULED = Date.parse('2026-10-10T01:00:00Z');

describe('initialRewardsSchedule', () => {
  test('watched from the start: anchors at now and pings slot 0 immediately', () => {
    const now = SCHEDULED + 8 * MIN;
    const s = initialRewardsSchedule(true, SCHEDULED, now);
    assert.deepEqual(s, { anchorAt: now, lastSlot: -1 });
    assert.equal(dueRewardsSlot(s, now), 0);
  });

  test('joined late: anchors at scheduled start and skips passed marks', () => {
    const now = SCHEDULED + 20 * MIN;
    const s = initialRewardsSchedule(false, SCHEDULED, now);
    assert.deepEqual(s, { anchorAt: SCHEDULED, lastSlot: 0 });
    assert.equal(dueRewardsSlot(s, now), null);
  });

  test('joined late after the 1:30 mark: 1:30 is skipped too', () => {
    const now = SCHEDULED + 100 * MIN;
    const s = initialRewardsSchedule(false, SCHEDULED, now);
    assert.equal(s.lastSlot, 2);
    assert.equal(dueRewardsSlot(s, now), null);
  });
});

describe('dueRewardsSlot', () => {
  test('joined 20 min in: pings only at 0:45, 1:30, 2:15', () => {
    let s = initialRewardsSchedule(false, SCHEDULED, SCHEDULED + 20 * MIN);
    const fired: number[] = [];
    for (let t = SCHEDULED + 20 * MIN; t <= SCHEDULED + 150 * MIN; t += 10_000) {
      const slot = dueRewardsSlot(s, t);
      if (slot !== null) {
        fired.push((t - SCHEDULED) / MIN);
        s = { ...s, lastSlot: slot };
      }
    }
    assert.deepEqual(fired, [45, 90, 135]);
  });

  test('watched from start: pings at 0, 0:45, 1:30, 2:15 relative to puck drop', () => {
    const drop = SCHEDULED + 8 * MIN;
    let s = initialRewardsSchedule(true, SCHEDULED, drop);
    const fired: number[] = [];
    for (let t = drop; t <= drop + 150 * MIN; t += 10_000) {
      const slot = dueRewardsSlot(s, t);
      if (slot !== null) {
        fired.push((t - drop) / MIN);
        s = { ...s, lastSlot: slot };
      }
    }
    assert.deepEqual(fired, [0, 45, 90, 135]);
  });

  test('not due one second before a mark, due exactly at it', () => {
    const s = { anchorAt: SCHEDULED, lastSlot: 0 };
    assert.equal(dueRewardsSlot(s, SCHEDULED + REWARDS_PING_INTERVAL_MS - 1_000), null);
    assert.equal(dueRewardsSlot(s, SCHEDULED + REWARDS_PING_INTERVAL_MS), 1);
  });

  test('downtime across several marks sends one ping for the latest mark', () => {
    const s = { anchorAt: SCHEDULED, lastSlot: 0 };
    assert.equal(dueRewardsSlot(s, SCHEDULED + 100 * MIN), 2);
  });

  test('interval is 45 minutes', () => {
    assert.equal(REWARDS_PING_INTERVAL_MS, 45 * MIN);
  });
});
