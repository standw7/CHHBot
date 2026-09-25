import { Client, Guild, Role, TextChannel } from 'discord.js';
export declare const REWARDS_ROLE_NAME = "Rewards";
export declare const REWARDS_CHANNEL_NAME = "rewards";
export declare const REWARDS_PING_INTERVAL_MS: number;
/**
 * Pure timing rule: a ping is due if none has been sent for this game yet,
 * or if at least REWARDS_PING_INTERVAL_MS has passed since the last one.
 * Callers only invoke this while the game is LIVE, so nothing fires after FINAL.
 */
export declare function isRewardsPingDue(lastPingAt: number | null, now: number): boolean;
/**
 * Find the Rewards role (saved ID first, then by name, case-insensitive).
 * With `create`, makes the role if it doesn't exist. Saves the ID to guild config.
 */
export declare function resolveRewardsRole(guild: Guild, create: boolean): Promise<Role | null>;
/**
 * Find the #rewards channel (saved ID first, then by name). If missing, creates it
 * visible only to the Rewards role and the bot. An existing channel is used as-is.
 */
export declare function resolveRewardsChannel(guild: Guild, role: Role): Promise<TextChannel | null>;
/**
 * Called on every LIVE tick. Pings the Rewards role in #rewards at puck drop and
 * every 45 minutes after. The last ping time is persisted per game so a bot
 * restart resumes the same schedule instead of re-pinging.
 */
export declare function maybeSendRewardsReminder(client: Client, guildId: string, gameId: number): Promise<void>;
//# sourceMappingURL=rewardsReminder.d.ts.map