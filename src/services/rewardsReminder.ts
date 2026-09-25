import { ChannelType, Client, Guild, PermissionFlagsBits, Role, TextChannel } from 'discord.js';
import pino from 'pino';
import { getGuildConfig, upsertGuildConfig, getRewardsSchedule, saveRewardsSchedule } from '../db/queries.js';

const logger = pino({ name: 'rewards-reminder' });

export const REWARDS_ROLE_NAME = 'Rewards';
export const REWARDS_CHANNEL_NAME = 'rewards';

// How often to re-ping the Rewards role while a game is live.
export const REWARDS_PING_INTERVAL_MS = 45 * 60_000;

export interface RewardsSchedule {
  anchorAt: number; // ms timestamp treated as 0:00 for the 45-minute marks
  lastSlot: number; // last mark already handled (-1 = none); mark n is at anchorAt + n * interval
}

/**
 * Starting schedule for a game with no pings recorded yet.
 * Watched from the start: 0:00 is now (puck drop), and mark 0 pings immediately.
 * Joined late (bot restarted mid-game): 0:00 is the scheduled start and marks
 * already passed are skipped, so the next ping waits for the next mark.
 */
export function initialRewardsSchedule(watchedFromStart: boolean, scheduledStart: number, now: number): RewardsSchedule {
  if (watchedFromStart) return { anchorAt: now, lastSlot: -1 };
  return { anchorAt: scheduledStart, lastSlot: Math.floor((now - scheduledStart) / REWARDS_PING_INTERVAL_MS) };
}

/**
 * Returns the mark to ping now, or null if none is due. If several marks passed
 * (e.g. during downtime) only the latest is returned, so it pings once.
 * Callers only invoke this while the game is LIVE, so nothing fires after FINAL.
 */
export function dueRewardsSlot(schedule: RewardsSchedule, now: number): number | null {
  const current = Math.floor((now - schedule.anchorAt) / REWARDS_PING_INTERVAL_MS);
  return current > schedule.lastSlot ? current : null;
}

/**
 * Find the Rewards role (saved ID first, then by name, case-insensitive).
 * With `create`, makes the role if it doesn't exist. Saves the ID to guild config.
 */
export async function resolveRewardsRole(guild: Guild, create: boolean): Promise<Role | null> {
  const config = getGuildConfig(guild.id);
  let role = config?.rewards_role_id ? guild.roles.cache.get(config.rewards_role_id) ?? null : null;
  role ??= guild.roles.cache.find(r => r.name.toLowerCase() === REWARDS_ROLE_NAME.toLowerCase()) ?? null;

  if (!role && create) {
    role = await guild.roles.create({
      name: REWARDS_ROLE_NAME,
      mentionable: true,
      reason: 'Created for rewards check-in reminders',
    });
    logger.info({ guildId: guild.id, roleId: role.id }, 'Created Rewards role');
  }

  if (role && !role.mentionable) {
    logger.warn({ guildId: guild.id, roleId: role.id }, 'Rewards role is not mentionable; pings only work if the bot has Mention Everyone');
  }
  if (role && config?.rewards_role_id !== role.id) {
    upsertGuildConfig(guild.id, { rewards_role_id: role.id });
  }
  return role;
}

/**
 * Find the #rewards channel (saved ID first, then by name). If missing, creates it
 * visible only to the Rewards role and the bot. An existing channel is used as-is.
 */
export async function resolveRewardsChannel(guild: Guild, role: Role): Promise<TextChannel | null> {
  const config = getGuildConfig(guild.id);
  let channel = config?.rewards_channel_id ? guild.channels.cache.get(config.rewards_channel_id) : undefined;
  channel ??= guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.name.toLowerCase() === REWARDS_CHANNEL_NAME
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: REWARDS_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: 'Check-in reminders during games. Use !rewards to opt in or out.',
      reason: 'Created for rewards check-in reminders',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    logger.info({ guildId: guild.id, channelId: channel.id }, 'Created #rewards channel');
  }

  if (channel.type !== ChannelType.GuildText) return null;
  if (config?.rewards_channel_id !== channel.id) {
    upsertGuildConfig(guild.id, { rewards_channel_id: channel.id });
  }
  return channel;
}

/**
 * Called on every LIVE tick. Pings the Rewards role in #rewards at each 45-minute
 * mark (see initialRewardsSchedule for where 0:00 is). The schedule is persisted
 * per game so a bot restart resumes it instead of re-pinging.
 */
export async function maybeSendRewardsReminder(
  client: Client,
  guildId: string,
  gameId: number,
  watchedFromStart: boolean,
  scheduledStart: number
): Promise<void> {
  const now = Date.now();
  let schedule = getRewardsSchedule(guildId, gameId);
  if (!schedule) {
    schedule = initialRewardsSchedule(watchedFromStart, scheduledStart, now);
    saveRewardsSchedule(guildId, gameId, schedule);
    logger.info({ guildId, gameId, watchedFromStart, ...schedule }, 'Rewards schedule started');
  }

  const slot = dueRewardsSlot(schedule, now);
  if (slot === null) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  // Claim the mark before any async work so a slow send can't cause a double ping
  saveRewardsSchedule(guildId, gameId, { ...schedule, lastSlot: slot });

  const text = slot === 0
    ? "🦣 Puck's dropped! Don't forget to check in to earn your points."
    : "🦣 Reminder: check in if you haven't yet to earn your points!";

  try {
    const role = await resolveRewardsRole(guild, false);
    if (!role) return;
    const channel = await resolveRewardsChannel(guild, role);
    if (!channel) {
      logger.error({ guildId }, 'Rewards channel is not a text channel');
      return;
    }
    await channel.send(`<@&${role.id}> ${text}`);
    logger.info({ guildId, gameId, slot }, 'Rewards reminder posted');
  } catch (error) {
    logger.error({ error, guildId, gameId }, 'Failed to post rewards reminder');
  }
}
