import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import type { ChartPlayer } from './toiChart.js';

// Fonts ship in the repo so local renders and the VM match (repo root/assets/fonts,
// resolved from src/services or dist/services alike).
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_FILES = ['IBMPlexSans-Regular.ttf', 'IBMPlexSans-SemiBold.ttf'].map(f => path.join(FONT_DIR, f));

const COLORS = {
  background: '#1c1b1f',
  rowLabel: '#b9b4bd',
  colLabel: '#b9b4bd',
  value: '#f2e6dc',
  divider: '#55505c',
  footer: '#8c8794',
  low: '#34251e',
  high: '#94562f',
};

const LAYOUT = {
  pad: 24,
  labelWidth: 150, // row-label column
  headerHeight: 118, // angled column labels
  cellW: 40,
  cellH: 34,
  gap: 6,
  footerHeight: 64,
  labelAngle: -55,
};

export interface ToiChartInput {
  rows: ChartPlayer[]; // Utah skaters, forwards then defense
  cols: ChartPlayer[]; // opponent skaters, forwards then defense
  rowDividerAfter: number; // number of forward rows
  colDividerAfter: number; // number of forward columns
  seconds: (rowId: number, colId: number) => number;
  teamCode: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Continuous deep brown (min) → warm amber (max) scale. */
export function cellColor(value: number, min: number, max: number): string {
  const t = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const lo = hexToRgb(COLORS.low);
  const hi = hexToRgb(COLORS.high);
  return '#' + lo.map((c, i) => Math.round(c + (hi[i] - c) * t).toString(16).padStart(2, '0')).join('');
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
  const gridW = cols.length * pitchX - gap;
  const gridH = rows.length * pitchY - gap;
  const width = gridX + gridW + pad + 40; // room for the last angled label
  const height = gridY + gridH + footerHeight + pad;

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
    const x = gridX + j * pitchX + cellW / 2 - 4;
    const y = gridY - 10;
    parts.push(
      `<text x="${x}" y="${y}" transform="rotate(${labelAngle} ${x} ${y})" font-size="15" font-weight="500" fill="${COLORS.colLabel}">${esc(c.label)}</text>`
    );
  });

  rows.forEach((r, i) => {
    const y = gridY + i * pitchY;
    parts.push(
      `<text x="${gridX - 14}" y="${y + cellH / 2 + 5.5}" text-anchor="end" font-size="16" font-weight="500" fill="${COLORS.rowLabel}">${esc(r.label)}</text>`
    );
    cols.forEach((c, j) => {
      const x = gridX + j * pitchX;
      const value = minutes[i][j];
      parts.push(
        `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${cellColor(value, min, max)}"/>`,
        `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.value}">${value.toFixed(1)}</text>`
      );
    });
  });

  // Forwards / defense dividers, centred in the gap
  if (colDividerAfter > 0 && colDividerAfter < cols.length) {
    const x = gridX + colDividerAfter * pitchX - gap / 2;
    parts.push(`<line x1="${x}" y1="${gridY - 4}" x2="${x}" y2="${gridY + gridH + 4}" stroke="${COLORS.divider}" stroke-width="1.5"/>`);
  }
  if (rowDividerAfter > 0 && rowDividerAfter < rows.length) {
    const y = gridY + rowDividerAfter * pitchY - gap / 2;
    parts.push(`<line x1="${gridX - 4}" y1="${y}" x2="${gridX + gridW + 4}" y2="${y}" stroke="${COLORS.divider}" stroke-width="1.5"/>`);
  }

  const footer = `TIME AGAINST OPPONENTS · ${teamCode} · 5V5 MINUTES · DATA: NHL`;
  parts.push(
    `<text x="${gridX + gridW / 2}" y="${gridY + gridH + footerHeight - 14}" text-anchor="middle" font-size="16" font-weight="600" letter-spacing="2.5" fill="${COLORS.footer}">${esc(footer)}</text>`,
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
