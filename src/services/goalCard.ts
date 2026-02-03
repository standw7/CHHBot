import { EmbedBuilder } from 'discord.js';
import type { Play, PbpTeam } from '../nhl/types.js';
import { shouldIncludeScoresInEmbed, formatScoreLine, type SpoilerMode } from './spoiler.js';

export interface GoalCardData {
  play: Play;
  homeTeam: PbpTeam;
  awayTeam: PbpTeam;
  scoringTeamAbbrev: string;
  scoringTeamLogo: string;
}

export function buildGoalCard(data: GoalCardData, spoilerMode: SpoilerMode): { content?: string; embed: EmbedBuilder } {
  const { play, homeTeam, awayTeam, scoringTeamAbbrev, scoringTeamLogo } = data;
  const details = play.details;

  // Build title
  const scorerName = details?.scoringPlayerName ?? 'Unknown';
  const goalCount = details?.scorerSeasonGoals ?? details?.scoringPlayerTotal ?? '?';
  const shotType = details?.shotType ?? '';
  const modifier = details?.goalModifier ?? '';
  const strengthDesc = modifier ? ` ${modifier}` : '';

  const title = `${scoringTeamAbbrev}${strengthDesc} Goal`;

  // Build description
  let description = `**${scorerName}** (${goalCount})`;
  if (shotType) description += ` - ${shotType}`;

  if (details?.assists && details.assists.length > 0) {
    const assistList = details.assists.map(a => {
      const name = a.playerName ?? a.name ?? `${a.firstName?.default ?? ''} ${a.lastName?.default ?? ''}`.trim();
      const count = a.seasonAssists ?? a.assistsToDate ?? '?';
      return `${name} (${count})`;
    }).join(', ');
    description += `\nAssists: ${assistList}`;
  } else {
    description += '\nUnassisted';
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x006847)
    .setThumbnail(scoringTeamLogo);

  // Period / clock info
  const period = play.periodDescriptor?.periodType === 'OT'
    ? 'OT'
    : play.periodDescriptor?.periodType === 'SO'
      ? 'SO'
      : `${ordinal(play.periodDescriptor?.number ?? 1)} period`;
  const timeRemaining = play.timeRemaining || play.timeInPeriod;
  embed.addFields({ name: 'Game Clock', value: `${timeRemaining} - ${period}`, inline: false });

  // Score fields (respect spoiler mode)
  if (shouldIncludeScoresInEmbed(spoilerMode)) {
    const homeScore = details?.homeScore ?? homeTeam.score;
    const awayScore = details?.awayScore ?? awayTeam.score;
    const homeSog = details?.homeSOG ?? homeTeam.sog;
    const awaySog = details?.awaySOG ?? awayTeam.sog;

    embed.addFields(
      { name: homeTeam.abbrev, value: `Goals: ${homeScore}${homeSog !== undefined ? ` | Shots: ${homeSog}` : ''}`, inline: true },
      { name: awayTeam.abbrev, value: `Goals: ${awayScore}${awaySog !== undefined ? ` | Shots: ${awaySog}` : ''}`, inline: true },
    );
  }

  // Spoiler-wrapped score line as separate content (for wrap_scores and minimal_embed)
  let content: string | undefined;
  const scoreLine = formatScoreLine(
    awayTeam.abbrev,
    details?.awayScore ?? awayTeam.score,
    homeTeam.abbrev,
    details?.homeScore ?? homeTeam.score,
    details?.awaySOG ?? awayTeam.sog,
    details?.homeSOG ?? homeTeam.sog,
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
