export declare const MAMMOTH: {
    rockBlack: string;
    mountainBlue: string;
    saltWhite: string;
};
export declare const THEME: {
    background: string;
    surface: string;
    text: string;
    label: string;
    muted: string;
    divider: string;
    accent: string;
    accentDeep: string;
    opponent: string;
    textOnAccent: string;
};
export declare function hexToRgb(hex: string): [number, number, number];
/** Linear blend from a (t=0) to b (t=1), t clamped. */
export declare function mix(a: string, b: string, t: number): string;
/** Dark text on light fills, white on dark (WCAG relative luminance). */
export declare function textOn(fill: string): string;
//# sourceMappingURL=chartTheme.d.ts.map