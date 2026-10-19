import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildToiSvg, renderPng, cellColor } from './toiRender.js';
import type { ToiChartInput } from './toiRender.js';
import type { ChartPlayer } from './toiChart.js';

const p = (id: number, label: string, position: 'F' | 'D' = 'F'): ChartPlayer => ({ id, label, position });

function input(overrides: Partial<ToiChartInput> = {}): ToiChartInput {
  return {
    rows: [p(1, 'K. Yamamoto'), p(2, 'M. Weegar', 'D')],
    cols: [p(11, 'C. McDavid'), p(12, 'E. Bouchard', 'D')],
    rowDividerAfter: 1,
    colDividerAfter: 1,
    seconds: (r, c) => (r === 2 && c === 11 ? 690 : 300),
    teamCode: 'UTA',
    ...overrides,
  };
}

describe('cellColor', () => {
  test('min and max map to the ends of the scale', () => {
    assert.equal(cellColor(1, 1, 13), '#34251e');
    assert.equal(cellColor(13, 1, 13), '#94562f');
  });

  test('midpoint lies strictly between', () => {
    const mid = cellColor(7, 1, 13);
    assert.notEqual(mid, '#34251e');
    assert.notEqual(mid, '#94562f');
  });

  test('min === max does not divide by zero', () => {
    assert.match(cellColor(5, 5, 5), /^#[0-9a-f]{6}$/);
  });
});

describe('buildToiSvg', () => {
  test('labels, 1-decimal values and the exact footer; no HockeyStatCards branding', () => {
    const svg = buildToiSvg(input());
    for (const label of ['K. Yamamoto', 'M. Weegar', 'C. McDavid', 'E. Bouchard']) assert.ok(svg.includes(label), label);
    assert.ok(svg.includes('>11.5<'));
    assert.ok(svg.includes('>5.0<'));
    assert.ok(svg.includes('TIME AGAINST OPPONENTS · UTA · 5V5 MINUTES · DATA: NHL'));
    assert.ok(!/hockeystatcards/i.test(svg));
  });

  test('label collision: two players called J. Smith both appear', () => {
    const svg = buildToiSvg(input({ rows: [p(1, 'J. Smith'), p(3, 'J. Smith')], rowDividerAfter: 2 }));
    assert.equal(svg.split('>J. Smith<').length - 1, 2);
  });

  test('XML-escapes labels', () => {
    const svg = buildToiSvg(input({ rows: [p(1, "R. O'Reilly & Co")], rowDividerAfter: 1 }));
    assert.ok(svg.includes('R. O&apos;Reilly &amp; Co'));
  });
});

describe('renderPng', () => {
  test('returns a PNG', () => {
    const png = renderPng(buildToiSvg(input()));
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
