import type { ChartPlayer } from './toiChart.js';
export interface ToiChartInput {
    rows: ChartPlayer[];
    cols: ChartPlayer[];
    rowDividerAfter: number;
    colDividerAfter: number;
    seconds: (rowId: number, colId: number) => number;
    teamCode: string;
}
/** Continuous deep brown (min) → warm amber (max) scale. */
export declare function cellColor(value: number, min: number, max: number): string;
export declare function buildToiSvg(input: ToiChartInput): string;
export declare function renderPng(svg: string): Buffer;
//# sourceMappingURL=toiRender.d.ts.map