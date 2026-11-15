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
import { THEME } from './chartTheme.js';
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

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

/** An arc path from angle `from` to `to` (degrees, 180 = left, 0 = right), drawn clockwise. */
function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Half-circle gauge: away fills from the left, home from the right, meeting at the split.
 * Our team in Mountain Blue, the opponent in grey, round-capped strokes with a small gap
 * at the split, a scale of ticks inside, and our share as the big centre number.
 */
export function buildMeterSvg(m: MeterInput): string {
  const W = 760;
  const H = 540;
  const pad = 48;
  const cx = W / 2;
  const cy = 350;
  const r = 230;
  const stroke = 46;
  const awayShare = 1 - m.homeShare;
  const awayIsUs = m.awayAbbrev === m.teamCode;
  const ourShare = awayIsUs ? awayShare : m.homeShare;
  const awayColor = awayIsUs ? THEME.accent : THEME.opponent;
  const homeColor = awayIsUs ? THEME.opponent : THEME.accent;

  // Split angle, kept off the very ends so both sides stay visible at 99/1
  const split = Math.min(176, Math.max(4, 180 - awayShare * 180));
  // Round caps reach stroke/2 past each end, so leave that plus a little air either side of the split
  const capDeg = ((stroke / 2 + 4) / r) * (180 / Math.PI);
  const awayEnd = split + capDeg;
  const homeStart = split - capDeg;

  // Scale: a tick every 10%, longer at 0/50/100
  const ticks: string[] = [];
  for (let k = 0; k <= 10; k++) {
    const deg = 180 - k * 18;
    const major = k % 5 === 0;
    const [x1, y1] = polar(cx, cy, r - stroke / 2 - 12, deg);
    const [x2, y2] = polar(cx, cy, r - stroke / 2 - (major ? 28 : 20), deg);
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${major ? THEME.muted : THEME.divider}" stroke-width="${major ? 2.5 : 2}" stroke-linecap="round"/>`);
  }

  // Split marker: a white pip on the arc's outer edge, pointing at the split
  const [px, py] = polar(cx, cy, r + stroke / 2 + 12, split);
  const final = `${m.awayAbbrev} ${m.awayScore} – ${m.homeScore} ${m.homeAbbrev} · FINAL${m.endedIn ? `/${m.endedIn}` : ''}`;
  const endLabelY = cy + 56;
  const sideLabel = (x: number, abbrev: string, share: number, isUs: boolean) =>
    `<text x="${x}" y="${endLabelY}" text-anchor="middle" font-size="22" font-weight="600" letter-spacing="2.5" fill="${THEME.label}">${abbrev}</text>` +
    `<text x="${x}" y="${endLabelY + 44}" text-anchor="middle" font-size="38" font-weight="600" fill="${isUs ? THEME.accent : THEME.text}">${pct(share)}</text>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${THEME.background}"/>`,
    `<g font-family="IBM Plex Sans">`,
    `<text x="${pad}" y="50" font-size="15" font-weight="600" letter-spacing="2.5" fill="${THEME.muted}">DESERVE TO WIN O'METER</text>`,
    `<text x="${W - pad}" y="50" text-anchor="end" font-size="15" font-weight="600" letter-spacing="2.5" fill="${THEME.muted}">${final}</text>`,
    // Track, then each side on top
    `<path d="${arcPath(cx, cy, r, 180, 0)}" fill="none" stroke="${THEME.surface}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    `<path d="${arcPath(cx, cy, r, 180, awayEnd)}" fill="none" stroke="${awayColor}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    `<path d="${arcPath(cx, cy, r, homeStart, 0)}" fill="none" stroke="${homeColor}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    ...ticks,
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="${THEME.text}"/>`,
    // Centre readout
    `<text x="${cx}" y="${cy - 40}" text-anchor="middle" font-size="96" font-weight="600" fill="${THEME.accent}">${pct(ourShare)}</text>`,
    `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="15" font-weight="600" letter-spacing="2.5" fill="${THEME.label}">${m.teamCode} DESERVED TO WIN</text>`,
    sideLabel(cx - r, m.awayAbbrev, awayShare, awayIsUs),
    sideLabel(cx + r, m.homeAbbrev, m.homeShare, !awayIsUs),
    `<line x1="${pad}" y1="${H - 62}" x2="${W - pad}" y2="${H - 62}" stroke="${THEME.divider}" stroke-width="1"/>`,
    `<text x="${cx}" y="${H - 28}" text-anchor="middle" font-size="13" font-weight="600" letter-spacing="2.5" fill="${THEME.muted}">${SIMULATIONS.toLocaleString('en-US')} SIMULATED GAMES FROM EVERY SHOT'S XG · DATA: MONEYPUCK</text>`,
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
