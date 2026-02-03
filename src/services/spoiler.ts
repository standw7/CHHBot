import type { GuildConfig } from '../db/models.js';

export type SpoilerMode = 'off' | 'wrap_scores' | 'minimal_embed';

export function wrapScore(text: string, mode: SpoilerMode): string {
  if (mode === 'off') return text;
  return `||${text}||`;
}

export function shouldIncludeScoresInEmbed(mode: SpoilerMode): boolean {
  return mode !== 'minimal_embed';
}

export function formatScoreLine(
  awayAbbrev: string,
  awayScore: number,
  homeAbbrev: string,
  homeScore: number,
  awaySog: number | undefined,
  homeSog: number | undefined,
  mode: SpoilerMode
): string | null {
  if (mode === 'off') return null;

  let line = `${awayAbbrev} ${awayScore} - ${homeAbbrev} ${homeScore}`;
  if (awaySog !== undefined && homeSog !== undefined) {
    line += ` (shots ${awaySog}-${homeSog})`;
  }
  return `||${line}||`;
}
