import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import type { ChartPlayer } from './toiChart.js';
import { THEME, mix, textOn } from './chartTheme.js';

// Fonts ship in the repo so local renders and the VM match (repo root/assets/fonts,
// resolved from src/services or dist/services alike).
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_FILES = ['IBMPlexSans-Regular.ttf', 'IBMPlexSans-SemiBold.ttf'].map(f => path.join(FONT_DIR, f));

const COLORS = {
  background: THEME.background,
  rowLabel: THEME.label,
  colLabel: THEME.label,
  divider: THEME.divider,
  toi: THEME.muted, // total TOI next to names
  footer: THEME.muted,
  low: THEME.accentDeep,
  high: THEME.accent, // Mountain Blue
};

const LAYOUT = {
  pad: 24,
  labelWidth: 150, // row-label column
  headerHeight: 118, // angled column labels
  toiGutter: 62, // total TOI: right of each row, below each column
  cellW: 40,
  cellH: 34,
  gap: 6,
  footerHeight: 64,
  labelAngle: -55,
  groupGap: 16, // extra space between forwards and defense, rows and columns
};

export interface ToiChartInput {
  rows: ChartPlayer[]; // Utah skaters, forwards then defense
  cols: ChartPlayer[]; // opponent skaters, forwards then defense
  rowDividerAfter: number; // number of forward rows
  colDividerAfter: number; // number of forward columns
  seconds: (rowId: number, colId: number) => number;
  teamCode: string;
}

/** Continuous deep navy (min) → Mountain Blue (max) scale. */
export function cellColor(value: number, min: number, max: number): string {
  const t = max > min ? (value - min) / (max - min) : 0;
  return mix(COLORS.low, COLORS.high, t);
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}

export function buildToiSvg(input: ToiChartInput): string {
  const { rows, cols, rowDividerAfter, colDividerAfter, seconds, teamCode } = input;
  const { pad, labelWidth, headerHeight, cellW, cellH, gap, footerHeight, labelAngle } = LAYOUT;
  const pitchX = cellW + gap;
  const pitchY = cellH + gap;
  const gridX = pad + labelWidth;
  const gridY = pad + headerHeight;
  const splitCols = colDividerAfter > 0 && colDividerAfter < cols.length;
  const splitRows = rowDividerAfter > 0 && rowDividerAfter < rows.length;
  const gridW = cols.length * pitchX - gap + (splitCols ? LAYOUT.groupGap : 0);
  const gridH = rows.length * pitchY - gap + (splitRows ? LAYOUT.groupGap : 0);
  // Left/top edge of column j / row i, with the forwards/defense gap added after the divider
  const colX = (j: number) => gridX + j * pitchX + (splitCols && j >= colDividerAfter ? LAYOUT.groupGap : 0);
  const rowY = (i: number) => gridY + i * pitchY + (splitRows && i >= rowDividerAfter ? LAYOUT.groupGap : 0);
  // Total TOI sits opposite the names: right of the rows, under the columns
  const showToi = rows.some(r => r.toi) || cols.some(c => c.toi);
  const toiGutter = showToi ? LAYOUT.toiGutter : 0;
  const toiBand = showToi ? 30 : 0;
  const width = gridX + gridW + Math.max(pad + 40, toiGutter + pad); // room for the last angled label / TOI column
  const height = gridY + gridH + toiBand + footerHeight + pad;

  const minutes = rows.map(r => cols.map(c => seconds(r.id, c.id) / 60));
  const flat = minutes.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
    `<g font-family="IBM Plex Sans">`,
  ];

  cols.forEach((c, j) => {
    const x = colX(j) + cellW / 2 - 4;
    const y = gridY - 10;
    parts.push(
      `<text x="${x}" y="${y}" transform="rotate(${labelAngle} ${x} ${y})" font-size="15" font-weight="500" fill="${COLORS.colLabel}">${esc(c.label)}</text>`,
      c.toi ? `<text x="${colX(j) + cellW / 2}" y="${gridY + gridH + 24}" text-anchor="middle" font-size="13" fill="${COLORS.toi}">${esc(c.toi)}</text>` : ''
    );
  });

  rows.forEach((r, i) => {
    const y = rowY(i);
    parts.push(
      `<text x="${gridX - 14}" y="${y + cellH / 2 + 5.5}" text-anchor="end" font-size="16" font-weight="500" fill="${COLORS.rowLabel}">${esc(r.label)}</text>`,
      r.toi ? `<text x="${gridX + gridW + 14}" y="${y + cellH / 2 + 5}" text-anchor="start" font-size="14" fill="${COLORS.toi}">${esc(r.toi)}</text>` : ''
    );
    cols.forEach((c, j) => {
      const x = colX(j);
      const value = minutes[i][j];
      const fill = cellColor(value, min, max);
      parts.push(
        `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${fill}"/>`,
        `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${textOn(fill)}">${value.toFixed(1)}</text>`
      );
    });
  });

  // Forwards / defense dividers, centred in the gap
  if (splitCols) {
    const x = colX(colDividerAfter) - (gap + LAYOUT.groupGap) / 2;
    parts.push(`<line x1="${x}" y1="${gridY - 4}" x2="${x}" y2="${gridY + gridH + 4}" stroke="${COLORS.divider}" stroke-width="1.5"/>`);
  }
  if (splitRows) {
    const y = rowY(rowDividerAfter) - (gap + LAYOUT.groupGap) / 2;
    parts.push(`<line x1="${gridX - 4}" y1="${y}" x2="${gridX + gridW + 4}" y2="${y}" stroke="${COLORS.divider}" stroke-width="1.5"/>`);
  }

  const footer = `TIME AGAINST OPPONENTS · ${teamCode} · 5V5 MINUTES · EDGES: TOTAL TOI · DATA: NHL`;
  parts.push(
    `<text x="${gridX + gridW / 2}" y="${gridY + gridH + toiBand + footerHeight - 14}" text-anchor="middle" font-size="16" font-weight="600" letter-spacing="2.5" fill="${COLORS.footer}">${esc(footer)}</text>`,
    `</g></svg>`
  );
  return parts.join('');
}

export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'IBM Plex Sans' },
    fitTo: { mode: 'zoom', value: 2 },
  });
  return Buffer.from(resvg.render().asPng());
}
