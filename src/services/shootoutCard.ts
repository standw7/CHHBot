import { EmbedBuilder, Guild } from 'discord.js';
import type { PlayByPlayResponse, PbpTeam } from '../nhl/types.js';
import { getTeamEmoji } from './goalCard.js';
import type { SpoilerMode } from './spoiler.js';

// A shootout gets a fresh card after every attempt (showing the whole shootout so far),
// instead of a goal card per shootout goal (those had no real score, a 00:00 clock, and usually no scorer:
// the landing endpoint only lists the deciding shootout goal).

export type AttemptResult = 'goal' | 'save' | 'miss';

export interface ShootoutAttempt {
  eventId: number;
  teamAbbrev: string;
  shooter: string; // last name, or "Unknown"
  result: AttemptResult;
  shotType?: string;
  missReason?: string; // "hit post", "wide left", ...
}

export interface ShootoutState {
  away: PbpTeam;
  home: PbpTeam;
  attempts: ShootoutAttempt[];
  complete: boolean;
}

const ATTEMPT_TYPES: Record<string, AttemptResult> = {
  'goal': 'goal',
  'shot-on-goal': 'save',
  'missed-shot': 'miss',
  'failed-shot-attempt': 'miss',
};

export function shootoutState(pbp: PlayByPlayResponse): ShootoutState | null {
  const soPlays = pbp.plays.filter(p => p.periodDescriptor?.periodType === 'SO');
  if (soPlays.length === 0) return null;

  const spots = pbp.rosterSpots ?? [];
  const attempts: ShootoutAttempt[] = [];
  for (const play of soPlays) {
    const result = ATTEMPT_TYPES[play.typeDescKey];
    if (!result) continue;
    const d = play.details;
    const shooterId = d?.scoringPlayerId ?? d?.shootingPlayerId;
    const spot = spots.find(s => s.playerId === shooterId);
    attempts.push({
      eventId: play.eventId,
      teamAbbrev: d?.eventOwnerTeamId === pbp.homeTeam.id ? pbp.homeTeam.abbrev : pbp.awayTeam.abbrev,
      shooter: spot?.lastName.default ?? 'Unknown',
      result,
      shotType: d?.shotType,
      missReason: result === 'miss' && d?.reason ? formatReason(d.reason) : undefined,
    });
  }

  // The NHL can flag the end a poll after the deciding attempt, so also work it out
  // from the attempts — otherwise the deciding attempt would post twice.
  const complete = isDecided(attempts, pbp.awayTeam.abbrev, pbp.homeTeam.abbrev)
    || soPlays.some(p => p.typeDescKey === 'shootout-complete')
    || pbp.gameState === 'FINAL' || pbp.gameState === 'OFF';
  return { away: pbp.awayTeam, home: pbp.homeTeam, attempts, complete };
}

/** True once one team has won: out of reach within the first 3 rounds, or ahead after an even round. */
export function isDecided(attempts: ShootoutAttempt[], away: string, home: string): boolean {
  const shots = (abbrev: string) => attempts.filter(a => a.teamAbbrev === abbrev);
  const awayShots = shots(away).length;
  const homeShots = shots(home).length;
  const awayGoals = shots(away).filter(a => a.result === 'goal').length;
  const homeGoals = shots(home).filter(a => a.result === 'goal').length;

  if (awayShots === homeShots && awayShots >= MIN_ROUNDS) return awayGoals !== homeGoals;
  if (awayShots <= MIN_ROUNDS && homeShots <= MIN_ROUNDS) {
    return awayGoals + (MIN_ROUNDS - awayShots) < homeGoals || homeGoals + (MIN_ROUNDS - homeShots) < awayGoals;
  }
  return false;
}

function formatReason(reason: string): string {
  if (reason.includes('post')) return 'hit post';
  if (reason.includes('crossbar')) return 'hit crossbar';
  return reason.replace(/-/g, ' ');
}

