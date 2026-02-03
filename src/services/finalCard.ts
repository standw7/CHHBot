import { EmbedBuilder } from 'discord.js';
import type { BoxscoreResponse } from '../nhl/types.js';
import { shouldIncludeScoresInEmbed, formatScoreLine, type SpoilerMode } from './spoiler.js';
import { getTeamEmoji } from './goalCard.js';

export function buildFinalCard(boxscore: BoxscoreResponse, spoilerMode: SpoilerMode): { content?: string; embed: EmbedBuilder } {
  const { homeTeam, awayTeam } = boxscore;

  const embed = new EmbedBuilder()
    .setTitle(`${getTeamEmoji(awayTeam.abbrev)} ${awayTeam.abbrev} @ ${homeTeam.abbrev} ${getTeamEmoji(homeTeam.abbrev)} - Final`)
    .setColor(0x006847);

  if (shouldIncludeScoresInEmbed(spoilerMode)) {
    embed.addFields(
      { name: `${getTeamEmoji(homeTeam.abbrev)} ${homeTeam.abbrev}`, value: `Goals: ${homeTeam.score} | Shots: ${homeTeam.sog}`, inline: true },
      { name: `${getTeamEmoji(awayTeam.abbrev)} ${awayTeam.abbrev}`, value: `Goals: ${awayTeam.score} | Shots: ${awayTeam.sog}`, inline: true },
    );
  }

  // Three stars
  const stars = boxscore.summary?.threeStars;
  if (stars && stars.length > 0) {
    const starLines = stars.map(s => {
      const name = s.name?.default
        ?? `${s.firstName?.default ?? ''} ${s.lastName?.default ?? ''}`.trim()
        ?? 'Unknown';
      const num = s.sweaterNumber ? `#${s.sweaterNumber}` : '';
      const team = s.teamAbbrev ?? '';
      return `⭐${s.star}. ${num} ${name} (${team})`;
    }).join('\n');
    embed.addFields({ name: 'Stars of the Game', value: starLines, inline: false });
  }

  // Home team logo as thumbnail
  if (homeTeam.logo) {
    embed.setThumbnail(homeTeam.logo);
  }

  // Spoiler-wrapped score line
  let content: string | undefined;
  const scoreLine = formatScoreLine(
    awayTeam.abbrev,
    awayTeam.score,
    homeTeam.abbrev,
    homeTeam.score,
    awayTeam.sog,
    homeTeam.sog,
    spoilerMode,
  );
  if (scoreLine) {
    content = scoreLine;
  }

  return { content, embed };
}
