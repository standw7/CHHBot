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
}

const STRENGTH_LABELS: Record<string, string> = {
  ev: 'Even Strength (5v5)',
  pp: 'Power Play',
  sh: 'Short Handed',
};

export function getTeamEmoji(abbrev: string, guild?: Guild): string {
  if (guild) {
    const emoji = guild.emojis.cache.find(e => e.name?.toLowerCase() === abbrev.toLowerCase());
    if (emoji) return `<:${emoji.name}:${emoji.id}>`;
  }
  return abbrev;
}

export function buildGoalCard(data: GoalCardData, spoilerMode: SpoilerMode): { content?: string; embed: EmbedBuilder } {
  const { landingGoal, play, homeTeam, awayTeam, scoringTeamAbbrev, scoringTeamLogo, guild } = data;

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
  const strengthLabel = STRENGTH_LABELS[strength] ?? strength;
  const numberStr = scorerNumber ? ` #${scorerNumber}` : '';
  const scoringEmoji = getTeamEmoji(scoringTeamAbbrev, guild);
  const title = `${scoringEmoji} 🚨 ${scoringTeamName}${numberStr} ${strengthLabel} Goal 🚨 ${scoringEmoji}`;

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
