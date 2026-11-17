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
  empty: THEME.surface, // lines chart: teammates never on together
  diagonal: THEME.divider, // lines chart: own-TOI cells
  diagonalText: THEME.muted,
  block: THEME.label, // lines chart: line / pair outlines
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

interface Grid {
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  colX: (j: number) => number;
  rowY: (i: number) => number;
  splitRows: boolean;
  splitCols: boolean;
}

/** Cell grid below the angled column labels and right of the row labels, with a forwards/defense gap. */
function gridGeometry(nRows: number, nCols: number, rowDividerAfter: number, colDividerAfter: number): Grid {
  const { pad, labelWidth, headerHeight, cellW, cellH, gap, groupGap } = LAYOUT;
  const pitchX = cellW + gap;
  const pitchY = cellH + gap;
  const gridX = pad + labelWidth;
  const gridY = pad + headerHeight;
  const splitCols = colDividerAfter > 0 && colDividerAfter < nCols;
  const splitRows = rowDividerAfter > 0 && rowDividerAfter < nRows;
  return {
    gridX,
    gridY,
    gridW: nCols * pitchX - gap + (splitCols ? groupGap : 0),
    gridH: nRows * pitchY - gap + (splitRows ? groupGap : 0),
    // Left/top edge of column j / row i, with the forwards/defense gap added after the divider
    colX: (j: number) => gridX + j * pitchX + (splitCols && j >= colDividerAfter ? groupGap : 0),
    rowY: (i: number) => gridY + i * pitchY + (splitRows && i >= rowDividerAfter ? groupGap : 0),
    splitRows,
    splitCols,
  };
}

function svgOpen(width: number, height: number): string[] {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
    `<g font-family="IBM Plex Sans">`,
  ];
}

function colLabel(g: Grid, j: number, label: string): string {
  const x = g.colX(j) + LAYOUT.cellW / 2 - 4;
  const y = g.gridY - 10;
  return `<text x="${x}" y="${y}" transform="rotate(${LAYOUT.labelAngle} ${x} ${y})" font-size="15" font-weight="500" fill="${COLORS.colLabel}">${esc(label)}</text>`;
}

function rowLabel(g: Grid, i: number, label: string): string {
  return `<text x="${g.gridX - 14}" y="${g.rowY(i) + LAYOUT.cellH / 2 + 5.5}" text-anchor="end" font-size="16" font-weight="500" fill="${COLORS.rowLabel}">${esc(label)}</text>`;
}

/** A coloured tile with its value in minutes (one decimal). */
function valueCell(x: number, y: number, fill: string, minutes: number): string[] {
  const { cellW, cellH } = LAYOUT;
  return [
    `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${fill}"/>`,
    `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${textOn(fill)}">${minutes.toFixed(1)}</text>`,
  ];
}

/** Forwards / defense dividers, centred in the gap. */
function dividers(g: Grid, rowDividerAfter: number, colDividerAfter: number): string[] {
  const offset = (LAYOUT.gap + LAYOUT.groupGap) / 2;
  const out: string[] = [];
  if (g.splitCols) {
    const x = g.colX(colDividerAfter) - offset;
    out.push(`<line x1="${x}" y1="${g.gridY - 4}" x2="${x}" y2="${g.gridY + g.gridH + 4}" stroke="${COLORS.divider}" stroke-width="1.5"/>`);
  }
  if (g.splitRows) {
    const y = g.rowY(rowDividerAfter) - offset;
    out.push(`<line x1="${g.gridX - 4}" y1="${y}" x2="${g.gridX + g.gridW + 4}" y2="${y}" stroke="${COLORS.divider}" stroke-width="1.5"/>`);
  }
  return out;
}

function footerText(g: Grid, y: number, text: string): string {
  return `<text x="${g.gridX + g.gridW / 2}" y="${y}" text-anchor="middle" font-size="16" font-weight="600" letter-spacing="2.5" fill="${COLORS.footer}">${esc(text)}</text>`;
}

