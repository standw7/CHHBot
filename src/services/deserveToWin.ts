/**
 * MoneyPuck's "Deserve To Win O'Meter": replay every shot of a game many times, each
 * one going in with its expected-goals probability, and count who wins. MoneyPuck runs
 * this in the browser on its game page (moneypuck.com/g.htm?id=…) and doesn't publish
 * an image, so Tusky runs the same simulation on the same public shot data and draws
 * its own gauge. Credited to MoneyPuck on the card.
 */
import pino from 'pino';
import { AttachmentBuilder, MessageCreateOptions } from 'discord.js';
import * as nhlClient from '../nhl/client.js';
import { renderPng } from './toiRender.js';

const logger = pino({ name: 'deserve-to-win' });

export const SIMULATIONS = 10_000;

export interface MpShot {
  time: number; // game seconds
  team: 'HOME' | 'AWAY';
  xg: number; // shotGoalProbability
  sequence: string;
  emptyNet: boolean;
  homeSkaters: number;
  awaySkaters: number;
}

export interface MpGame {
  shots: MpShot[];
  ended: boolean; // has the GEND row
  homeGoals: number;
  awayGoals: number;
}

/** e.g. 2026020164 → https://moneypuck.com/moneypuck/gameData/20262027/2026020164.csv */
export function gameDataUrl(gameId: number): string {
  const season = Number(String(gameId).slice(0, 4));
  return `https://moneypuck.com/moneypuck/gameData/${season}${season + 1}/${gameId}.csv`;
}

/** Parses MoneyPuck's per-game CSV by header name. MoneyPuck's own page splits on commas the same way. */
export function parseGameCsv(csv: string): MpGame {
  const lines = csv.split(/\r?\n/).filter(l => l.length > 0);
  const header = lines[0]?.split(',') ?? [];
  const col = (name: string) => header.indexOf(name);
  const c = {
    time: col('time'), team: col('team'), xg: col('shotGoalProbability'), sequence: col('sequence'),
    emptyNet: col('shotOnEmptyNet'), homeSkaters: col('homeSkatersOnIce'), awaySkaters: col('awaySkatersOnIce'),
    event: col('event'), homeGoals: col('homeTeamGoals'), awayGoals: col('awayTeamGoals'),
  };
  if (Object.values(c).some(i => i < 0)) throw new Error('MoneyPuck CSV is missing expected columns');

  const game: MpGame = { shots: [], ended: false, homeGoals: 0, awayGoals: 0 };
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (f.length !== header.length) continue;
    game.homeGoals = Number(f[c.homeGoals]) || 0;
    game.awayGoals = Number(f[c.awayGoals]) || 0;
    if (f[c.event] === 'GEND') game.ended = true;
    const xg = Number(f[c.xg]);
    const team = f[c.team];
    if (!(xg > 0) || (team !== 'HOME' && team !== 'AWAY')) continue;
    game.shots.push({
      time: Number(f[c.time]),
      team,
      xg,
      sequence: f[c.sequence],
      emptyNet: Number(f[c.emptyNet]) === 1,
      homeSkaters: Number(f[c.homeSkaters]),
      awaySkaters: Number(f[c.awaySkaters]),
    });
  }
  return game;
}

/**
 * Share of simulated games the home team wins (ties count half), mirroring MoneyPuck's
 * runSimulation(): one goal per shot sequence (no double-counting rebounds), and
 * empty-net / extra-attacker goals that wouldn't have happened at the simulated score
 * are thrown out.
 */
export function simulateHomeWinShare(shots: MpShot[], n = SIMULATIONS, random: () => number = Math.random): number {
  let homeWins = 0;
  for (let i = 0; i < n; i++) {
    let home = 0;
    let away = 0;
    let lastGoalSequence: string | null = null;
    for (const s of shots) {
      if (s.sequence === lastGoalSequence || random() >= s.xg) continue;
      const lead = s.team === 'HOME' ? home - away : away - home;
      const close = lead === 1 || lead === 2;
      const extraAttacker = (s.team === 'HOME' ? s.homeSkaters : s.awaySkaters) === 6 && s.time > 3300 && s.time <= 3600;
      if ((s.emptyNet && !close) || (extraAttacker && !close)) continue;
      lastGoalSequence = s.sequence;
      if (s.team === 'HOME') home++;
      else away++;
    }
    homeWins += home > away ? 1 : home === away ? 0.5 : 0;
  }
  return homeWins / n;
}

// ---- Rendering ----

const COLORS = {
  background: '#1c1b1f',
  text: '#f2e6dc',
  muted: '#b9b4bd',
  footer: '#8c8794',
  track: '#2b2930',
  us: '#c8834f', // warm amber, matches the TOI chart
  them: '#6f7d8c',
  needle: '#f2e6dc',
};

