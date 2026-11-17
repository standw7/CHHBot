import type { ChartPlayer } from './toiChart.js';
export interface ToiChartInput {
    rows: ChartPlayer[];
    cols: ChartPlayer[];
    rowDividerAfter: number;
    colDividerAfter: number;
    seconds: (rowId: number, colId: number) => number;
    teamCode: string;
}
/** Continuous deep navy (min) → Mountain Blue (max) scale. */
export declare function cellColor(value: number, min: number, max: number): string;
export declare function buildToiSvg(input: ToiChartInput): string;
export interface LinesChartInput {
    players: ChartPlayer[];
    dividerAfter: number;
    blocks: number[];
    together: (a: number, b: number) => number;
    toi: (id: number) => number;
    teamCode: string;
}
/**
 * Teammate × teammate matrix of 5v5 minutes together. Lines and pairs form outlined blocks on
 * the diagonal; the diagonal itself is the player's own 5v5 TOI (outlined, off the colour scale).
 */
export declare function buildLinesSvg(input: LinesChartInput): string;
export declare function renderPng(svg: string): Buffer;
//# sourceMappingURL=toiRender.d.ts.map