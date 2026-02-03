import { loadConfig } from './config/environment.js';
import { getDb, closeDb } from './db/database.js';
import { createClient, registerCommands } from './bot/client.js';
import { registerMessageHandler } from './bot/events/messageCreate.js';
import { registerReactionHandler } from './bot/events/reactionAdd.js';
import { startTracker, stopAllTrackers } from './services/gameTracker.js';
import { getGuildConfig, upsertGuildConfig } from './db/queries.js';
import pino from 'pino';

const logger = pino({
  name: 'tusky',
  level: process.env.LOG_LEVEL || 'info',
});

async function main(): Promise<void> {
  logger.info('Starting Tusky...');

  // Load config
  const config = loadConfig();

  // Initialize database
  getDb();
  logger.info('Database initialized');

  // Register slash commands
  await registerCommands(config);
  logger.info('Slash commands registered');

  // Create Discord client
  const client = createClient();

  // Register event handlers
  registerMessageHandler(client);
  registerReactionHandler(client);

  // When bot is ready, start game trackers for all configured guilds
  client.once('ready', () => {
    logger.info({ user: client.user?.tag }, 'Tusky is online!');

    // Start game tracker for each guild the bot is in
    for (const [guildId] of client.guilds.cache) {
      const guildConfig = getGuildConfig(guildId);
      if (guildConfig?.gameday_channel_id) {
        startTracker(client, guildId);
      } else {
        logger.info({ guildId }, 'No gameday channel configured, skipping tracker');
      }
    }
  });

  // Handle new guild joins - auto-create config
  client.on('guildCreate', guild => {
    logger.info({ guildId: guild.id, guildName: guild.name }, 'Joined new guild');
    const existing = getGuildConfig(guild.id);
    if (!existing) {
      upsertGuildConfig(guild.id, {});
      logger.info({ guildId: guild.id }, 'Created default config for new guild');
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    stopAllTrackers();
    client.destroy();
    closeDb();
    logger.info('Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    shutdown();
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });

  // Login
  await client.login(config.discordToken);
}

main().catch(error => {
  logger.fatal({ error }, 'Failed to start Tusky');
  process.exit(1);
});
