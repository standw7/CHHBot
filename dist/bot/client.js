"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = createClient;
exports.registerCommands = registerCommands;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const nextCmd = __importStar(require("./commands/next.js"));
const watchCmd = __importStar(require("./commands/watch.js"));
const replayCmd = __importStar(require("./commands/replay.js"));
const gifCmd = __importStar(require("./commands/gif.js"));
const configCmd = __importStar(require("./commands/config.js"));
const statsCmd = __importStar(require("./commands/stats.js"));
const logger = (0, pino_1.default)({ name: 'discord-client' });
const commands = [
    nextCmd,
    watchCmd,
    replayCmd,
    gifCmd,
    configCmd,
    statsCmd,
];
function createClient() {
    const client = new discord_js_1.Client({
        intents: [
            discord_js_1.GatewayIntentBits.Guilds,
            discord_js_1.GatewayIntentBits.GuildMessages,
            discord_js_1.GatewayIntentBits.GuildMessageReactions,
            discord_js_1.GatewayIntentBits.MessageContent,
        ],
        partials: [
            discord_js_1.Partials.Message,
            discord_js_1.Partials.Reaction,
        ],
    });
    const commandCollection = new discord_js_1.Collection();
    for (const cmd of commands) {
        commandCollection.set(cmd.data.name, cmd);
    }
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand())
            return;
        const command = commandCollection.get(interaction.commandName);
        if (!command)
            return;
        try {
            await command.execute(interaction);
        }
        catch (error) {
            logger.error({ error, command: interaction.commandName }, 'Command execution error');
            const reply = { content: 'Something went wrong executing that command.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            }
            else {
                await interaction.reply(reply);
            }
        }
    });
    return client;
}
async function registerCommands(config) {
    const rest = new discord_js_1.REST({ version: '10' }).setToken(config.discordToken);
    const commandData = commands.map(c => c.data.toJSON());
    try {
        if (config.discordGuildId) {
            // Guild commands update instantly (good for development)
            await rest.put(discord_js_1.Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), { body: commandData });
            logger.info({ guildId: config.discordGuildId }, 'Registered guild slash commands');
        }
        else {
            // Global commands can take up to an hour to propagate
            await rest.put(discord_js_1.Routes.applicationCommands(config.discordClientId), { body: commandData });
            logger.info('Registered global slash commands');
        }
    }
    catch (error) {
        logger.error({ error }, 'Failed to register slash commands');
        throw error;
    }
}
//# sourceMappingURL=client.js.map