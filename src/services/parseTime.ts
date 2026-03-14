import { DateTime } from 'luxon';

export interface ParsedTime {
  date: DateTime;
  relative: string;
}

const RELATIVE_RE = /^(?:(?:(\d+)\s*d(?:ays?)?)?[\s,]*(?:(\d+)\s*h(?:(?:ou)?rs?)?)?[\s,]*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?[\s,]*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?)$/i;

export function parseTime(input: string, timezone: string): ParsedTime | null {
  const now = DateTime.now().setZone(timezone);

  // --- Relative: 30s, 5m, 2h, 1d, 1h30m, etc ---
  const relMatch = input.match(RELATIVE_RE);
  if (relMatch && (relMatch[1] || relMatch[2] || relMatch[3] || relMatch[4])) {
    const days = parseInt(relMatch[1] || '0', 10);
    const hours = parseInt(relMatch[2] || '0', 10);
    const minutes = parseInt(relMatch[3] || '0', 10);
    const seconds = parseInt(relMatch[4] || '0', 10);
    const totalMs = ((days * 86400) + (hours * 3600) + (minutes * 60) + seconds) * 1000;
    if (totalMs <= 0) return null;
    const date = now.plus({ days, hours, minutes, seconds });
    return { date, relative: formatRelative(totalMs) };
  }

  // --- "tomorrow" with optional time ---
  const tomorrowMatch = input.match(/^tomorrow(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (tomorrowMatch) {
    let tomorrow = now.plus({ days: 1 });
    if (tomorrowMatch[1]) {
      let hour = parseInt(tomorrowMatch[1], 10);
      const min = parseInt(tomorrowMatch[2] || '0', 10);
      const ampm = tomorrowMatch[3]?.toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      tomorrow = tomorrow.set({ hour, minute: min, second: 0, millisecond: 0 });
    } else {
      tomorrow = tomorrow.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    }
    return { date: tomorrow, relative: `tomorrow at ${tomorrow.toFormat('h:mm a')}` };
  }

  // --- Absolute: "3/18 8pm", "Mar 18 8pm", "3/18/26 8pm" ---
  const absNumMatch = input.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (absNumMatch) {
    const month = parseInt(absNumMatch[1], 10);
    const day = parseInt(absNumMatch[2], 10);
    let year = absNumMatch[3] ? parseInt(absNumMatch[3], 10) : now.year;
    if (year < 100) year += 2000;
    let hour = parseInt(absNumMatch[4], 10);
    const min = parseInt(absNumMatch[5] || '0', 10);
    const ampm = absNumMatch[6].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const date = DateTime.fromObject({ year, month, day, hour, minute: min, second: 0 }, { zone: timezone });
    if (!date.isValid) return null;
    return { date, relative: date.toFormat('MMM d \'at\' h:mm a') };
  }

  const absNameMatch = input.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (absNameMatch) {
    const monthStr = absNameMatch[1].toLowerCase();
    const monthMap: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const month = monthMap[monthStr];
    const day = parseInt(absNameMatch[2], 10);
    let hour = parseInt(absNameMatch[3], 10);
    const min = parseInt(absNameMatch[4] || '0', 10);
    const ampm = absNameMatch[5].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const date = DateTime.fromObject({ year: now.year, month, day, hour, minute: min, second: 0 }, { zone: timezone });
    if (!date.isValid) return null;
    return { date, relative: date.toFormat('MMM d \'at\' h:mm a') };
  }

  return null;
}

function formatRelative(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `in ${seconds} second${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0 ? `in ${hours}h ${remMin}m` : `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days} day${days !== 1 ? 's' : ''}`;
}
