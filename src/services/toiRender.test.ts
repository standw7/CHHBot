import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildToiSvg, buildLinesSvg, renderPng, cellColor } from './toiRender.js';
import type { ToiChartInput, LinesChartInput } from './toiRender.js';
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
    assert.equal(cellColor(1, 1, 13), '#16283a');
    assert.equal(cellColor(13, 1, 13), '#6cace4');
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
    assert.ok(svg.includes('TIME AGAINST OPPONENTS · UTA · 5V5 MINUTES · EDGES: TOTAL TOI · DATA: NHL'));
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

function linesInput(overrides: Partial<LinesChartInput> = {}): LinesChartInput {
  // 3 forwards (one line) + 2 D (one pair); ids 1-3 F, 4-5 D
  const together: Record<string, number> = { '1-2': 600, '1-3': 540, '2-3': 480, '4-5': 720, '1-4': 300, '2-5': 0 };
  return {
    players: [p(1, 'L. Cooley'), p(2, 'C. Keller'), p(3, 'V. Trocheck'), p(4, 'M. Weegar', 'D'), p(5, 'D. Simashev', 'D')],
    dividerAfter: 3,
    blocks: [3, 2],
    together: (a, b) => together[`${Math.min(a, b)}-${Math.max(a, b)}`] ?? 60,
    toi: id => 900 + id * 6,
    teamCode: 'UTA',
    ...overrides,
  };
}

describe('buildLinesSvg', () => {
  test('labels on both axes, diagonal own TOI, 1-decimal values and the footer', () => {
    const svg = buildLinesSvg(linesInput());
    assert.equal(svg.split('>L. Cooley<').length - 1, 2, 'row + column label');
    assert.ok(svg.includes('>10.0<')); // Cooley–Keller, 600 s
    assert.ok(svg.includes('>15.1<')); // Cooley's own 5v5 TOI, 906 s
    assert.ok(svg.includes('LINE PAIRINGS · UTA · 5V5 MINUTES TOGETHER · DIAGONAL: 5V5 TOI · DATA: NHL'));
    assert.ok(!/hockeystatcards/i.test(svg));
  });

  test('colour scale over off-diagonal cells only: the top pairing gets the brightest blue', () => {
    const svg = buildLinesSvg(linesInput());
    // 720 s (Weegar–Simashev) is the off-diagonal max even though every diagonal value is larger
    assert.equal(svg.split('fill="#6cace4"').length - 1, 2);
  });

  test('zero cells are dimmed with no number', () => {
    const svg = buildLinesSvg(linesInput());
    assert.ok(!svg.includes('>0.0<'));
    assert.equal(svg.split('fill="#1b1d21"').length - 1, 2); // Keller–Simashev, both ways
  });

  test('one outline per line / pair block', () => {
    const svg = buildLinesSvg(linesInput());
    assert.equal(svg.split('fill="none"').length - 1, 2);
  });

  test('renders to a PNG', () => {
    const png = renderPng(buildLinesSvg(linesInput()));
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});

describe('renderPng', () => {
  test('returns a PNG', () => {
    const png = renderPng(buildToiSvg(input()));
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
