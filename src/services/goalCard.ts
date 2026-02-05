import { EmbedBuilder, Guild } from 'discord.js';
import type { LandingGoal, PbpTeam, Play } from '../nhl/types.js';
import { shouldIncludeScoresInEmbed, formatScoreLine, type SpoilerMode } from './spoiler.js';

export interface GoalCardData {
  landingGoal?: LandingGoal;
  play: Play;
  homeTeam: PbpTeam;
  awayTeam: PbpTeam;
  scoringTeamAbbrev: string;
  scoringTeamLogo: string;
  guild?: Guild;
  primaryTeam?: string;
}

const STRENGTH_LABELS: Record<string, string> = {
  ev: 'Even Strength',
  pp: 'Power Play',
  sh: 'Short Handed',
};

// Parse situationCode to get skater counts
// Format: XYZW where X=away goalie (1=in,0=pulled), Y=away skaters, Z=home goalie, W=home skaters
function parseSkaterSituation(situationCode: string | undefined, isHomeScoringTeam: boolean): string | null {
  if (!situationCode || situationCode.length !== 4) return null;

  const awayGoalie = situationCode[0] === '1';
  const awaySkaters = parseInt(situationCode[1], 10);
  const homeGoalie = situationCode[2] === '1';
  const homeSkaters = parseInt(situationCode[3], 10);

  // Calculate effective players (skaters + goalie if in net)
  const homeTotal = homeSkaters + (homeGoalie ? 1 : 0);
  const awayTotal = awaySkaters + (awayGoalie ? 1 : 0);

  // Check for pulled goalie situations (empty net)
  const homeGoaliePulled = !homeGoalie;
  const awayGoaliePulled = !awayGoalie;

  if (homeGoaliePulled || awayGoaliePulled) {
    // Format as skaters vs skaters (e.g., "6v5" or "5v6")
    if (isHomeScoringTeam) {
      return `${homeTotal}v${awayTotal}`;
    } else {
      return `${awayTotal}v${homeTotal}`;
    }
  }

  return null; // Regular situation, use strength label
}

export function getTeamEmoji(abbrev: string, guild?: Guild): string {
  if (guild) {
    const emoji = guild.emojis.cache.find(e => e.name?.toLowerCase() === abbrev.toLowerCase());
    if (emoji) return `<:${emoji.name}:${emoji.id}>`;
  }
  return abbrev;
}

function getGoalEmoji(scoringTeamAbbrev: string, primaryTeam: string | undefined, guild?: Guild): string {
  // Use :mammothgoal: for primary team goals, red siren for opponent goals
  if (primaryTeam && scoringTeamAbbrev === primaryTeam && guild) {
    const mammothGoal = guild.emojis.cache.find(e => e.name?.toLowerCase() === 'mammothgoal');
    if (mammothGoal) return `<:${mammothGoal.name}:${mammothGoal.id}>`;
  }
  return '🚨';
}

