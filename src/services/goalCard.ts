import { EmbedBuilder } from 'discord.js';
import type { LandingGoal, PbpTeam, Play } from '../nhl/types.js';
import { shouldIncludeScoresInEmbed, formatScoreLine, type SpoilerMode } from './spoiler.js';

export interface GoalCardData {
  // Rich data from landing endpoint (preferred)
  landingGoal?: LandingGoal;
  // Fallback: raw play-by-play data (IDs only, no names)
  play: Play;
  homeTeam: PbpTeam;
  awayTeam: PbpTeam;
  scoringTeamAbbrev: string;
  scoringTeamLogo: string;
}

export function buildGoalCard(data: GoalCardData, spoilerMode: SpoilerMode): { content?: string; embed: EmbedBuilder } {
  const { landingGoal, play, homeTeam, awayTeam, scoringTeamAbbrev, scoringTeamLogo } = data;

  // Use landing data for names if available, fall back to play-by-play
  const scorerName = landingGoal
    ? `${landingGoal.firstName.default} ${landingGoal.lastName.default}`
    : 'Unknown';
  const goalCount = landingGoal?.goalsToDate ?? play.details?.scoringPlayerTotal ?? '?';
  const shotType = landingGoal?.shotType ?? play.details?.shotType ?? '';
  const strength = landingGoal?.strength ?? '';
  const goalModifier = landingGoal?.goalModifier ?? '';
  const sweaterNumber = landingGoal?.sweaterNumber;

  // Build title
  let title = `${scoringTeamAbbrev}`;
  if (strength && strength !== 'ev') {
    const strengthMap: Record<string, string> = { pp: 'Power Play', sh: 'Short Handed' };
    title += ` ${strengthMap[strength] ?? strength}`;
  }
  title += ' Goal';

  // Build description
  let description = sweaterNumber ? `**#${sweaterNumber} ${scorerName}**` : `**${scorerName}**`;
  description += ` (${goalCount})`;
  if (shotType) description += ` - ${shotType}`;

  if (landingGoal?.assists && landingGoal.assists.length > 0) {
    const assistList = landingGoal.assists.map(a => {
      const name = `${a.firstName.default} ${a.lastName.default}`;
      const num = a.sweaterNumber ? `#${a.sweaterNumber} ` : '';
      return `${num}${name} (${a.assistsToDate})`;
    }).join(', ');
    description += `\nAssists: ${assistList}`;
  } else if (landingGoal?.assists?.length === 0) {
    description += '\nUnassisted';
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x006847)
    .setThumbnail(scoringTeamLogo);

  // Headshot as author icon if available
  if (landingGoal?.headshot) {
    embed.setAuthor({ name: scorerName, iconURL: landingGoal.headshot });
  }

  // Period / clock info
  const period = play.periodDescriptor?.periodType === 'OT'
    ? 'OT'
    : play.periodDescriptor?.periodType === 'SO'
      ? 'SO'
      : `${ordinal(play.periodDescriptor?.number ?? 1)} period`;
  const timeRemaining = play.timeRemaining || play.timeInPeriod;
  embed.addFields({ name: 'Game Clock', value: `${timeRemaining} - ${period}`, inline: false });

  // Score fields (respect spoiler mode)
  const homeScore = landingGoal?.homeScore ?? play.details?.homeScore ?? homeTeam.score;
  const awayScore = landingGoal?.awayScore ?? play.details?.awayScore ?? awayTeam.score;

  if (shouldIncludeScoresInEmbed(spoilerMode)) {
    embed.addFields(
      { name: homeTeam.abbrev, value: `Goals: ${homeScore}${homeTeam.sog !== undefined ? ` | Shots: ${homeTeam.sog}` : ''}`, inline: true },
      { name: awayTeam.abbrev, value: `Goals: ${awayScore}${awayTeam.sog !== undefined ? ` | Shots: ${awayTeam.sog}` : ''}`, inline: true },
    );
  }

  // Spoiler-wrapped score line as separate content
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
