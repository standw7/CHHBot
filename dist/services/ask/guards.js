"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNCAPPED_PERMISSIONS = exports.Cooldown = exports.ASK_ZONE = exports.ASK_COOLDOWN_MS = void 0;
exports.checkCaps = checkCaps;
exports.isCapExempt = isCapExempt;
exports.askDay = askDay;
exports.todayLong = todayLong;
const luxon_1 = require("luxon");
exports.ASK_COOLDOWN_MS = 5000;
exports.ASK_ZONE = 'America/Denver';
/** In-memory per-user cooldown. `tryAcquire` returns false while the user is cooling down. */
class Cooldown {
    ms;
    last = new Map();
    constructor(ms = exports.ASK_COOLDOWN_MS) {
        this.ms = ms;
    }
    tryAcquire(userId, now = Date.now()) {
        const prev = this.last.get(userId);
        if (prev !== undefined && now - prev < this.ms)
            return false;
        this.last.set(userId, now);
        if (this.last.size > 500)
            this.prune(now);
        return true;
    }
    prune(now = Date.now()) {
        for (const [id, t] of this.last)
            if (now - t >= this.ms)
                this.last.delete(id);
    }
    get size() {
        return this.last.size;
    }
}
exports.Cooldown = Cooldown;
/** Daily LLM caps: usage = LLM calls already made today. A cap of 0 disables the LLM. */
function checkCaps(usage, limits) {
    if (usage.guild >= limits.guild)
        return { ok: false, scope: 'guild' };
    if (usage.user >= limits.user)
        return { ok: false, scope: 'user' };
    return { ok: true };
}
/** Mod-level permissions that lift the daily caps (Discord permission flag names). */
exports.UNCAPPED_PERMISSIONS = ['Administrator', 'ManageGuild', 'ManageMessages', 'ModerateMembers'];
/**
 * Mods and the Clean Hits Crew have no daily cap (the per-user cooldown still applies).
 * Pure: takes the member's permission check and role names so it's unit tested directly.
 */
function isCapExempt(hasPermission, roleNames, crewRoleName) {
    if (exports.UNCAPPED_PERMISSIONS.some(flag => hasPermission(flag)))
        return true;
    const crew = crewRoleName.toLowerCase();
    return roleNames.some(name => name.toLowerCase() === crew);
}
/** The cap "day" (YYYY-MM-DD in America/Denver). */
function askDay(now = new Date()) {
    return luxon_1.DateTime.fromJSDate(now).setZone(exports.ASK_ZONE).toISODate() ?? now.toISOString().slice(0, 10);
}
/** "Tuesday, November 17, 2026" in America/Denver (goes in the LLM user turn). */
function todayLong(now = new Date()) {
    return luxon_1.DateTime.fromJSDate(now).setZone(exports.ASK_ZONE).toFormat('cccc, LLLL d, yyyy');
}
//# sourceMappingURL=guards.js.map