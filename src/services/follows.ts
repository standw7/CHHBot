import { Client } from 'discord.js';
import pino from 'pino';
import * as nhlClient from '../nhl/client.js';
import { getFollowersOf, claimFollowDm, getMemberFollowers } from '../db/queries.js';
import type { LandingGoal } from '../nhl/types.js';

const logger = pino({ name: 'follows' });

export const MAX_FOLLOWS = 5;

export interface FollowablePlayer {
  id: number;
  firstName: string;
  lastName: string;
  sweaterNumber?: number;
}

export type MatchResult =
  | { kind: 'match'; player: FollowablePlayer }
  | { kind: 'ambiguous'; players: FollowablePlayer[] }
  | { kind: 'none' };

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function pick(players: FollowablePlayer[]): MatchResult | null {
  if (players.length === 1) return { kind: 'match', player: players[0] };
  if (players.length > 1) return { kind: 'ambiguous', players };
  return null;
}

/**
 * Match a query against players by jersey number (`9` / `#9`), exact full or last
 * name, then partial name. Case- and accent-insensitive; exact beats partial.
 */
export function matchRosterPlayer(query: string, players: FollowablePlayer[]): MatchResult {
  const q = normalize(query);
  if (!q) return { kind: 'none' };

  const number = q.match(/^#?(\d+)$/);
  if (number) {
    return pick(players.filter(p => p.sweaterNumber === Number(number[1]))) ?? { kind: 'none' };
  }

  const full = (p: FollowablePlayer) => normalize(`${p.firstName} ${p.lastName}`);
  const last = (p: FollowablePlayer) => normalize(p.lastName);

  return (
    pick(players.filter(p => full(p) === q || last(p) === q)) ??
    pick(players.filter(p => full(p).includes(q) || last(p).startsWith(q))) ?? { kind: 'none' }
  );
}

/** Current roster of `teamCode` as followable players, or null if unavailable. */
export async function loadFollowablePlayers(teamCode: string): Promise<FollowablePlayer[] | null> {
  const roster = await nhlClient.getRoster(teamCode);
  if (!roster) return null;
  return [...roster.forwards, ...roster.defensemen, ...roster.goalies].map(p => ({
    id: p.id,
    firstName: p.firstName.default,
    lastName: p.lastName.default,
    sweaterNumber: p.sweaterNumber,
  }));
}

const ORDINALS = ['1st', '2nd', '3rd'];

function periodLabel(number: number, periodType: string): string {
  if (periodType === 'OT') return number > 4 ? `${number - 3}OT` : 'OT';
  return ORDINALS[number - 1] ?? `${number}th`;
}

export interface FollowDmInput {
  goal: LandingGoal;
  followed: Set<number>; // player ids this user follows
  teamCode: string;
  homeAbbrev: string;
  awayAbbrev: string;
  periodNumber: number;
  periodType: string;
  cardUrl?: string;
}

/** DM text for one user and one goal, or null if they follow nobody on it (or it's a shootout goal). */
export function buildFollowDm(input: FollowDmInput): string | null {
  const { goal, followed, teamCode, homeAbbrev, awayAbbrev } = input;
  if (input.periodType === 'SO') return null;

  const lines: string[] = [];
  const scorer = goal.lastName.default;
  if (followed.has(goal.playerId)) lines.push(`🚨 **${scorer}** scored!`);
  for (const a of goal.assists) {
    if (followed.has(a.playerId)) lines.push(`🍎 **${a.lastName.default}** assisted on ${scorer}'s goal`);
  }
  if (lines.length === 0) return null;

  const ourHome = homeAbbrev === teamCode;
  const us = ourHome ? goal.homeScore : goal.awayScore;
  const them = ourHome ? goal.awayScore : goal.homeScore;
  const opponent = ourHome ? awayAbbrev : homeAbbrev;
  const time = goal.timeInPeriod.replace(/^0(\d:)/, '$1');
  let context = `${teamCode} ${us}-${them} ${opponent} · ${periodLabel(input.periodNumber, input.periodType)} ${time}`;
  if (input.cardUrl) context += ` · [Goal card](${input.cardUrl})`;
  lines.push(context);
  return lines.join('\n');
}

/**
 * DM every follower of the scorer/assisters on this goal. Each user+goal is claimed
 * in the DB first, so the second guild's tracker posting the same goal doesn't re-send.
 * Users with DMs closed are logged and skipped.
 */
export async function sendFollowDms(
  client: Client,
  gameId: number,
  input: Omit<FollowDmInput, 'followed'>
): Promise<void> {
  const involved = [input.goal.playerId, ...input.goal.assists.map(a => a.playerId)];
  const followers = getFollowersOf(involved);

  for (const [userId, followed] of followers) {
    const text = buildFollowDm({ ...input, followed });
    if (!text) continue;
    if (!claimFollowDm(userId, gameId, input.goal.eventId)) continue;
    try {
      const user = await client.users.fetch(userId);
      await user.send(text);
      logger.info({ userId, gameId, eventId: input.goal.eventId }, 'Follow DM sent');
    } catch (error) {
      logger.warn({ error, userId, gameId }, 'Could not DM follower (DMs closed?)');
    }
  }
}

/** e.g. "⭐ **Keller** was named first star! UTA @ VGK · 2G 1A · [Three stars](url)". */
export function buildFirstStarDm(lastName: string, stats: string, awayAbbrev: string, homeAbbrev: string, cardUrl?: string): string {
  let text = `⭐ **${lastName}** was named first star! ${awayAbbrev} @ ${homeAbbrev}`;
  if (stats) text += ` · ${stats}`;
  if (cardUrl) text += ` · [Three stars](${cardUrl})`;
  return text;
}

// follow_dms_sent key for a game's first-star DM (goal DMs use the goal's positive eventId)
const FIRST_STAR_EVENT_ID = -1;

/** DM followers of the game's first star. Deduped per user+game across guild trackers. */
export async function sendFirstStarDms(
  client: Client,
  gameId: number,
  playerId: number,
  lastName: string,
  stats: string,
  awayAbbrev: string,
  homeAbbrev: string,
  cardUrl?: string
): Promise<void> {
  const followers = getFollowersOf([playerId]);
  const text = buildFirstStarDm(lastName, stats, awayAbbrev, homeAbbrev, cardUrl);
  for (const userId of followers.keys()) {
    if (!claimFollowDm(userId, gameId, FIRST_STAR_EVENT_ID)) continue;
    try {
      const user = await client.users.fetch(userId);
      await user.send(text);
      logger.info({ userId, gameId }, 'First star DM sent');
    } catch (error) {
      logger.warn({ error, userId, gameId }, 'Could not DM follower (DMs closed?)');
    }
  }
}

// --- Member follows (Hall of Fame DMs) ---

export type MemberFollowCheck = 'ok' | 'self' | 'bot' | 'opted_out' | 'already' | 'limit';

export function checkMemberFollow(input: {
  followerId: string;
  targetId: string;
  targetIsBot: boolean;
  targetOptedOut: boolean;
  alreadyFollowing: boolean;
  currentCount: number;
}): MemberFollowCheck {
  if (input.followerId === input.targetId) return 'self';
  if (input.targetIsBot) return 'bot';
  if (input.targetOptedOut) return 'opted_out';
  if (input.alreadyFollowing) return 'already';
  if (input.currentCount >= MAX_FOLLOWS) return 'limit';
  return 'ok';
}

export function buildHofFollowDm(memberName: string, guildName: string, hofUrl: string): string {
  return `🏆 **${memberName}**'s post made the Hall of Fame in ${guildName}! [See it](${hofUrl})`;
}

/** DM everyone in this guild who follows the author of a newly inducted HoF post. */
export async function sendHofFollowDms(
  client: Client,
  guildId: string,
  guildName: string,
  authorId: string,
  authorName: string,
  hofUrl: string
): Promise<void> {
  const text = buildHofFollowDm(authorName, guildName, hofUrl);
  for (const userId of getMemberFollowers(guildId, authorId)) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(text);
      logger.info({ userId, guildId, authorId }, 'HoF follow DM sent');
    } catch (error) {
      logger.warn({ error, userId, guildId }, 'Could not DM follower (DMs closed?)');
    }
  }
}
