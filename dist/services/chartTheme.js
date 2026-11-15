"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME = exports.MAMMOTH = void 0;
exports.hexToRgb = hexToRgb;
exports.mix = mix;
exports.textOn = textOn;
// Shared look for the bot's rendered charts (TOI chart, Deserve To Win O'Meter), in the
// Utah Mammoth palette. Official colors, from the NHL's Utah logo SVG:
//   Rock Black #010101 · Mountain Blue #6CACE4 · Salt White #FFFFFF
exports.MAMMOTH = {
    rockBlack: '#010101',
    mountainBlue: '#6cace4',
    saltWhite: '#ffffff',
};
exports.THEME = {
    background: '#0d0e10', // Rock Black, lifted a touch so it doesn't vanish in Discord's dark mode
    surface: '#1b1d21', // empty/neutral tiles and tracks
    text: exports.MAMMOTH.saltWhite,
    label: '#b4b9bf', // names, team labels
    muted: '#7c828a', // secondary numbers, footer
    divider: '#3a3e44',
    accent: exports.MAMMOTH.mountainBlue, // Utah
    accentDeep: '#16283a', // low end of the Utah blue scale
    opponent: '#4b5058', // the other team: a neutral grey, never competing with Utah blue
    textOnAccent: '#06121d', // readable text on bright Mountain Blue
};
function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Linear blend from a (t=0) to b (t=1), t clamped. */
function mix(a, b, t) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    const k = Math.min(1, Math.max(0, t));
    return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * k).toString(16).padStart(2, '0')).join('');
}
/** Dark text on light fills, white on dark (WCAG relative luminance). */
function textOn(fill) {
    const [r, g, b] = hexToRgb(fill).map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.22 ? exports.THEME.textOnAccent : exports.THEME.text;
}
//# sourceMappingURL=chartTheme.js.map