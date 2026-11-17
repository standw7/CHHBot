import pino from 'pino';

const logger = pino({ name: 'social-caption' });

// vxinstagram serves its embed as a twitter:card=player video, and Discord hides the
// description of player cards — so the caption never shows up. We fetch it ourselves
// (posing as Discord's unfurler so vxinstagram returns the OG tags) and post it as text.

const DISCORD_UA = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const FETCH_TIMEOUT_MS = 5000;
export const CAPTION_MAX = 300;

export interface SocialCaption {
  title: string | null;   // e.g. "Name (@handle)"
  caption: string | null; // post caption text
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/** Decode the HTML entities that show up in OG meta content (numeric + a few named). */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/** Read one `<meta property|name="key" content="...">` tag (attribute order agnostic). */
function readMeta(html: string, key: string): string | null {
  const tagRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    const keyMatch = /\b(?:property|name)\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const tagKey = keyMatch ? (keyMatch[2] ?? keyMatch[3]) : null;
    if (tagKey?.toLowerCase() !== key) continue;
    const contentMatch = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if (!contentMatch) continue;
    return decodeHtmlEntities(contentMatch[2] ?? contentMatch[3] ?? '');
  }
  return null;
}

/** Pull og:title / og:description out of an HTML page. Null when neither has text. */
export function parseSocialCaption(html: string): SocialCaption | null {
  const title = readMeta(html, 'og:title')?.trim() || null;
  const caption = readMeta(html, 'og:description')?.trim() || null;
  if (!title && !caption) return null;
  return { title, caption };
}

/** Truncate on a code-point boundary so emoji aren't split in half. */
function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, max).join('').trimEnd() + '…';
}

/**
 * Format as Discord markdown to sit under the link:
 *   -# Name (@handle)
 *   > caption line 1
 *   > caption line 2
 * Returns null if there's nothing worth posting.
 */
export function formatSocialCaption(c: SocialCaption, max = CAPTION_MAX): string | null {
  const lines: string[] = [];
  if (c.title) lines.push(`-# ${c.title.replace(/\s+/g, ' ')}`);
  if (c.caption) {
    const body = truncate(c.caption.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n'), max);
    for (const line of body.split('\n')) lines.push(line ? `> ${line}` : '>');
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

/** True for a (rewritten) Instagram post/reel link we should fetch a caption for. */
export function isInstagramLink(url: string): boolean {
  return /^https?:\/\/(www\.)?(vxinstagram\.com|instagram\.com|ddinstagram\.com)\/(p|reel|reels)\//i.test(url);
}

/**
 * Fetch the formatted caption block for an Instagram link via vxinstagram.
 * Never throws; returns null on any failure (timeout, non-200, no OG tags).
 */
export async function fetchInstagramCaption(url: string): Promise<string | null> {
  try {
    const target = url.replace(/^https?:\/\/(www\.)?(instagram\.com|ddinstagram\.com)\//i, 'https://vxinstagram.com/');
    const res = await fetch(target, {
      headers: { 'User-Agent': DISCORD_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = parseSocialCaption(html);
    return parsed ? formatSocialCaption(parsed) : null;
  } catch (error) {
    logger.debug({ url, error: String(error) }, 'Instagram caption fetch failed');
    return null;
  }
}
