import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseShiftReport, shiftReportUrl } from './toiHtmlReport.js';

const row = (n: number, per: string, start: string, end: string, dur: string) => `
<tr class="oddColor">
<td align="center" class="lborder + bborder">${n}</td>
<td align="center" class="lborder + bborder">${per}</td>
<td align="center" class="lborder + bborder">${start} / 19:00</td>
<td align="center" class="lborder + bborder">${end} / 18:00</td>
<td align="center" class="lborder + bborder">${dur}</td>
<td align="center" class="lborder + bborder + rborder">&nbsp;</td>
</tr>`;
const player = (num: number, name: string, rows: string) =>
  `<td align="center" valign="top" class="playerHeading + border" colspan="8">${num} ${name}</td></tr><tr><td class="heading">Shift #</td></tr>${rows}
  <tr><td>Per</td><td>SHF</td><td>AVG</td><td>TOI</td></tr><tr><td>1</td><td>9</td><td>00:39</td><td>05:59</td></tr>`;

describe('shiftReportUrl', () => {
  test('builds season folder and home/visitor report', () => {
    assert.equal(shiftReportUrl(2026020164, 'home'), 'https://www.nhl.com/scores/htmlreports/20262027/TH020164.HTM');
    assert.equal(shiftReportUrl(2026030411, 'away'), 'https://www.nhl.com/scores/htmlreports/20262027/TV030411.HTM');
  });
});

describe('parseShiftReport', () => {
  const html = player(6, 'LARSSON, ADAM', row(1, '1', '0:26', '1:10', '00:44') + row(2, 'OT', '1:00', '1:45', '00:45') + row(3, 'SO', '0:00', '0:00', '00:00'))
    + player(99, 'NOBODY, NOT', row(1, '1', '0:00', '0:30', '00:30'))
    + player(31, 'GRUBAUER, PHILIPP', row(1, '2', '0:00', '20:00', '20:00'));
  const rows = parseShiftReport(html, 'SEA', new Map([[6, 1001], [31, 1002]]));

  test('maps players by sweater number, skipping unknown ones and shootout rows', () => {
    assert.deepEqual(rows.map(r => [r.playerId, r.period, r.startTime, r.endTime]), [
      [1001, 1, '0:26', '1:10'],
      [1001, 4, '1:00', '1:45'],
      [1002, 2, '0:00', '20:00'],
    ]);
  });

  test('summary table rows are not mistaken for shifts', () => {
    assert.equal(rows.filter(r => r.playerId === 1001).length, 2);
  });

  test('fills shiftchart-style fields', () => {
    assert.equal(rows[0].teamAbbrev, 'SEA');
    assert.equal(rows[0].typeCode, 517);
    assert.equal(rows[0].lastName, 'LARSSON');
  });
});
