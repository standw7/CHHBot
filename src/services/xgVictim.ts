import { EmbedBuilder } from 'discord.js';

// The server's running joke: Barrett Hayton racks up expected goals and doesn't score.
// When he misses a real chance, the bot posts a parody goal card (plus a !haytin meme);
// when he does score, his goal card gets a debt-payment banner. To move the joke to
// someone else, change this one object.
export const XG_VICTIM = {
  playerId: 8480849,
  firstName: 'Barrett',
  lastName: 'Hayton',
  team: 'UTA',
  memeKey: 'haytin', // gif command whose entries get posted with the card
};

// Chance to post = xG / this, capped at 1: a 3% shot posts ~10% of the time,
// a 15% chance half the time, and anything 30%+ always.
export const ALWAYS_POST_XG = 0.30;

// Shots older than this (game seconds) when first seen are recorded but not posted,
// so starting up mid-game doesn't dump a backlog of cards.
export const MAX_SHOT_AGE_SECONDS = 180;

export interface VictimShot {
  id: string; // MoneyPuck's event id within the game
  gameSeconds: number;
  event: 'SHOT' | 'MISS' | 'GOAL';
  xg: number;
  sweaterNumber?: number;
  shotType?: string; // "Wrist", "Tip-In"
  missReason?: string; // "Wide Left", "Hit Crossbar"
}

/**
 * The victim's unblocked shots from MoneyPuck's live per-game CSV. MoneyPuck has no
 * shooter id column, so the shooter comes from the description, e.g.
 * "UTA ONGOAL - #27 HAYTON  Wrist   Off. Zone  25 ft." / "UTA #27 HAYTON  Snap  Wide Left  Off. Zone  28 ft."
 */
export function parseVictimShots(csv: string, team: string, lastName: string): VictimShot[] {
  const lines = csv.split('\n');
  const headers = lines[0]?.split(',') ?? [];
  const col = (name: string) => headers.indexOf(name);
  const c = { id: col('id'), time: col('time'), event: col('event'), desc: col('eventDescriptionRaw'), xg: col('shotGoalProbability') };
  if (Object.values(c).some(i => i < 0)) return [];

  const shooter = new RegExp(`^${team} (?:ONGOAL - )?#(\\d+) ${lastName.toUpperCase()}(?:\\(\\d+\\))?$`);
  const shots: VictimShot[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const event = f[c.event];
    if (event !== 'SHOT' && event !== 'MISS' && event !== 'GOAL') continue;
    const parts = (f[c.desc] ?? '').split('<br>')[0].split(/\s{2,}/).map(s => s.trim());
    const match = shooter.exec(parts[0] ?? '');
    if (!match) continue;
    shots.push({
      id: f[c.id],
      gameSeconds: Number(f[c.time]),
      event,
      xg: Number(f[c.xg]) || 0,
      sweaterNumber: Number(match[1]),
      shotType: parts[1] || undefined,
      missReason: event === 'MISS' ? parts[2] || undefined : undefined,
    });
  }
  return shots;
}

export function postChance(xg: number): number {
  return Math.min(1, Math.max(0, xg) / ALWAYS_POST_XG);
}

export interface SeasonTotals {
  xg: number;
  goals: number;
}

/** Goals owed: expected minus actual, season-to-date before tonight plus tonight. */
export function goalsOwed(season: SeasonTotals, tonightXg: number, tonightGoals: number): number {
  return season.xg + tonightXg - season.goals - tonightGoals;
}

/** "4.1 goals", "1 goal" */
function goalsText(n: number): string {
  const rounded = n.toFixed(1);
  return `${rounded} goal${rounded === '1.0' ? '' : 's'}`;
}

/** Banner for the victim's real goal card. owed is after this goal; undefined if unknown. */
export function debtPaymentLabel(owed: number | undefined): string {
  if (owed === undefined) return '💸 DEBT PAYMENT';
  if (owed <= 0) return `💸 DEBT PAYMENT — ${XG_VICTIM.lastName} is PAID IN FULL (${goalsText(-owed)} ahead of the model)`;
  return `💸 DEBT PAYMENT — ${XG_VICTIM.lastName} now owes ${goalsText(owed)}`;
}