export function goalsFor(state: ShootoutState, abbrev: string): number {
  return state.attempts.filter(a => a.teamAbbrev === abbrev && a.result === 'goal').length;
}

const MARK: Record<AttemptResult, string> = { goal: '✅', save: '❌', miss: '❌' };
const EMPTY = '⬜';
const MIN_ROUNDS = 3;

// One row per team: a mark per attempt, padded with empty boxes to the 3 guaranteed rounds
function marksRow(state: ShootoutState, abbrev: string, rounds: number): string {
  const marks = state.attempts.filter(a => a.teamAbbrev === abbrev).map(a => MARK[a.result]);
  // Once it's over, don't show boxes for rounds that were never needed
  const width = state.complete ? marks.length : rounds;
  while (marks.length < width) marks.push(EMPTY);
  return marks.join(' ');
}

function attemptLine(a: ShootoutAttempt, guild?: Guild): string {
  const detail = a.result === 'miss' ? a.missReason ?? 'missed' : a.result === 'save' ? 'saved' : a.shotType ?? 'scores';
  return `${getTeamEmoji(a.teamAbbrev, guild)} ${a.shooter} ${MARK[a.result]} *${detail}*`;
}

export function buildShootoutCard(
  state: ShootoutState,
  spoilerMode: SpoilerMode,
  primaryTeam?: string,
  guild?: Guild,
): EmbedBuilder {
  const { away, home, attempts } = state;
  const awayCount = attempts.filter(a => a.teamAbbrev === away.abbrev).length;
  const homeCount = attempts.filter(a => a.teamAbbrev === home.abbrev).length;
  const rounds = Math.max(MIN_ROUNDS, awayCount, homeCount);

  // Scoreboard: away on top, like the rest of the bot's cards
  const awayEmoji = getTeamEmoji(away.abbrev, guild);
  const homeEmoji = getTeamEmoji(home.abbrev, guild);
  const lines = [
    `${awayEmoji} **${away.abbrev}**  ${marksRow(state, away.abbrev, rounds)}`,
    `${homeEmoji} **${home.abbrev}**  ${marksRow(state, home.abbrev, rounds)}`,
    '',
  ];

  // Attempts grouped into rounds (a round = one shot from each team)
  const firstTeam = attempts[0]?.teamAbbrev;
  for (let r = 0; r < Math.max(awayCount, homeCount); r++) {
    const inRound = [firstTeam, firstTeam === away.abbrev ? home.abbrev : away.abbrev]
      .map(abbrev => attempts.filter(a => a.teamAbbrev === abbrev)[r])
      .filter((a): a is ShootoutAttempt => a !== undefined);
    const label = r < MIN_ROUNDS ? `Round ${r + 1}` : `Round ${r + 1} · sudden death`;
    lines.push(`**${label}**`, ...inRound.map(a => attemptLine(a, guild)));
  }

  let color = 0x006847;
  if (state.complete) {
    const awayGoals = goalsFor(state, away.abbrev);
    const homeGoals = goalsFor(state, home.abbrev);
    const winner = awayGoals > homeGoals ? away : home;
    const winnerName = winner.commonName?.default ?? winner.name?.default ?? winner.abbrev;
    const result = `🏆 ${getTeamEmoji(winner.abbrev, guild)} **${winnerName}** win the shootout ${Math.max(awayGoals, homeGoals)}–${Math.min(awayGoals, homeGoals)}`;
    lines.push('', spoilerMode === 'off' ? result : `||${result}||`);
    if (primaryTeam && spoilerMode === 'off') {
      color = winner.abbrev === primaryTeam ? 0xFFD700 : 0x8B0000;
    }
  } else if (attempts.length === 0) {
    lines.push('*First shooter coming up…*');
  }

  return new EmbedBuilder()
    .setTitle(`🥅 Shootout · ${awayEmoji} ${away.abbrev} @ ${home.abbrev} ${homeEmoji}`)
    .setDescription(lines.join('\n'))
    .setColor(color);
}
