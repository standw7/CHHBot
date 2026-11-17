import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { toiChartInputFromGame, toiChartTitle, linesChartTitle, pickLatestCompletedGame, toiMessage, linesMessage } from './toiPost.js';
import type { BoxTeam } from './toiPost.js';
import type { ShiftChartRow, ScheduleGame } from '../nhl/types.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/2026020133.json', import.meta.url), 'utf8')) as {
  shifts: ShiftChartRow[];
  box: { home: string; away: string; homePlayers: Omit<BoxTeam, 'abbrev'>; awayPlayers: Omit<BoxTeam, 'abbrev'> };
};
const home: BoxTeam = { abbrev: fixture.box.home, ...fixture.box.homePlayers };
const away: BoxTeam = { abbrev: fixture.box.away, ...fixture.box.awayPlayers };

describe('toiChartInputFromGame', () => {
  test('fixture: Utah forwards then D, each sorted by total TOI, Edmonton columns forwards then defense, 5v5 seconds', () => {
    const inputs = toiChartInputFromGame(fixture.shifts, home, away, 'UTA');
    assert.ok(inputs && inputs !== 'incomplete');
    const input = inputs.against;
    assert.equal(input.teamCode, 'UTA');
    assert.equal(input.rows.length, 18);
    assert.equal(input.cols.length, 18);
    assert.equal(input.rowDividerAfter, 12);
    assert.equal(input.colDividerAfter, 12);
    // within forwards and within D: most total TOI first
    const secs = input.rows.map(r => { const [m, sec] = r.toi!.split(':').map(Number); return m * 60 + sec; });
    const desc = (xs: number[]) => [...xs].sort((a, b) => b - a);
    assert.deepEqual(secs.slice(0, 12), desc(secs.slice(0, 12)));
    assert.deepEqual(secs.slice(12), desc(secs.slice(12)));
    assert.ok(input.rows.slice(0, 12).every(r => r.position === 'F'));
    assert.equal(input.rows[12].label, 'M. Weegar'); // 22:38, the most among D
    const weegar = input.rows.find(r => r.label === 'M. Weegar')!;
    const drai = input.cols.find(c => c.label === 'L. Draisaitl')!;
    assert.equal(Math.round(input.seconds(weegar.id, drai.id) / 6) / 10, 11.3);
    assert.ok(input.rows.every(r => !['K. Vejmelka', 'V. Kolosov'].includes(r.label)), 'no goalies');
  });

  test('works when Utah is the away team', () => {
    const input = toiChartInputFromGame(fixture.shifts, home, away, 'EDM');
    assert.ok(input && input !== 'incomplete');
    assert.ok(input.against.rows.some(r => r.label === 'C. McDavid'));
    assert.ok(input.lines.players.some(p => p.label === 'C. McDavid'));
    assert.ok(input.lines.players.every(p => p.label !== 'K. Yamamoto'), 'only our skaters');
  });

  test('team not in the game → null', () => {
    assert.equal(toiChartInputFromGame(fixture.shifts, home, away, 'BOS'), null);
  });

  test("a goalie's missing shift → incomplete (goalies count toward completeness)", () => {
    const goalieId = home.goalies[0].playerId;
    const lastGoalieShift = fixture.shifts.map((r, i) => ({ r, i })).filter(x => x.r.playerId === goalieId).pop()!.i;
    const rows = fixture.shifts.filter((_, i) => i !== lastGoalieShift);
    assert.equal(toiChartInputFromGame(rows, home, away, 'UTA'), 'incomplete');
  });

  test('open shifts → incomplete', () => {
    const rows = fixture.shifts.map((r, i) => (i === 0 ? { ...r, duration: null } : r));
    assert.equal(toiChartInputFromGame(rows, home, away, 'UTA'), 'incomplete');
  });
});

