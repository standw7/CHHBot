import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
} from 'discord.js';
import type { AppConfig } from '../config/environment.js';
import pino from 'pino';

import * as nextCmd from './commands/next.js';
import * as watchCmd from './commands/watch.js';
import * as replayCmd from './commands/replay.js';
import * as gifCmd from './commands/gif.js';
import * as configCmd from './commands/config.js';

const logger = pino({ name: 'discord-client' });

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands: Command[] = [
  nextCmd as Command,
  watchCmd as Command,
  replayCmd as Command,
  gifCmd as unknown as Command,
  configCmd as unknown as Command,
];

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [
      Partials.Message,
      Partials.Reaction,
    ],
  });

  const commandCollection = new Collection<string, Command>();
  for (const cmd of commands) {
    commandCollection.set(cmd.data.name, cmd);
  }

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandCollection.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error({ error, command: interaction.commandName }, 'Command execution error');
      const reply = { content: 'Something went wrong executing that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  });

  return client;
}

export async function registerCommands(config: AppConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const commandData = commands.map(c => c.data.toJSON());

  try {
    if (config.discordGuildId) {
      // Guild commands update instantly (good for development)
      await rest.put(
        Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
        { body: commandData },
      );
      logger.info({ guildId: config.discordGuildId }, 'Registered guild slash commands');
    } else {
      // Global commands can take up to an hour to propagate
      await rest.put(
        Routes.applicationCommands(config.discordClientId),
        { body: commandData },
      );
      logger.info('Registered global slash commands');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands');
    throw error;
  }
}