// {pct} is the shot's goal chance, e.g. "31%"
export const QUIPS = [
  'This one was a {pct} chance to be a goal. It was not.',
  'Statistically, that was a goal.',
  'The model believed in you, Barrett.',
  'Analytics darling strikes again.',
  'A {pct} chance to be a goal, and the model is still waiting.',
  'Somewhere, a spreadsheet just counted that as a goal.',
  'Process: elite. Results: pending.',
  'The xG is real. The goal is theoretical.',
];

export function pickQuip(xg: number, random: () => number = Math.random): string {
  const quip = QUIPS[Math.floor(random() * QUIPS.length)];
  return quip.replace('{pct}', `${Math.round(xg * 100)}%`);
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

/** "4:12 left in the 2nd" / "1:30 left in OT", from MoneyPuck's elapsed game seconds. */
export function clockText(gameSeconds: number, gameType: number): string {
  const regulation = 3 * 1200;
  let period: string;
  let left: number;
  if (gameSeconds < regulation) {
    period = `the ${ordinal(Math.floor(gameSeconds / 1200) + 1)}`;
    left = 1200 - (gameSeconds % 1200);
  } else if (gameType === 3) {
    const ot = Math.floor((gameSeconds - regulation) / 1200) + 1;
    period = ot === 1 ? 'OT' : `OT${ot}`;
    left = 1200 - ((gameSeconds - regulation) % 1200);
  } else {
    period = 'OT';
    left = 300 - (gameSeconds - regulation);
  }
  left = Math.max(0, left);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left in ${period}`;
}

export interface XgCardInput {
  shot: VictimShot;
  tonight: VictimShot[]; // all of tonight's shots so far, including this one
  season?: SeasonTotals; // regular season before tonight; omitted outside the regular season
  gameType: number;
  quip: string;
  headshot?: string;
}

export function buildXgCard(input: XgCardInput): EmbedBuilder {
  const { shot, tonight, season, gameType, quip, headshot } = input;
  const name = `${XG_VICTIM.firstName} ${XG_VICTIM.lastName}`;
  const number = shot.sweaterNumber ? `#${shot.sweaterNumber} ` : '';
  const outcome = shot.event === 'MISS' ? (shot.missReason ?? 'missed').toLowerCase() : 'saved';
  const shotType = shot.shotType ? ` ${shot.shotType.toLowerCase()}` : '';

  const tonightXg = tonight.reduce((sum, s) => sum + s.xg, 0);
  const tonightGoals = tonight.filter(s => s.event === 'GOAL').length;

  const lines = [
    `${number}${name} (${shot.xg.toFixed(2)} xG)${shotType} — ${outcome}`,
    quip,
    '',
    `**Tonight:** ${tonight.length} attempt${tonight.length === 1 ? '' : 's'} · ${tonightXg.toFixed(2)} xG · ${tonightGoals} goal${tonightGoals === 1 ? '' : 's'}`,
  ];
  if (season) {
    const owed = goalsOwed(season, tonightXg, tonightGoals);
    const debt = owed > 0 ? `${XG_VICTIM.lastName} owes the people ${goalsText(owed)}` : `${XG_VICTIM.lastName} is somehow paid up`;
    lines.push(`**Season:** ${(season.xg + tonightXg).toFixed(1)} xG · ${season.goals + tonightGoals} goals · ${debt}`);
  }
  lines.push('', `🥶 ${clockText(shot.gameSeconds, gameType)}`);

  const embed = new EmbedBuilder()
    .setTitle(`🥶 ${name} Expected Goal 🥶`)
    .setDescription(lines.join('\n'))
    .setColor(0x7FDBFF)
    .setFooter({ text: 'xG via MoneyPuck' });
  if (headshot) embed.setThumbnail(headshot);
  return embed;
}
