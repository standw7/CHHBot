import type { Guild } from 'discord.js';
import { DateTime } from 'luxon';
import pino from 'pino';

const logger = pino({ name: 'ask-podcast' });

// Clean Hits Hockey facts used by presets, data intents and LLM tools.
// Keep in sync with assets/ask/knowledge.md (what the LLM reads).
export const CLEAN_HITS = {
  name: 'Clean Hits Hockey',
  youtube: 'https://www.youtube.com/@CleanHitsHockey',
  substack: 'https://cleanhits.substack.com/',
  youtubeFeed: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1b1UeuxqeFbsqtyY8bJg3A',
  substackFeed: 'https://cleanhits.substack.com/feed',
  crewRoleName: 'Clean Hits Crew',
};

export interface FeedItem {
  title: string;
  url: string;
  published: string; // ISO timestamp ('' if missing)
}

function decodeXml(s: string): string {
  return s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]) : null;
}

function newestFirst(items: FeedItem[]): FeedItem[] {
  return items.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
}

/** YouTube channel Atom feed → entries (newest first). */
export function parseYouTubeFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const [, block] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const title = tag(block, 'title');
    const href = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1]
      ?? block.match(/<link[^>]*href="([^"]+)"/)?.[1];
    if (!title || !href) continue;
    const published = tag(block, 'published') ?? '';
    items.push({ title, url: decodeXml(href), published: Date.parse(published) ? new Date(published).toISOString() : '' });
  }
  return newestFirst(items);
}

/** RSS 2.0 feed (Substack) → items (newest first). */
export function parseRssFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = tag(block, 'title');
    const url = tag(block, 'link');
    if (!title || !url) continue;
    const pub = tag(block, 'pubDate') ?? '';
    items.push({ title, url, published: Date.parse(pub) ? new Date(pub).toISOString() : '' });
  }
  return newestFirst(items);
}

const FEED_CACHE_MS = 15 * 60 * 1000;
const FEED_TIMEOUT_MS = 5000;
const feedCache = new Map<string, { items: FeedItem[]; expiresAt: number }>();

async function fetchFeed(url: string, parse: (xml: string) => FeedItem[]): Promise<FeedItem[] | null> {
  const cached = feedCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'Feed fetch failed');
      return cached?.items ?? null;
    }
    const items = parse(await res.text());
    feedCache.set(url, { items, expiresAt: Date.now() + FEED_CACHE_MS });
    return items;
  } catch (err) {
    logger.warn({ url, err }, 'Feed fetch error');
    return cached?.items ?? null; // stale beats nothing
  }
}

/** Newest Clean Hits YouTube video, or null if YouTube can't be reached. */
export async function latestEpisode(): Promise<FeedItem | null> {
  const items = await fetchFeed(CLEAN_HITS.youtubeFeed, parseYouTubeFeed);
  return items?.[0] ?? null;
}

/** Newest Clean Hits Substack post, or null if unreachable. */
export async function latestSubstackPost(): Promise<FeedItem | null> {
  const items = await fetchFeed(CLEAN_HITS.substackFeed, parseRssFeed);
  return items?.[0] ?? null;
}

export function formatFeedDate(iso: string, zone = 'America/Denver'): string {
  const dt = DateTime.fromISO(iso, { zone });
  return dt.isValid ? dt.toFormat('LLL d, yyyy') : 'date unknown';
}

/** Title + date, with the URL on its own line so Discord embeds the video. */
export function formatEpisodeReply(item: FeedItem): string {
  return `Newest Clean Hits episode: "${item.title}" (${formatFeedDate(item.published)}).\n${item.url}`;
}

export function formatSubstackReply(item: FeedItem): string {
  return `Latest Clean Hits Substack post: "${item.title}" (${formatFeedDate(item.published)}).\n${item.url}`;
}

export const YOUTUBE_UNREACHABLE = `Couldn't reach YouTube. It's at ${CLEAN_HITS.youtube}`;
export const SUBSTACK_UNREACHABLE = `Couldn't reach Substack. It's at ${CLEAN_HITS.substack}`;

/**
 * The hosts are whoever holds the "Clean Hits Crew" role. Rendered as a role mention
 * (shows as a pill; doesn't ping because replies send allowedMentions.parse = []).
 * No GuildMembers intent, so members are never enumerated.
 */
export function crewRoleText(guild: Guild | null | undefined): string {
  const role = guild?.roles.cache.find(r => r.name.toLowerCase() === CLEAN_HITS.crewRoleName.toLowerCase());
  return role ? `<@&${role.id}>` : 'the Clean Hits Crew';
}

/** Values for {placeholders} in preset responses and LLM answers. */
export function templateVars(guild: Guild | null | undefined): Record<string, string> {
  return {
    youtube: CLEAN_HITS.youtube,
    substack: CLEAN_HITS.substack,
    crew_role: crewRoleText(guild),
  };
}
