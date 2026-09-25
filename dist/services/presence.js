"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatLiveStatus = formatLiveStatus;
exports.formatNextGameStatus = formatNextGameStatus;
exports.setStatus = setStatus;
const discord_js_1 = require("discord.js");
const luxon_1 = require("luxon");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'presence' });
const ORDINALS = ['1st', '2nd', '3rd'];
function periodLabel(input) {
    const number = input.periodDescriptor?.number ?? input.period ?? 1;
    const maxReg = input.periodDescriptor?.maxRegulationPeriods ?? 3;
    const type = input.periodDescriptor?.periodType ?? (number > maxReg ? 'OT' : 'REG');
    if (type === 'SO')
        return 'SO';
    if (type === 'OT') {
        const otNumber = number - maxReg;
        return otNumber > 1 ? `${otNumber}OT` : 'OT';
    }
    return ORDINALS[number - 1] ?? `${number}th`;
}
/** e.g. "UTA 2-1 EDM · 2nd 12:34" — our team always listed first. */
function formatLiveStatus(input) {
    const ourHome = input.homeTeam.abbrev === input.teamCode;
    const us = ourHome ? input.homeTeam : input.awayTeam;
    const them = ourHome ? input.awayTeam : input.homeTeam;
    const score = `${us.abbrev} ${us.score}-${them.score} ${them.abbrev}`;
    const period = periodLabel(input);
    if (period === 'SO')
        return `${score} · SO`;
    if (input.clock.inIntermission)
        return `${score} · ${period} INT`;
    const clock = input.clock.timeRemaining.replace(/^0(\d:)/, '$1');
    return `${score} · ${period} ${clock}`;
}
/** e.g. "Next: vs EDM · Sat 7:00 PM MT" (home) or "Next: @ VGK · …" (away). */
function formatNextGameStatus(teamCode, homeTeam, awayTeam, startTimeUTC, zone) {
    const ourHome = homeTeam.abbrev === teamCode;
    const opponent = ourHome ? `vs ${awayTeam.abbrev}` : `@ ${homeTeam.abbrev}`;
    const start = luxon_1.DateTime.fromISO(startTimeUTC, { zone: 'utc' }).setZone(zone);
    // MDT/MST → MT so the label doesn't flip with daylight saving
    const tz = start.offsetNameShort?.replace(/^([A-Z])[SD]T$/, '$1T') ?? '';
    return `Next: ${opponent} · ${start.toFormat('ccc h:mm a')} ${tz}`.trim();
}
// A bot has one presence across all guilds; only send when the text changes.
let lastStatus = null;
function setStatus(client, text) {
    if (text === lastStatus || !client.user)
        return;
    lastStatus = text;
    if (text) {
        client.user.setActivity({ name: 'Custom Status', type: discord_js_1.ActivityType.Custom, state: text });
    }
    else {
        client.user.setPresence({ activities: [] });
    }
    logger.debug({ text }, 'Status updated');
}
//# sourceMappingURL=presence.js.map