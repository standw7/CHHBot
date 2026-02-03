import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import * as nhlClient from '../../nhl/client.js';
import { gamecenterWebUrl } from '../../nhl/endpoints.js';
import { getGuildConfig } from '../../db/queries.js';
import { wrapScore } from '../../services/spoiler.js';
import type { SpoilerMode } from '../../services/spoiler.js';
import type { LandingGoal } from '../../nhl/types.js';

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

  // Use landing endpoint for rich goal data (includes names, highlights)
  const landing = await nhlClient.getLanding(targetGame.id);
  if (!landing?.summary?.scoring) {
    await interaction.editReply('Could not fetch game data.');
    return;
  }

  // Find the most recent goal across all periods
  const allGoals: LandingGoal[] = [];
  for (const period of landing.summary.scoring) {
    allGoals.push(...period.goals);
  }

  if (allGoals.length === 0) {
    await interaction.editReply('No goals yet in this game.');
    return;
  }

  const lastGoal = allGoals[allGoals.length - 1];
  const scorerName = `${lastGoal.firstName.default} ${lastGoal.lastName.default}`;
  const teamAbbrev = lastGoal.teamAbbrev.default;
  const period = lastGoal.timeInPeriod;

  // Get replay URL from landing goal data or try the replay endpoint
  let replayUrl = lastGoal.highlightClipSharingUrl || lastGoal.pptReplayUrl;

  if (!replayUrl) {
    // Try the dedicated replay endpoint as fallback
    const pbp = await nhlClient.getPlayByPlay(targetGame.id);
    const pbpGoals = pbp?.plays.filter(p => p.typeDescKey === 'goal') ?? [];
    const matchingPlay = pbpGoals.find(p => p.eventId === lastGoal.eventId) ?? pbpGoals[pbpGoals.length - 1];

    if (matchingPlay?.details?.highlightClipSharingUrl) {
      replayUrl = matchingPlay.details.highlightClipSharingUrl;
    } else if (matchingPlay) {
      const replay = await nhlClient.getGoalReplay(targetGame.id, matchingPlay.eventId);
      replayUrl = replay?.topClip?.playbackUrl ?? replay?.clips?.[0]?.playbackUrl;
    }
  }

  const awayAbbrev = landing.awayTeam.abbrev;
  const homeAbbrev = landing.homeTeam.abbrev;
  const scoreLine = `${awayAbbrev} ${landing.awayTeam.score} - ${homeAbbrev} ${landing.homeTeam.score}`;

  let description = `**Most recent goal:** ${scorerName} (${teamAbbrev}) - ${period}`;
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
    .setTitle(`Replay - ${awayAbbrev} @ ${homeAbbrev}`)
    .setDescription(description)
    .setColor(0x006847);

  if (lastGoal.headshot) {
    embed.setThumbnail(lastGoal.headshot);
  }

  await interaction.editReply({ embeds: [embed] });
}
