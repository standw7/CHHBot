import { EmbedBuilder, Guild } from 'discord.js';
import type { BoxscoreResponse } from '../nhl/types.js';
import { shouldIncludeScoresInEmbed, formatScoreLine, type SpoilerMode } from './spoiler.js';
import { getTeamEmoji } from './goalCard.js';

export function buildFinalCard(boxscore: BoxscoreResponse, spoilerMode: SpoilerMode, guild?: Guild): { content?: string; embed: EmbedBuilder } {
  const { homeTeam, awayTeam } = boxscore;

  const embed = new EmbedBuilder()
    .setTitle(`${getTeamEmoji(awayTeam.abbrev, guild)} ${awayTeam.abbrev} @ ${homeTeam.abbrev} ${getTeamEmoji(homeTeam.abbrev, guild)} - Final`)
    .setColor(0x006847);

  // Note how the game was decided (never reveals the score itself)
  const periodType = boxscore.periodDescriptor?.periodType;
  if (periodType === 'SO') {
    embed.setDescription('🥅 Won in a shootout');
  } else if (periodType === 'OT') {
    embed.setDescription('⏱️ Won in overtime');
  }

  if (shouldIncludeScoresInEmbed(spoilerMode)) {
    embed.addFields(
      { name: `${getTeamEmoji(homeTeam.abbrev, guild)} ${homeTeam.abbrev}`, value: `Goals: ${homeTeam.score} | Shots: ${homeTeam.sog}`, inline: true },
      { name: `${getTeamEmoji(awayTeam.abbrev, guild)} ${awayTeam.abbrev}`, value: `Goals: ${awayTeam.score} | Shots: ${awayTeam.sog}`, inline: true },
    );
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