export interface MeterInput {
  awayAbbrev: string;
  homeAbbrev: string;
  awayScore: number;
  homeScore: number;
  homeShare: number; // 0..1
  teamCode: string; // highlighted team
  endedIn?: string; // 'OT' | 'SO' | undefined
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function point(cx: number, cy: number, r: number, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy - r * Math.sin(rad)).toFixed(2)}`;
}

export function buildMeterSvg(m: MeterInput): string {
  const W = 760;
  const H = 500;
  const cx = W / 2;
  const cy = 330;
  const r = 200;
  const stroke = 44;
  const awayShare = 1 - m.homeShare;
  // Away fills from the left (180°) toward the needle, home from the right (0°)
  const boundary = 180 - awayShare * 180;
  const awayColor = m.awayAbbrev === m.teamCode ? COLORS.us : COLORS.them;
  const homeColor = m.homeAbbrev === m.teamCode ? COLORS.us : COLORS.them;
  const arc = (from: number, to: number, color: string) =>
    from === to ? '' : `<path d="M ${point(cx, cy, r, from)} A ${r} ${r} 0 0 1 ${point(cx, cy, r, to)}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`;
  const final = `${m.awayAbbrev} ${m.awayScore} – ${m.homeScore} ${m.homeAbbrev} · Final${m.endedIn ? `/${m.endedIn}` : ''}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
    `<g font-family="IBM Plex Sans">`,
    `<text x="${cx}" y="58" text-anchor="middle" font-size="30" font-weight="600" fill="${COLORS.text}">Deserve To Win O'Meter</text>`,
    `<text x="${cx}" y="92" text-anchor="middle" font-size="18" fill="${COLORS.muted}">${final}</text>`,
    arc(180, boundary, awayColor),
    arc(boundary, 0, homeColor),
    // needle
    `<line x1="${cx}" y1="${cy}" x2="${point(cx, cy, r - stroke / 2 - 10, boundary).replace(' ', '" y2="')}" stroke="${COLORS.needle}" stroke-width="6" stroke-linecap="round"/>`,
    `<circle cx="${cx}" cy="${cy}" r="12" fill="${COLORS.needle}"/>`,
    // team percentages under each end of the gauge
    `<text x="${cx - r}" y="${cy + 62}" text-anchor="middle" font-size="44" font-weight="600" fill="${awayColor}">${pct(awayShare)}</text>`,
    `<text x="${cx - r}" y="${cy + 92}" text-anchor="middle" font-size="20" fill="${COLORS.muted}">${m.awayAbbrev}</text>`,
    `<text x="${cx + r}" y="${cy + 62}" text-anchor="middle" font-size="44" font-weight="600" fill="${homeColor}">${pct(m.homeShare)}</text>`,
    `<text x="${cx + r}" y="${cy + 92}" text-anchor="middle" font-size="20" fill="${COLORS.muted}">${m.homeAbbrev}</text>`,
    `<text x="${cx}" y="${H - 24}" text-anchor="middle" font-size="13" letter-spacing="3" fill="${COLORS.footer}">${SIMULATIONS.toLocaleString('en-US')} XG SIMULATIONS · DATA: MONEYPUCK.COM</text>`,
    `</g>`,
    `</svg>`,
  ].join('');
}

// ---- Loading ----

/**
 * Renders the meter once MoneyPuck has the whole game (its GEND row). 'incomplete'
 * until then; null if the game can't be loaded or doesn't involve the team.
 */
export async function loadDeserveToWin(gameId: number, teamCode: string): Promise<{ png: Buffer; title: string; ours: number } | 'incomplete' | null> {
  const box = await nhlClient.getBoxscore(gameId);
  if (!box) return 'incomplete'; // NHL hiccup: try again next poll
  if (box.homeTeam.abbrev !== teamCode && box.awayTeam.abbrev !== teamCode) return null;

  let res: Response;
  try {
    res = await fetch(gameDataUrl(gameId), { headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' } });
  } catch (err) {
    logger.warn({ err, gameId }, 'MoneyPuck game data fetch failed');
    return 'incomplete';
  }
  if (!res.ok) return 'incomplete'; // 404 until MoneyPuck has the game

  const game = parseGameCsv(await res.text());
  if (!game.ended || game.shots.length === 0) return 'incomplete';

  const homeShare = simulateHomeWinShare(game.shots);
  const homeIsUs = box.homeTeam.abbrev === teamCode;
  const ours = homeIsUs ? homeShare : 1 - homeShare;
  const periodType = box.periodDescriptor?.periodType;
  const svg = buildMeterSvg({
    awayAbbrev: box.awayTeam.abbrev,
    homeAbbrev: box.homeTeam.abbrev,
    awayScore: box.awayTeam.score ?? game.awayGoals,
    homeScore: box.homeTeam.score ?? game.homeGoals,
    homeShare,
    teamCode,
    endedIn: periodType === 'OT' || periodType === 'SO' ? periodType : undefined,
  });
  return {
    png: renderPng(svg),
    title: `🎰 Deserve To Win O'Meter · ${box.awayTeam.abbrev} @ ${box.homeTeam.abbrev}`,
    ours,
  };
}

export function meterMessage(meter: { png: Buffer; title: string; ours: number }, gameId: number, teamCode: string): MessageCreateOptions {
  return {
    content: `**${meter.title}**\n${teamCode} deserved to win ${pct(meter.ours)} of the time · <https://moneypuck.com/g.htm?id=${gameId}>`,
    files: [new AttachmentBuilder(meter.png, { name: `deserve-to-win-${gameId}.png` })],
  };
}