export function buildToiSvg(input: ToiChartInput): string {
  const { rows, cols, rowDividerAfter, colDividerAfter, seconds, teamCode } = input;
  const { pad, cellW, cellH, footerHeight } = LAYOUT;
  const g = gridGeometry(rows.length, cols.length, rowDividerAfter, colDividerAfter);
  const { gridX, gridY, gridW, gridH, colX, rowY } = g;
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

  const parts = svgOpen(width, height);

  cols.forEach((c, j) => {
    parts.push(
      colLabel(g, j, c.label),
      c.toi ? `<text x="${colX(j) + cellW / 2}" y="${gridY + gridH + 24}" text-anchor="middle" font-size="13" fill="${COLORS.toi}">${esc(c.toi)}</text>` : ''
    );
  });

  rows.forEach((r, i) => {
    const y = rowY(i);
    parts.push(
      rowLabel(g, i, r.label),
      r.toi ? `<text x="${gridX + gridW + 14}" y="${y + cellH / 2 + 5}" text-anchor="start" font-size="14" fill="${COLORS.toi}">${esc(r.toi)}</text>` : ''
    );
    cols.forEach((_, j) => {
      const value = minutes[i][j];
      parts.push(...valueCell(colX(j), y, cellColor(value, min, max), value));
    });
  });

  parts.push(...dividers(g, rowDividerAfter, colDividerAfter));

  const footer = `TIME AGAINST OPPONENTS · ${teamCode} · 5V5 MINUTES · EDGES: TOTAL TOI · DATA: NHL`;
  parts.push(footerText(g, gridY + gridH + toiBand + footerHeight - 14, footer), `</g></svg>`);
  return parts.join('');
}

export interface LinesChartInput {
  players: ChartPlayer[]; // rows and columns alike: forwards in line groups, then defense in pairs
  dividerAfter: number; // number of forwards
  blocks: number[]; // consecutive group sizes along the diagonal (lines, then pairs); sums to players.length
  together: (a: number, b: number) => number; // 5v5 seconds on the ice together
  toi: (id: number) => number; // own 5v5 seconds (diagonal)
  teamCode: string;
}

/**
 * Teammate × teammate matrix of 5v5 minutes together. Lines and pairs form outlined blocks on
 * the diagonal; the diagonal itself is the player's own 5v5 TOI (outlined, off the colour scale).
 */
export function buildLinesSvg(input: LinesChartInput): string {
  const { players, dividerAfter, blocks, together, toi, teamCode } = input;
  const { pad, cellW, cellH, gap, footerHeight } = LAYOUT;
  const n = players.length;
  const g = gridGeometry(n, n, dividerAfter, dividerAfter);
  const { gridX, gridY, gridW, gridH, colX, rowY } = g;
  const width = gridX + gridW + pad + 40; // room for the last angled label
  const height = gridY + gridH + footerHeight + pad;

  const minutes = players.map(a => players.map(b => (a.id === b.id ? toi(a.id) : together(a.id, b.id)) / 60));
  const offDiagonal = minutes.flatMap((row, i) => row.filter((_, j) => i !== j));
  const max = Math.max(0, ...offDiagonal);

  const parts = svgOpen(width, height);
  players.forEach((p, j) => parts.push(colLabel(g, j, p.label)));

  players.forEach((p, i) => {
    const y = rowY(i);
    parts.push(rowLabel(g, i, p.label));
    players.forEach((_, j) => {
      const x = colX(j);
      const value = minutes[i][j];
      if (i === j) {
        parts.push(
          `<rect x="${x + 0.75}" y="${y + 0.75}" width="${cellW - 1.5}" height="${cellH - 1.5}" rx="5" fill="${COLORS.background}" stroke="${COLORS.diagonal}" stroke-width="1.5"/>`,
          `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.diagonalText}">${value.toFixed(1)}</text>`
        );
      } else if (Math.round(value * 10) === 0) {
        parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${COLORS.empty}"/>`); // never together: dimmed, no number
      } else {
        parts.push(...valueCell(x, y, cellColor(value, 0, max), value));
      }
    });
  });

  parts.push(...dividers(g, dividerAfter, dividerAfter));

  // Outline each line / pair block on the diagonal
  const inset = gap / 2;
  let start = 0;
  for (const size of blocks) {
    const last = start + size - 1;
    const x = colX(start) - inset;
    const y = rowY(start) - inset;
    const w = colX(last) + cellW + inset - x;
    const h = rowY(last) + cellH + inset - y;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${COLORS.block}" stroke-width="2"/>`);
    start += size;
  }

  const footer = `LINE PAIRINGS · ${teamCode} · 5V5 MINUTES TOGETHER · DIAGONAL: 5V5 TOI · DATA: NHL`;
  parts.push(footerText(g, gridY + gridH + footerHeight - 14, footer), `</g></svg>`);
  return parts.join('');
}

export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'IBM Plex Sans' },
    fitTo: { mode: 'zoom', value: 2 },
  });
  return Buffer.from(resvg.render().asPng());
}
