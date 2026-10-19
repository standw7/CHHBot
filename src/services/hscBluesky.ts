import { Client, EmbedBuilder } from 'discord.js';
import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { getDb } from '../db/database.js';
import { getGuildConfig, hasAnyHscPostSeen, markHscPostSeen } from '../db/queries.js';
import { postToChannels } from './toiPost.js';

const logger = pino({ name: 'hsc-bluesky' });

const FEED_URL = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=hockeystatcards.com&limit=';
const POLL_LIMIT = 30; // every 5 min
const LOOKBACK_LIMIT = 100; // !hsc last: a busy night has ~16 cards
const POLL_INTERVAL_MS = 5 * 60_000;

export interface ImpactCardPost {
  uri: string;
  rkey: string;
  text: string;
  imageUrl: string;
  createdAt: string;
}

interface FeedItem {
  reason?: unknown;
  post?: {
    uri?: string;
    record?: { text?: string; createdAt?: string; reply?: unknown };
    embed?: { $type?: string; images?: { fullsize?: string }[] };
  };
}

export function isTeamImpactCard(text: string, teamName: string): boolean {
  return text.includes(`Game Score Impact Card for ${teamName}`);
}

/** HSC's own (not reposted, not reply) image posts of the team's Game Score Impact Card, feed order. */
export function parseImpactCards(feed: unknown, teamName: string): ImpactCardPost[] {
  const items = (feed as { feed?: FeedItem[] } | null)?.feed;
  if (!Array.isArray(items)) return [];
  const cards: ImpactCardPost[] = [];
  for (const it of items) {
    const post = it.post;
    const text = post?.record?.text ?? '';
    const imageUrl = post?.embed?.$type === 'app.bsky.embed.images#view' ? post.embed.images?.[0]?.fullsize : undefined;
    if (it.reason || post?.record?.reply || !post?.uri || !imageUrl || !isTeamImpactCard(text, teamName)) continue;
    cards.push({ uri: post.uri, rkey: post.uri.split('/').pop() ?? '', text, imageUrl, createdAt: post.record?.createdAt ?? '' });
  }
  return cards;
}

export function buildImpactCardEmbed(post: ImpactCardPost): EmbedBuilder {
  const date = post.text.match(/on (\d{4}-\d{2}-\d{2})/)?.[1];
  return new EmbedBuilder()
    .setTitle(`📊 Game Score Impact Card${date ? ` · ${date}` : ''}`)
    .setDescription(`[via HockeyStatCards](https://bsky.app/profile/hockeystatcards.com/post/${post.rkey})`)
    .setImage(post.imageUrl)
    .setColor(0x006847);
}

async function fetchFeed(limit: number): Promise<unknown | null> {
  try {
    const res = await fetch(FEED_URL + limit, { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
    return res.ok ? await res.json() : null;
  } catch (error) {
    logger.warn({ error }, 'Bluesky feed fetch failed');
    return null;
  }
}

async function teamFullName(teamCode: string): Promise<string | null> {
  const standings = await nhlClient.getStandings();
  return standings?.standings.find(s => s.teamAbbrev.default === teamCode)?.teamName.default ?? null;
}

export async function latestImpactCard(teamName: string): Promise<ImpactCardPost | null> {
  const feed = await fetchFeed(LOOKBACK_LIMIT);
  return feed ? parseImpactCards(feed, teamName)[0] ?? null : null;
}

async function poll(client: Client): Promise<void> {
  const feed = await fetchFeed(POLL_LIMIT);
  if (!feed) return;

  // First run: remember what's already there so old cards aren't backfilled
  if (!hasAnyHscPostSeen()) {
    const items = (feed as { feed?: FeedItem[] }).feed ?? [];
    for (const it of items) if (it.post?.uri) markHscPostSeen(it.post.uri);
    logger.info({ count: items.length }, 'Seeded HSC Bluesky posts');
    return;
  }

  const enabled = (getDb().prepare('SELECT guild_id FROM guild_config WHERE hsc_charts_enabled = 1').all() as { guild_id: string }[])
    .map(r => r.guild_id)
    .filter(id => client.guilds.cache.has(id));
  const byTeam = new Map<string, string[]>();
  for (const guildId of enabled) {
    const team = getGuildConfig(guildId)?.primary_team ?? 'UTA';
    byTeam.set(team, [...(byTeam.get(team) ?? []), guildId]);
  }

  for (const [team, guildIds] of byTeam) {
    const teamName = await teamFullName(team);
    if (!teamName) continue; // standings unavailable: retry next poll
    for (const card of parseImpactCards(feed, teamName).reverse()) {
      if (!markHscPostSeen(card.uri)) continue;
      for (const guildId of guildIds) await postToChannels(client, guildId, { embeds: [buildImpactCardEmbed(card)] });
      logger.info({ team, uri: card.uri }, 'Impact card posted');
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startHscWatcher(client: Client): void {
  if (timer) return;
  const run = () => poll(client).catch(error => logger.error({ error }, 'HSC watcher error'));
  run();
  timer = setInterval(run, POLL_INTERVAL_MS);
}

export function stopHscWatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
