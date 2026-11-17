"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cellColor = cellColor;
exports.buildToiSvg = buildToiSvg;
exports.buildLinesSvg = buildLinesSvg;
exports.renderPng = renderPng;
const path_1 = __importDefault(require("path"));
const resvg_js_1 = require("@resvg/resvg-js");
const chartTheme_js_1 = require("./chartTheme.js");
// Fonts ship in the repo so local renders and the VM match (repo root/assets/fonts,
// resolved from src/services or dist/services alike).
const FONT_DIR = path_1.default.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_FILES = ['IBMPlexSans-Regular.ttf', 'IBMPlexSans-SemiBold.ttf'].map(f => path_1.default.join(FONT_DIR, f));
const COLORS = {
    background: chartTheme_js_1.THEME.background,
    rowLabel: chartTheme_js_1.THEME.label,
    colLabel: chartTheme_js_1.THEME.label,
    divider: chartTheme_js_1.THEME.divider,
    toi: chartTheme_js_1.THEME.muted, // total TOI next to names
    footer: chartTheme_js_1.THEME.muted,
    low: chartTheme_js_1.THEME.accentDeep,
    high: chartTheme_js_1.THEME.accent, // Mountain Blue
    empty: chartTheme_js_1.THEME.surface, // lines chart: teammates never on together
    diagonal: chartTheme_js_1.THEME.divider, // lines chart: own-TOI cells
    diagonalText: chartTheme_js_1.THEME.muted,
    block: chartTheme_js_1.THEME.label, // lines chart: line / pair outlines
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
/** Continuous deep navy (min) → Mountain Blue (max) scale. */
function cellColor(value, min, max) {
    const t = max > min ? (value - min) / (max - min) : 0;
    return (0, chartTheme_js_1.mix)(COLORS.low, COLORS.high, t);
}
function esc(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}
/** Cell grid below the angled column labels and right of the row labels, with a forwards/defense gap. */
function gridGeometry(nRows, nCols, rowDividerAfter, colDividerAfter) {
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
        colX: (j) => gridX + j * pitchX + (splitCols && j >= colDividerAfter ? groupGap : 0),
        rowY: (i) => gridY + i * pitchY + (splitRows && i >= rowDividerAfter ? groupGap : 0),
        splitRows,
        splitCols,
    };
}
function svgOpen(width, height) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
        `<g font-family="IBM Plex Sans">`,
    ];
}
function colLabel(g, j, label) {
    const x = g.colX(j) + LAYOUT.cellW / 2 - 4;
    const y = g.gridY - 10;
    return `<text x="${x}" y="${y}" transform="rotate(${LAYOUT.labelAngle} ${x} ${y})" font-size="15" font-weight="500" fill="${COLORS.colLabel}">${esc(label)}</text>`;
}
function rowLabel(g, i, label) {
    return `<text x="${g.gridX - 14}" y="${g.rowY(i) + LAYOUT.cellH / 2 + 5.5}" text-anchor="end" font-size="16" font-weight="500" fill="${COLORS.rowLabel}">${esc(label)}</text>`;
}
/** A coloured tile with its value in minutes (one decimal). */
function valueCell(x, y, fill, minutes) {
    const { cellW, cellH } = LAYOUT;
    return [
        `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${fill}"/>`,
        `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${(0, chartTheme_js_1.textOn)(fill)}">${minutes.toFixed(1)}</text>`,
    ];
}
/** Forwards / defense dividers, centred in the gap. */
function dividers(g, rowDividerAfter, colDividerAfter) {
    const offset = (LAYOUT.gap + LAYOUT.groupGap) / 2;
    const out = [];
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
function footerText(g, y, text) {
    return `<text x="${g.gridX + g.gridW / 2}" y="${y}" text-anchor="middle" font-size="16" font-weight="600" letter-spacing="2.5" fill="${COLORS.footer}">${esc(text)}</text>`;
}
function buildToiSvg(input) {
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
        parts.push(colLabel(g, j, c.label), c.toi ? `<text x="${colX(j) + cellW / 2}" y="${gridY + gridH + 24}" text-anchor="middle" font-size="13" fill="${COLORS.toi}">${esc(c.toi)}</text>` : '');
    });
    rows.forEach((r, i) => {
        const y = rowY(i);
        parts.push(rowLabel(g, i, r.label), r.toi ? `<text x="${gridX + gridW + 14}" y="${y + cellH / 2 + 5}" text-anchor="start" font-size="14" fill="${COLORS.toi}">${esc(r.toi)}</text>` : '');
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
/**
 * Teammate × teammate matrix of 5v5 minutes together. Lines and pairs form outlined blocks on
 * the diagonal; the diagonal itself is the player's own 5v5 TOI (outlined, off the colour scale).
 */
function buildLinesSvg(input) {
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
                parts.push(`<rect x="${x + 0.75}" y="${y + 0.75}" width="${cellW - 1.5}" height="${cellH - 1.5}" rx="5" fill="${COLORS.background}" stroke="${COLORS.diagonal}" stroke-width="1.5"/>`, `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4.5}" text-anchor="middle" font-size="13" font-weight="600" fill="${COLORS.diagonalText}">${value.toFixed(1)}</text>`);
            }
            else if (Math.round(value * 10) === 0) {
                parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="5" fill="${COLORS.empty}"/>`); // never together: dimmed, no number
            }
            else {
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
function renderPng(svg) {
    const resvg = new resvg_js_1.Resvg(svg, {
        font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'IBM Plex Sans' },
        fitTo: { mode: 'zoom', value: 2 },
    });
    return Buffer.from(resvg.render().asPng());
}
//# sourceMappingURL=toiRender.js.map