export function buildGoalCard(data: GoalCardData, spoilerMode: SpoilerMode): { content?: string; embed: EmbedBuilder } {
  const { landingGoal, play, homeTeam, awayTeam, scoringTeamAbbrev, scoringTeamLogo, guild, primaryTeam } = data;

  // Scorer info
  const scorerFirst = landingGoal?.firstName?.default ?? '';
  const scorerLast = landingGoal?.lastName?.default ?? '';
  const scorerName = landingGoal ? `${scorerFirst} ${scorerLast}` : 'Unknown';
  const scorerNumber = landingGoal?.sweaterNumber ?? '';
  const goalCount = landingGoal?.goalsToDate ?? play.details?.scoringPlayerTotal ?? '?';
  const shotType = landingGoal?.shotType ?? play.details?.shotType ?? '';
  const strength = landingGoal?.strength ?? 'ev';

  // Scoring team full name
  const scoringTeamName = getTeamFullName(scoringTeamAbbrev, homeTeam, awayTeam);

  // --- Title ---
  const isHomeScoringTeam = scoringTeamAbbrev === homeTeam.abbrev;
  const skaterSituation = parseSkaterSituation(landingGoal?.situationCode, isHomeScoringTeam);
  // Use skater situation (e.g., "6v5") for pulled goalie, otherwise use strength label
  const strengthLabel = skaterSituation ?? (STRENGTH_LABELS[strength] ?? strength);
  const numberStr = scorerNumber ? ` #${scorerNumber}` : '';
  const scoringEmoji = getTeamEmoji(scoringTeamAbbrev, guild);
  const goalEmoji = getGoalEmoji(scoringTeamAbbrev, primaryTeam, guild);
  const title = `${scoringEmoji} ${goalEmoji} ${scoringTeamName}${numberStr} ${strengthLabel} Goal ${goalEmoji} ${scoringEmoji}`;

  // --- Description ---
  let description = '';

  // Scorer line: #10 Matty Beniers (13) wrist assists: #19 Jared McCann (12), #62 Brandon Montour (14)
  const numberPrefix = scorerNumber ? `#${scorerNumber} ` : '';
  description += `${numberPrefix}${scorerName} (${goalCount})`;
  if (shotType) description += ` ${shotType}`;

  if (landingGoal?.assists && landingGoal.assists.length > 0) {
    const assistList = landingGoal.assists.map(a => {
      const num = a.sweaterNumber ? `#${a.sweaterNumber} ` : '';
      return `${num}${a.firstName.default} ${a.lastName.default} (${a.assistsToDate})`;
    }).join(', ');
    description += ` assists: ${assistList}`;
  } else if (landingGoal?.assists?.length === 0) {
    description += ' (unassisted)';
  }

  // Score section (respect spoiler mode)
  const homeScore = landingGoal?.homeScore ?? play.details?.homeScore ?? homeTeam.score;
  const awayScore = landingGoal?.awayScore ?? play.details?.awayScore ?? awayTeam.score;

  if (shouldIncludeScoresInEmbed(spoilerMode)) {
    const homeTeamName = getTeamFullName(homeTeam.abbrev, homeTeam, awayTeam);
    const awayTeamName = getTeamFullName(awayTeam.abbrev, homeTeam, awayTeam);

    const homeEmoji = getTeamEmoji(homeTeam.abbrev, guild);
    const awayEmoji = getTeamEmoji(awayTeam.abbrev, guild);

    description += `\n\n${homeEmoji} **${homeTeamName}** ${homeEmoji}`;
    description += `\nGoals: **${homeScore}**`;
    if (homeTeam.sog !== undefined) description += `\nShots: **${homeTeam.sog}**`;

    description += `\n${awayEmoji} **${awayTeamName}** ${awayEmoji}`;
    description += `\nGoals: **${awayScore}**`;
    if (awayTeam.sog !== undefined) description += `\nShots: **${awayTeam.sog}**`;
  }

  // Clock at bottom
  const period = play.periodDescriptor?.periodType === 'OT'
    ? 'OT'
    : play.periodDescriptor?.periodType === 'SO'
      ? 'the shootout'
      : `the ${ordinal(play.periodDescriptor?.number ?? 1)} period`;
  const timeRemaining = play.timeRemaining || play.timeInPeriod;
  description += `\n\n${scoringEmoji} ${timeRemaining} left in ${period}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x006847)
    .setThumbnail(scoringTeamLogo);

  // Spoiler-wrapped score line as separate content above embed
  let content: string | undefined;
  const scoreLine = formatScoreLine(
    awayTeam.abbrev, awayScore,
    homeTeam.abbrev, homeScore,
    awayTeam.sog, homeTeam.sog,
    spoilerMode,
  );
  if (scoreLine) {
    content = scoreLine;
  }

  return { content, embed };
}

function getTeamFullName(abbrev: string, homeTeam: PbpTeam, awayTeam: PbpTeam): string {
  const team = abbrev === homeTeam.abbrev ? homeTeam : awayTeam;
  return team.commonName?.default ?? team.name?.default ?? abbrev;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
