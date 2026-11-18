// Text normalization shared by preset matching and intent parsing (pure).

/**
 * Lowercase, drop mentions/custom emoji/@everyone, strip accents and apostrophes
 * ("what's" → "whats"), turn other punctuation into spaces, collapse whitespace.
 */
export function normalizeText(input: string): string {
  return input
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/<(?:@[!&]?|#)\d+>/g, ' ')
    .replace(/@(?:everyone|here)\b/gi, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(normalized: string): string[] {
  return normalized ? normalized.split(' ') : [];
}

/** Words that don't change what's being asked ("thanks so much tusky" ≈ "thanks"). */
export const FILLER_WORDS = new Set([
  'tusky', 'hey', 'yo', 'please', 'pls', 'plz', 'lol', 'lmao', 'haha', 'so', 'much', 'very',
  'really', 'man', 'bro', 'dude', 'buddy', 'again', 'a', 'lot', 'just', 'ok', 'okay', 'oh',
  'um', 'uh', 'rn',
]);

export function contentTokens(toks: string[]): string[] {
  return toks.filter(t => !FILLER_WORDS.has(t));
}

/** Drop a leading/trailing "tusky" when it's just the name being addressed ("thanks tusky" → "thanks"). */
export function stripVocative(normalized: string): string {
  const t = tokens(normalized);
  while (t.length > 1 && t[0] === 'tusky') t.shift();
  while (t.length > 1 && t[t.length - 1] === 'tusky') t.pop();
  return t.join(' ');
}

/** Cut to `max` chars on a word boundary, with an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}
