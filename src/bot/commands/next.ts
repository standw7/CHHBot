import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../../db/queries.js';
import { lookupNextGame } from '../../services/teamLookups.js';

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

  const result = await lookupNextGame(teamCode, timezone);
  if (result.kind === 'no_schedule') {
    await interaction.editReply('No upcoming games found for this season.');
    return;
  }
  if (result.kind === 'none') {
    await interaction.editReply('No upcoming games found. The season may be over or on a break.');
    return;
  }
  await interaction.editReply({ embeds: [result.embed] });
}
