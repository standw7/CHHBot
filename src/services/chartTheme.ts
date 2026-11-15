// Shared look for the bot's rendered charts (TOI chart, Deserve To Win O'Meter), in the
// Utah Mammoth palette. Official colors, from the NHL's Utah logo SVG:
//   Rock Black #010101 · Mountain Blue #6CACE4 · Salt White #FFFFFF
export const MAMMOTH = {
  rockBlack: '#010101',
  mountainBlue: '#6cace4',
  saltWhite: '#ffffff',
};

export const THEME = {
  background: '#0d0e10', // Rock Black, lifted a touch so it doesn't vanish in Discord's dark mode
  surface: '#1b1d21', // empty/neutral tiles and tracks
  text: MAMMOTH.saltWhite,
  label: '#b4b9bf', // names, team labels
  muted: '#7c828a', // secondary numbers, footer
  divider: '#3a3e44',
  accent: MAMMOTH.mountainBlue, // Utah
  accentDeep: '#16283a', // low end of the Utah blue scale
  opponent: '#4b5058', // the other team: a neutral grey, never competing with Utah blue
  textOnAccent: '#06121d', // readable text on bright Mountain Blue
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend from a (t=0) to b (t=1), t clamped. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const k = Math.min(1, Math.max(0, t));
  return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * k).toString(16).padStart(2, '0')).join('');
}

/** Dark text on light fills, white on dark (WCAG relative luminance). */
export function textOn(fill: string): string {
  const [r, g, b] = hexToRgb(fill).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.22 ? THEME.textOnAccent : THEME.text;
}
