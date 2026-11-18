import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
  logLevel: string;
  databasePath: string | undefined;
  /** Ask Tusky's LLM fallback (Claude Haiku). Unset = presets and live data only. */
  anthropicApiKey: string | undefined;
  askUserDailyCap: number;
  askGuildDailyCap: number;
}

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    discordToken: requireEnv('DISCORD_TOKEN'),
    discordClientId: requireEnv('DISCORD_CLIENT_ID'),
    discordGuildId: process.env.DISCORD_GUILD_ID,
    logLevel: process.env.LOG_LEVEL || 'info',
    databasePath: process.env.DATABASE_PATH,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    askUserDailyCap: intEnv('ASK_USER_DAILY_CAP', 20),
    askGuildDailyCap: intEnv('ASK_GUILD_DAILY_CAP', 300),
  };
}
