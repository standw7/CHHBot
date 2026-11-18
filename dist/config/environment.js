"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function intEnv(name, fallback) {
    const n = parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function loadConfig() {
    return {
        discordToken: requireEnv('DISCORD_TOKEN'),
        discordClientId: requireEnv('DISCORD_CLIENT_ID'),
        discordGuildId: process.env.DISCORD_GUILD_ID,
        logLevel: process.env.LOG_LEVEL || 'info',
        databasePath: process.env.DATABASE_PATH,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
        askUserDailyCap: intEnv('ASK_USER_DAILY_CAP', 20),
        askGuildDailyCap: intEnv('ASK_GUILD_DAILY_CAP', 300),
        askSearchDailyCap: intEnv('ASK_SEARCH_DAILY_CAP', 15),
    };
}
//# sourceMappingURL=environment.js.map