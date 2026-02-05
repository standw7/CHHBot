import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../../db/queries.js';
import { buildStatsEmbed } from '../../services/statsLookup.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Look up team stat leaders')
  .addStringOption(opt =>
    opt.setName('category')
      .setDescription('Stat category (e.g. goals, assists, pim, save%). Defaults to points.')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const config = getGuildConfig(guildId);
  const teamCode = config?.primary_team ?? 'UTA';
  const query = interaction.options.getString('category') ?? 'points';

  await interaction.deferReply();
  const embed = await buildStatsEmbed(teamCode, query);
  await interaction.editReply({ embeds: [embed] });
}
