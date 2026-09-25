import { ActivityType, Client } from 'discord.js';
import { DateTime } from 'luxon';
import pino from 'pino';

const logger = pino({ name: 'presence' });

export interface LiveStatusInput {
  teamCode: string;
  homeTeam: { abbrev: string; score: number };
  awayTeam: { abbrev: string; score: number };
  periodDescriptor?: { number: number; periodType: string; maxRegulationPeriods?: number };
  period?: number;
  clock: { timeRemaining: string; inIntermission: boolean };
}

const ORDINALS = ['1st', '2nd', '3rd'];

function periodLabel(input: LiveStatusInput): string {
  const number = input.periodDescriptor?.number ?? input.period ?? 1;
  const maxReg = input.periodDescriptor?.maxRegulationPeriods ?? 3;
  const type = input.periodDescriptor?.periodType ?? (number > maxReg ? 'OT' : 'REG');
  if (type === 'SO') return 'SO';
  if (type === 'OT') {
    const otNumber = number - maxReg;
    return otNumber > 1 ? `${otNumber}OT` : 'OT';
  }
  return ORDINALS[number - 1] ?? `${number}th`;
}

/** e.g. "UTA 2-1 EDM · 2nd 12:34" — our team always listed first. */
export function formatLiveStatus(input: LiveStatusInput): string {
  const ourHome = input.homeTeam.abbrev === input.teamCode;
  const us = ourHome ? input.homeTeam : input.awayTeam;
  const them = ourHome ? input.awayTeam : input.homeTeam;
  const score = `${us.abbrev} ${us.score}-${them.score} ${them.abbrev}`;

  const period = periodLabel(input);
  if (period === 'SO') return `${score} · SO`;
  if (input.clock.inIntermission) return `${score} · ${period} INT`;
  const clock = input.clock.timeRemaining.replace(/^0(\d:)/, '$1');
  return `${score} · ${period} ${clock}`;
}

/** e.g. "Next: vs EDM · Sat 7:00 PM MT" (home) or "Next: @ VGK · …" (away). */
export function formatNextGameStatus(
  teamCode: string,
  homeTeam: { abbrev: string },
  awayTeam: { abbrev: string },
  startTimeUTC: string,
  zone: string
): string {
  const ourHome = homeTeam.abbrev === teamCode;
  const opponent = ourHome ? `vs ${awayTeam.abbrev}` : `@ ${homeTeam.abbrev}`;
  const start = DateTime.fromISO(startTimeUTC, { zone: 'utc' }).setZone(zone);
  // MDT/MST → MT so the label doesn't flip with daylight saving
  const tz = start.offsetNameShort?.replace(/^([A-Z])[SD]T$/, '$1T') ?? '';
  return `Next: ${opponent} · ${start.toFormat('ccc h:mm a')} ${tz}`.trim();
}

// A bot has one presence across all guilds; only send when the text changes.
let lastStatus: string | null = null;

export function setStatus(client: Client, text: string | null): void {
  if (text === lastStatus || !client.user) return;
  lastStatus = text;
  if (text) {
    client.user.setActivity({ name: 'Custom Status', type: ActivityType.Custom, state: text });
  } else {
    client.user.setPresence({ activities: [] });
  }
  logger.debug({ text }, 'Status updated');
}
