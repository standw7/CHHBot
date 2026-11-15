import { Client, TextChannel } from 'discord.js';
import pino from 'pino';
import { claimXgShot, getGifEntries } from '../db/queries.js';
import { buildMediaMessage } from './media.js';
import { gameDataUrl } from './deserveToWin.js';
import { getMoneyPuckSkaters } from './moneyPuck.js';
import {
  XG_VICTIM, MAX_SHOT_AGE_SECONDS, parseVictimShots, postChance, pickQuip, buildXgCard,
  goalsOwed, debtPaymentLabel, type SeasonTotals, type VictimShot,
} from './xgVictim.js';
import type { Milestone } from './milestones.js';
import type { PlayByPlayResponse } from '../nhl/types.js';

const logger = pino({ name: 'xg-victim' });

export interface XgGame {
  guildId: string;
  gameId: number;
  gameType: number; // 2 regular, 3 playoffs
  season: number; // e.g. 20262027
  teamCode: string; // the guild's primary team
  channelId: string;
}

export function appliesTo(game: Pick<XgGame, 'gameType' | 'teamCode'>): boolean {
  return game.teamCode === XG_VICTIM.team && (game.gameType === 2 || game.gameType === 3);
}

async function fetchGameCsv(gameId: number): Promise<string | null> {
  try {
    const res = await fetch(gameDataUrl(gameId), { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
    return res.ok ? await res.text() : null;
  } catch (err) {
    logger.warn({ err, gameId }, 'MoneyPuck game data fetch failed');
    return null;
  }
}

/** Latest elapsed game time in MoneyPuck's data — "now" as far as its (lagging) feed knows. */
function latestGameSeconds(csv: string): number {
  const lines = csv.split('\n');
  const timeCol = lines[0]?.split(',').indexOf('time') ?? -1;
  let latest = 0;
  for (const line of lines.slice(1)) {
    const t = Number(line.split(',')[timeCol]);
    if (t > latest) latest = t;
  }
  return latest;
}

// Regular-season totals before tonight. Only for regular-season games: the debt is a regular-season stat.
async function seasonBefore(game: Pick<XgGame, 'gameType' | 'season'>): Promise<SeasonTotals | undefined> {
  if (game.gameType !== 2) return undefined;
  const skaters = await getMoneyPuckSkaters(XG_VICTIM.team, Math.floor(game.season / 10000));
  const me = skaters?.find(s => Number(s.playerId) === XG_VICTIM.playerId);
  return me ? { xg: me.xGoals, goals: me.goals } : undefined;
}

/**
 * Checks MoneyPuck for the victim's new saved/missed shots. Each shot gets exactly one
 * roll (claimed in the DB), posting with probability postChance(xG): the card, then a
 * random meme from the victim's gif command.
 */
export async function checkVictimShots(client: Client, game: XgGame, pbp: PlayByPlayResponse, random: () => number = Math.random): Promise<void> {
  if (!appliesTo(game)) return;
  const csv = await fetchGameCsv(game.gameId);
  if (!csv) return;

  const shots = parseVictimShots(csv, XG_VICTIM.team, XG_VICTIM.lastName);
  const now = latestGameSeconds(csv);

  for (const [i, shot] of shots.entries()) {
    if (shot.event === 'GOAL') continue; // goals get the debt banner on the real goal card
    if (game.gameType === 2 && shot.gameSeconds >= 3900) continue; // shootout
    if (!claimXgShot(game.guildId, game.gameId, shot.id)) continue;

    const age = now - shot.gameSeconds;
    const chance = postChance(shot.xg);
    if (age > MAX_SHOT_AGE_SECONDS) {
      logger.info({ shotId: shot.id, age }, 'Old xG-victim shot, recorded without posting');
      continue;
    }
    if (random() >= chance) {
      logger.info({ shotId: shot.id, xg: shot.xg, chance }, 'xG-victim shot rolled: no post');
      continue;
    }

    await postCard(client, game, shot, shots.slice(0, i + 1), pbp);
  }
}

async function postCard(client: Client, game: XgGame, shot: VictimShot, tonight: VictimShot[], pbp: PlayByPlayResponse): Promise<void> {
  try {
    const channel = await client.channels.fetch(game.channelId);
    if (!channel || !channel.isTextBased()) return;

    const embed = buildXgCard({
      shot,
      tonight,
      season: await seasonBefore(game),
      gameType: game.gameType,
      quip: pickQuip(shot.xg),
      headshot: pbp.rosterSpots?.find(s => s.playerId === XG_VICTIM.playerId)?.headshot,
    });
    await (channel as TextChannel).send({ embeds: [embed] });

    const memes = getGifEntries(game.guildId, XG_VICTIM.memeKey);
    if (memes.length > 0) {
      await (channel as TextChannel).send(buildMediaMessage(memes[Math.floor(Math.random() * memes.length)]));
    }
    logger.info({ guildId: game.guildId, shotId: shot.id, xg: shot.xg }, 'xG-victim card posted');
  } catch (err) {
    logger.error({ err, shotId: shot.id }, 'Failed to post xG-victim card');
  }
}

/**
 * The banner for the victim's own goal card. goalsTonight counts this goal (from the NHL,
 * since MoneyPuck may not have it yet). Never throws: worst case is a banner without a number.
 */
export async function debtPaymentMilestone(game: Pick<XgGame, 'gameId' | 'gameType' | 'season'>, goalsTonight: number): Promise<Milestone> {
  let owed: number | undefined;
  try {
    const season = await seasonBefore(game);
    const csv = season ? await fetchGameCsv(game.gameId) : null;
    if (season && csv) {
      const tonightXg = parseVictimShots(csv, XG_VICTIM.team, XG_VICTIM.lastName).reduce((sum, s) => sum + s.xg, 0);
      owed = goalsOwed(season, tonightXg, goalsTonight);
    }
  } catch (err) {
    logger.warn({ err }, 'Could not work out the xG debt for the goal card');
  }
  return { kind: 'debt_payment', label: debtPaymentLabel(owed), celebrate: true };
}
