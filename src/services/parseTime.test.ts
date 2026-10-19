import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { parseTime } from './parseTime.js';

const ZONE = 'America/Denver';

function yearsFromNow(input: string): number {
  const parsed = parseTime(input, ZONE);
  assert.ok(parsed, `expected "${input}" to parse`);
  return Math.round(parsed.date.diff(DateTime.now().setZone(ZONE), 'years').years);
}

describe('parseTime years', () => {
  test('7y is 7 calendar years from now', () => {
    assert.equal(yearsFromNow('7y'), 7);
    assert.equal(parseTime('7y', ZONE)?.relative, 'in 7 years');
  });

  test('singular and spelled-out forms', () => {
    assert.equal(parseTime('1y', ZONE)?.relative, 'in 1 year');
    assert.equal(yearsFromNow('2yr'), 2);
    assert.equal(yearsFromNow('2yrs'), 2);
    assert.equal(yearsFromNow('3 years'), 3);
    assert.equal(yearsFromNow('1 year'), 1);
  });

  test('combined with smaller units', () => {
    const parsed = parseTime('1y 2d', ZONE);
    assert.ok(parsed);
    const expected = DateTime.now().setZone(ZONE).plus({ years: 1, days: 2 });
    assert.ok(Math.abs(parsed.date.diff(expected).as('seconds')) < 5);
    assert.equal(parsed.relative, 'in 1 year 2 days');
  });
});

describe('parseTime existing relative forms still work', () => {
  test('hours, days, minutes', () => {
    assert.equal(parseTime('2h', ZONE)?.relative, 'in 2 hours');
    assert.equal(parseTime('30d', ZONE)?.relative, 'in 30 days');
    assert.equal(parseTime('1h30m', ZONE)?.relative, 'in 1h 30m');
  });

  test('zero and junk are rejected', () => {
    assert.equal(parseTime('0y', ZONE), null);
    assert.equal(parseTime('soon', ZONE), null);
  });
});