describe('lines chart input', () => {
  const inputs = toiChartInputFromGame(fixture.shifts, home, away, 'UTA');
  assert.ok(inputs && inputs !== 'incomplete');
  const { lines, against } = inputs;

  test('same Utah skaters as the TOI chart, forwards then D, in line-grouped blocks', () => {
    assert.equal(lines.teamCode, 'UTA');
    assert.deepEqual(new Set(lines.players.map(p => p.id)), new Set(against.rows.map(r => r.id)));
    assert.equal(lines.dividerAfter, 12);
    assert.ok(lines.players.slice(0, 12).every(p => p.position === 'F'));
    assert.ok(lines.players.slice(12).every(p => p.position === 'D'));
    assert.deepEqual(lines.blocks, [3, 3, 3, 3, 2, 2, 2]);
  });

  test('each block is a real line: linemates share more 5v5 time with each other than with anyone outside', () => {
    let start = 0;
    for (const size of lines.blocks) {
      const block = lines.players.slice(start, start + size);
      const seed = block[0];
      const outside = lines.players.filter(p => p.position === seed.position && !block.includes(p));
      const bestOutside = Math.max(...outside.map(o => lines.together(seed.id, o.id)));
      for (const mate of block.slice(1)) assert.ok(lines.together(seed.id, mate.id) >= bestOutside, `${seed.label}–${mate.label}`);
      start += size;
    }
  });

  test('together is symmetric and bounded by each player\'s own 5v5 TOI', () => {
    const [a, b] = lines.players;
    assert.equal(lines.together(a.id, b.id), lines.together(b.id, a.id));
    assert.ok(lines.together(a.id, b.id) > 0);
    assert.ok(lines.together(a.id, b.id) <= Math.min(lines.toi(a.id), lines.toi(b.id)));
  });

  test('a forward is on with 2 other forwards: his F row sums to ≈ 2× his 5v5 TOI', () => {
    const forwards = lines.players.slice(0, lines.dividerAfter);
    for (const f of forwards) {
      const sum = forwards.filter(o => o.id !== f.id).reduce((acc, o) => acc + lines.together(f.id, o.id), 0);
      // exactly 2 only if every 5v5 second had 3 forwards; allow for 4F/1D or 2F/3D shifts
      assert.ok(Math.abs(sum - 2 * lines.toi(f.id)) <= 0.15 * lines.toi(f.id) + 60, `${f.label}: ${sum} vs ${2 * lines.toi(f.id)}`);
    }
  });
});

describe('toiChartTitle', () => {
  test('away @ home with short date', () => {
    assert.equal(toiChartTitle('EDM', 'UTA', '2026-10-17'), '⏱️ Time against opponents · EDM @ UTA · Oct 17');
  });

  test('lines title', () => {
    assert.equal(linesChartTitle('EDM', 'UTA', '2026-10-17'), '🤝 Line combinations · EDM @ UTA · Oct 17');
  });
});

describe('toiMessage / linesMessage', () => {
  const charts = { against: { png: Buffer.from('a'), title: 'A' }, lines: { png: Buffer.from('b'), title: 'B' } };
  const names = (m: { files?: unknown }) => (m.files as { name: string | null }[]).map(f => f.name);
  test('TOI chart message has only the against chart', () => {
    const msg = toiMessage(charts, 42);
    assert.equal(msg.content, '**A**');
    assert.deepEqual(names(msg), ['toi-42.png']);
  });
  test('lines message has only the line combinations chart', () => {
    const msg = linesMessage(charts, 42);
    assert.equal(msg.content, '**B**');
    assert.deepEqual(names(msg), ['lines-42.png']);
  });
});

describe('pickLatestCompletedGame', () => {
  const g = (id: number, gameType: number, gameState: string, startTimeUTC: string) =>
    ({ id, gameType, gameState, startTimeUTC }) as ScheduleGame;

  test('latest finished regular-season or playoff game', () => {
    const games = [
      g(1, 2, 'OFF', '2026-10-15T02:00:00Z'),
      g(2, 2, 'FINAL', '2026-10-18T02:00:00Z'),
      g(3, 2, 'LIVE', '2026-10-20T02:00:00Z'),
      g(4, 2, 'FUT', '2026-10-22T02:00:00Z'),
      g(0, 1, 'OFF', '2026-10-19T02:00:00Z'), // preseason
    ];
    assert.equal(pickLatestCompletedGame(games), 2);
  });

  test('no finished games → null', () => {
    assert.equal(pickLatestCompletedGame([g(4, 2, 'FUT', '2026-10-22T02:00:00Z')]), null);
  });
});
