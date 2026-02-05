"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const environment_js_1 = require("./config/environment.js");
const database_js_1 = require("./db/database.js");
const client_js_1 = require("./bot/client.js");
const messageCreate_js_1 = require("./bot/events/messageCreate.js");
const reactionAdd_js_1 = require("./bot/events/reactionAdd.js");
const gameTracker_js_1 = require("./services/gameTracker.js");
const linkFixer_js_1 = require("./bot/events/linkFixer.js");
const feedWatcher_js_1 = require("./services/feedWatcher.js");
const queries_js_1 = require("./db/queries.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({
    name: 'tusky',
    level: process.env.LOG_LEVEL || 'info',
});
async function main() {
    logger.info('Starting Tusky...');
    // Load config
    const config = (0, environment_js_1.loadConfig)();
    // Initialize database
    (0, database_js_1.getDb)();
    logger.info('Database initialized');
    // Register slash commands
    await (0, client_js_1.registerCommands)(config);
    logger.info('Slash commands registered');
    // Create Discord client
    const client = (0, client_js_1.createClient)();
    // Register event handlers
    (0, messageCreate_js_1.registerMessageHandler)(client);
    (0, reactionAdd_js_1.registerReactionHandler)(client);
    (0, linkFixer_js_1.registerLinkFixer)(client);
    // When bot is ready, start game trackers for all configured guilds
    client.once('ready', () => {
        logger.info({ user: client.user?.tag }, 'Tusky is online!');
        // Start feed watcher
        (0, feedWatcher_js_1.startFeedWatcher)(client);
        // Ensure config exists for all guilds the bot is in, then start trackers
        for (const [guildId] of client.guilds.cache) {
            let guildConfig = (0, queries_js_1.getGuildConfig)(guildId);
            if (!guildConfig) {
                (0, queries_js_1.upsertGuildConfig)(guildId, {});
                guildConfig = (0, queries_js_1.getGuildConfig)(guildId);
                logger.info({ guildId }, 'Created default config for existing guild');
            }
            if (guildConfig.gameday_channel_id) {
                (0, gameTracker_js_1.startTracker)(client, guildId);
            }
            else {
                logger.info({ guildId }, 'No gameday channel configured, skipping tracker');
            }
        }
    });
    // Handle new guild joins - auto-create config
    client.on('guildCreate', guild => {
        logger.info({ guildId: guild.id, guildName: guild.name }, 'Joined new guild');
        const existing = (0, queries_js_1.getGuildConfig)(guild.id);
        if (!existing) {
            (0, queries_js_1.upsertGuildConfig)(guild.id, {});
            logger.info({ guildId: guild.id }, 'Created default config for new guild');
        }
    });
    // Graceful shutdown
    const shutdown = async () => {
        logger.info('Shutting down...');
        (0, gameTracker_js_1.stopAllTrackers)();
        (0, feedWatcher_js_1.stopFeedWatcher)();
        client.destroy();
        (0, database_js_1.closeDb)();
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
    logger.fatal({ err: error }, 'Failed to start Tusky');
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map