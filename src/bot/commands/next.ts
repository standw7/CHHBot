import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import * as nhlClient from '../../nhl/client.js';
import { gamecenterWebUrl } from '../../nhl/endpoints.js';
import { getGuildConfig } from '../../db/queries.js';

export const data = new SlashCommandBuilder()
  .setName('next')
  .setDescription('Show the next scheduled game');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const timezone = config?.timezone ?? 'America/Denver';

  await interaction.deferReply();

  const schedule = await nhlClient.getSchedule(teamCode);
  if (!schedule || !schedule.games || schedule.games.length === 0) {
    await interaction.editReply('No upcoming games found for this season.');
    return;
  }

  const now = new Date();
  const nextGame = schedule.games.find(g => {
    const gameDate = new Date(g.startTimeUTC);
    return gameDate > now && (g.gameState === 'FUT' || g.gameState === 'PRE');
  });

  if (!nextGame) {
    await interaction.editReply('No upcoming games found. The season may be over or on a break.');
    return;
  }

  const gameDate = new Date(nextGame.startTimeUTC);
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = gameDate.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });

  const isHome = nextGame.homeTeam.abbrev === teamCode;
  const opponent = isHome ? nextGame.awayTeam : nextGame.homeTeam;
  const locationText = isHome ? 'Home' : 'Away';

  const embed = new EmbedBuilder()
    .setTitle('Next Game')
    .setDescription(`**${nextGame.awayTeam.abbrev}** @ **${nextGame.homeTeam.abbrev}**`)
    .addFields(
      { name: 'Opponent', value: opponent.abbrev, inline: true },
      { name: 'Location', value: locationText, inline: true },
      { name: 'Date', value: formattedDate, inline: true },
      { name: 'Time', value: formattedTime, inline: true },
    )
    .setURL(gamecenterWebUrl(nextGame.id))
    .setColor(0x006847);

  if (nextGame.venue?.default) {
    embed.addFields({ name: 'Venue', value: nextGame.venue.default, inline: true });
  }

  const teamLogo = isHome ? nextGame.homeTeam.logo : nextGame.awayTeam.logo;
  if (teamLogo) {
    embed.setThumbnail(teamLogo);
  }

  await interaction.editReply({ embeds: [embed] });
}
