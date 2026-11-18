import { DateTime } from 'luxon';

export const ASK_COOLDOWN_MS = 5000;
export const ASK_ZONE = 'America/Denver';

/** In-memory per-user cooldown. `tryAcquire` returns false while the user is cooling down. */
export class Cooldown {
  private last = new Map<string, number>();
  constructor(private readonly ms: number = ASK_COOLDOWN_MS) {}

  tryAcquire(userId: string, now: number = Date.now()): boolean {
    const prev = this.last.get(userId);
    if (prev !== undefined && now - prev < this.ms) return false;
    this.last.set(userId, now);
    if (this.last.size > 500) this.prune(now);
    return true;
  }

  prune(now: number = Date.now()): void {
    for (const [id, t] of this.last) if (now - t >= this.ms) this.last.delete(id);
  }

  get size(): number {
    return this.last.size;
  }
}

export interface CapLimits {
  user: number;
  guild: number;
}

export type CapDecision = { ok: true } | { ok: false; scope: 'user' | 'guild' };

/** Daily LLM caps: usage = LLM calls already made today. A cap of 0 disables the LLM. */
export function checkCaps(usage: { user: number; guild: number }, limits: CapLimits): CapDecision {
  if (usage.guild >= limits.guild) return { ok: false, scope: 'guild' };
  if (usage.user >= limits.user) return { ok: false, scope: 'user' };
  return { ok: true };
}

/** Mod-level permissions that lift the daily caps (Discord permission flag names). */
export const UNCAPPED_PERMISSIONS = ['Administrator', 'ManageGuild', 'ManageMessages', 'ModerateMembers'] as const;

/**
 * Mods and the Clean Hits Crew have no daily cap (the per-user cooldown still applies).
 * Pure: takes the member's permission check and role names so it's unit tested directly.
 */
export function isCapExempt(
  hasPermission: (flag: (typeof UNCAPPED_PERMISSIONS)[number]) => boolean,
  roleNames: string[],
  crewRoleName: string
): boolean {
  if (UNCAPPED_PERMISSIONS.some(flag => hasPermission(flag))) return true;
  const crew = crewRoleName.toLowerCase();
  return roleNames.some(name => name.toLowerCase() === crew);
}

/** The cap "day" (YYYY-MM-DD in America/Denver). */
export function askDay(now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(ASK_ZONE).toISODate() ?? now.toISOString().slice(0, 10);
}

/** "Tuesday, November 17, 2026" in America/Denver (goes in the LLM user turn). */
export function todayLong(now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(ASK_ZONE).toFormat('cccc, LLLL d, yyyy');
}
