import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
  logLevel: string;
  databasePath: string | undefined;
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
  };
}
