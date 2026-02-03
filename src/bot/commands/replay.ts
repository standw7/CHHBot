import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import * as nhlClient from '../../nhl/client.js';
import { gamecenterWebUrl } from '../../nhl/endpoints.js';
import { getGuildConfig } from '../../db/queries.js';
import { wrapScore } from '../../services/spoiler.js';
import type { SpoilerMode } from '../../services/spoiler.js';

export const data = new SlashCommandBuilder()
  .setName('replay')
  .setDescription('Show the most recent goal replay/highlight');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const spoilerMode = (config?.spoiler_mode ?? 'off') as SpoilerMode;

  await interaction.deferReply();

  // Find current or most recent game
  const schedule = await nhlClient.getSchedule(teamCode);
  if (!schedule || !schedule.games || schedule.games.length === 0) {
    await interaction.editReply('No games found.');
    return;
  }

  // Look for a live game first, then the most recent completed game
  let targetGame = schedule.games.find(g => g.gameState === 'LIVE' || g.gameState === 'CRIT');
  if (!targetGame) {
    const now = new Date();
    const pastGames = schedule.games
      .filter(g => (g.gameState === 'FINAL' || g.gameState === 'OFF') && new Date(g.startTimeUTC) <= now)
      .sort((a, b) => new Date(b.startTimeUTC).getTime() - new Date(a.startTimeUTC).getTime());
    targetGame = pastGames[0];
  }

  if (!targetGame) {
    await interaction.editReply('No current or recent games found.');
    return;
  }

  const pbp = await nhlClient.getPlayByPlay(targetGame.id);
  if (!pbp || !pbp.plays) {
    await interaction.editReply('Could not fetch play-by-play data.');
    return;
  }

  // Find the most recent goal
  const goals = pbp.plays.filter(p => p.typeDescKey === 'goal');
  if (goals.length === 0) {
    await interaction.editReply('No goals yet in this game.');
    return;
  }

  const lastGoal = goals[goals.length - 1];
  const scorerName = lastGoal.details?.scoringPlayerName ?? 'Unknown';
  const period = lastGoal.periodDescriptor?.periodType === 'OT'
    ? 'OT'
    : `P${lastGoal.periodDescriptor?.number}`;
  const time = lastGoal.timeInPeriod;

  // Try to get replay
  const replay = await nhlClient.getGoalReplay(targetGame.id, lastGoal.eventId);
  const replayUrl = replay?.topClip?.playbackUrl ?? replay?.clips?.[0]?.playbackUrl;

  const teamAbbrevs = `${pbp.awayTeam.abbrev} @ ${pbp.homeTeam.abbrev}`;
  const scoreLine = `${pbp.awayTeam.abbrev} ${pbp.awayTeam.score} - ${pbp.homeTeam.abbrev} ${pbp.homeTeam.score}`;

  let description = `**Most recent goal:** ${scorerName} (${time} ${period})`;
  if (spoilerMode !== 'off') {
    description += `\n${wrapScore(scoreLine, spoilerMode)}`;
  } else {
    description += `\n${scoreLine}`;
  }

  if (replayUrl) {
    description += `\n\n[Watch Replay](${replayUrl})`;
  } else {
    description += `\n\nReplay unavailable. [View on NHL.com](${gamecenterWebUrl(targetGame.id)})`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Replay - ${teamAbbrevs}`)
    .setDescription(description)
    .setColor(0x006847);

  await interaction.editReply({ embeds: [embed] });
}
