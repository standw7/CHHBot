import { EmbedBuilder } from 'discord.js';
import { getSchedule } from '../nhl/client.js';
import pino from 'pino';

const logger = pino({ name: 'game-stats' });

// Boxscore player stats from NHL API
interface BoxscorePlayer {
  playerId: number;
  sweaterNumber: number;
  name: { default: string };
  position: string;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  hits: number;
  powerPlayGoals: number;
  sog: number;
  faceoffWinningPctg: number;
  toi: string; // "MM:SS"
  blockedShots: number;
  shifts: number;
  giveaways: number;
  takeaways: number;
}

interface BoxscoreResponse {
  homeTeam: { abbrev: string };
  awayTeam: { abbrev: string };
  playerByGameStats: {
    homeTeam: {
      forwards: BoxscorePlayer[];
      defense: BoxscorePlayer[];
      goalies: BoxscorePlayer[];
    };
    awayTeam: {
      forwards: BoxscorePlayer[];
      defense: BoxscorePlayer[];
      goalies: BoxscorePlayer[];
    };
  };
}

interface GameStatCategory {
  key: string;
  label: string;
  abbrev: string;
  field: keyof BoxscorePlayer;
  format?: (value: number | string) => string;
}

function formatToiString(toi: string): string {
  return toi; // Already in MM:SS format
}

function formatPlusMinus(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatPctg(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

const GAME_STAT_CATEGORIES: GameStatCategory[] = [
  { key: 'goals', label: 'Goal', abbrev: 'G', field: 'goals' },
  { key: 'assists', label: 'Assist', abbrev: 'A', field: 'assists' },
  { key: 'points', label: 'Point', abbrev: 'P', field: 'points' },
  { key: 'plusminus', label: '+/-', abbrev: '+/-', field: 'plusMinus', format: (v) => formatPlusMinus(v as number) },
  { key: 'pim', label: 'Penalty Minute', abbrev: 'PIM', field: 'pim' },
  { key: 'hits', label: 'Hit', abbrev: 'HIT', field: 'hits' },
  { key: 'shots', label: 'Shot', abbrev: 'SOG', field: 'sog' },
  { key: 'blocks', label: 'Blocked Shot', abbrev: 'BLK', field: 'blockedShots' },
  { key: 'takeaways', label: 'Takeaway', abbrev: 'TK', field: 'takeaways' },
  { key: 'giveaways', label: 'Giveaway', abbrev: 'GV', field: 'giveaways' },
  { key: 'toi', label: 'Time on Ice', abbrev: 'TOI', field: 'toi', format: (v) => formatToiString(v as string) },
  { key: 'faceoffpct', label: 'Faceoff %', abbrev: 'FO%', field: 'faceoffWinningPctg', format: (v) => formatPctg(v as number) },
  { key: 'ppg', label: 'Power Play Goal', abbrev: 'PPG', field: 'powerPlayGoals' },
];

// Date parsing - supports multiple formats
function parseGameDate(input: string): string | null {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Try MM/DD/YY or MM/DD/YYYY
  let match = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const month = match[1].padStart(2, '0');
    const day = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) {
      year = '20' + year;
    }
    return `${year}-${month}-${day}`;
  }

  // Try MM-DD-YY or MM-DD-YYYY
  match = input.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (match) {
    const month = match[1].padStart(2, '0');
    const day = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) {
      year = '20' + year;
    }
    return `${year}-${month}-${day}`;
  }

  // Try "Jan 5" or "January 5" style
  const months: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };

  match = input.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (match) {
    const monthKey = match[1].toLowerCase().slice(0, 3);
    const month = months[monthKey];
    const day = match[2].padStart(2, '0');
    // Assume current season year logic
    const year = currentYear;
    return `${year}-${month}-${day}`;
  }

  return null;
}

// Extract date from query
export function extractDateFromQuery(query: string): { date: string; statQuery: string } | null {
  // Common patterns: "on 02/02/26", "on Feb 2", "02/02/26", "against VAN on 02/02"

  // Pattern: "on DATE"
  let match = query.match(/\bon\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (match) {
    const date = parseGameDate(match[1]);
    if (date) {
      const statQuery = query.replace(match[0], '').trim();
      return { date, statQuery };
    }
  }

  // Pattern: "on Month Day"
  match = query.match(/\bon\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?)/i);
  if (match) {
    const date = parseGameDate(match[1]);
    if (date) {
      const statQuery = query.replace(match[0], '').trim();
      return { date, statQuery };
    }
  }

  // Pattern: bare date at end "goals 02/02/26"
  match = query.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})$/);
  if (match) {
    const date = parseGameDate(match[1]);
    if (date) {
      const statQuery = query.replace(match[0], '').trim();
      return { date, statQuery };
    }
  }

  return null;
}

// Find game ID for a date
async function findGameIdForDate(teamCode: string, dateStr: string): Promise<number | null> {
  const schedule = await getSchedule(teamCode);
  if (!schedule?.games) return null;

  for (const game of schedule.games) {
    if (game.gameDate === dateStr) {
      return game.id;
    }
  }
  return null;
}

// Fetch boxscore
async function fetchBoxscore(gameId: number): Promise<BoxscoreResponse | null> {
  try {
    const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
    });
    if (!response.ok) {
      logger.warn({ gameId, status: response.status }, 'Boxscore fetch failed');
      return null;
    }
    return await response.json() as BoxscoreResponse;
  } catch (error) {
    logger.error({ error, gameId }, 'Boxscore fetch error');
    return null;
  }
}

// Match stat keyword for game stats
function matchGameStatCategory(input: string): GameStatCategory | null {
  const lower = input.toLowerCase().trim();

  const mappings: { keywords: string[]; key: string }[] = [
    { keywords: ['goals', 'goal'], key: 'goals' },
    { keywords: ['assists', 'assist'], key: 'assists' },
    { keywords: ['points', 'pts'], key: 'points' },
    { keywords: ['plus-minus', 'plus minus', '+/-', 'plusminus'], key: 'plusminus' },
    { keywords: ['penalty minutes', 'pim', 'penalties'], key: 'pim' },
    { keywords: ['hits', 'hit'], key: 'hits' },
    { keywords: ['shots', 'shot', 'sog'], key: 'shots' },
    { keywords: ['blocked shots', 'blocks', 'blk'], key: 'blocks' },
    { keywords: ['takeaways', 'takeaway', 'tk'], key: 'takeaways' },
    { keywords: ['giveaways', 'giveaway', 'gv'], key: 'giveaways' },
    { keywords: ['time on ice', 'toi', 'ice time', 'minutes'], key: 'toi' },
    { keywords: ['faceoff', 'faceoffs', 'fo%'], key: 'faceoffpct' },
    { keywords: ['power play goals', 'ppg'], key: 'ppg' },
  ];

  for (const mapping of mappings) {
    for (const keyword of mapping.keywords) {
      if (lower.includes(keyword)) {
        return GAME_STAT_CATEGORIES.find(c => c.key === mapping.key) ?? null;
      }
    }
  }

  return null;
}

// Convert TOI string to seconds for sorting
function toiToSeconds(toi: string): number {
  const parts = toi.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

const MEDALS = ['🥇', '🥈', '🥉'];

export async function buildGameStatsEmbed(
  teamCode: string,
  dateStr: string,
  statQuery: string
): Promise<EmbedBuilder> {
  // Find game
  const gameId = await findGameIdForDate(teamCode, dateStr);
  if (!gameId) {
    return new EmbedBuilder()
      .setTitle('Game Not Found')
      .setDescription(`No game found for ${teamCode} on ${dateStr}.`)
      .setColor(0xff6600);
  }

  // Fetch boxscore
  const boxscore = await fetchBoxscore(gameId);
  if (!boxscore) {
    return new EmbedBuilder()
      .setTitle('Stats Unavailable')
      .setDescription('Could not fetch game stats from the NHL API.')
      .setColor(0xff0000);
  }

  // Determine which team's players to show
  const isHome = boxscore.homeTeam.abbrev === teamCode;
  const teamStats = isHome
    ? boxscore.playerByGameStats.homeTeam
    : boxscore.playerByGameStats.awayTeam;
  const opponent = isHome ? boxscore.awayTeam.abbrev : boxscore.homeTeam.abbrev;

  // Get all skaters (forwards + defense)
  const allPlayers = [...teamStats.forwards, ...teamStats.defense];

  // Match stat category
  const category = matchGameStatCategory(statQuery);
  if (!category) {
    return new EmbedBuilder()
      .setTitle('Stat Not Supported')
      .setDescription(
        `Couldn't find a stat matching "${statQuery}" for game stats.\n\n` +
        '**Available game stats:**\n' +
        'goals, assists, points, +/-, PIM, hits, shots, blocks, takeaways, giveaways, TOI, faceoff%, PPG'
      )
      .setColor(0xff6600);
  }

  // Sort players by stat
  const sorted = [...allPlayers].sort((a, b) => {
    const aVal = a[category.field];
    const bVal = b[category.field];

    // Special handling for TOI (string format)
    if (category.field === 'toi') {
      return toiToSeconds(bVal as string) - toiToSeconds(aVal as string);
    }

    return (bVal as number) - (aVal as number);
  });

  const top5 = sorted.slice(0, 5);
  const format = category.format ?? ((v: number | string) => `${v}`);

  const lines = top5.map((player, i) => {
    const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`;
    const name = player.name.default;
    const pos = player.position;
    const val = format(player[category.field] as number | string);
    return `${prefix} **${name}** (${pos}) - **${val}** ${category.abbrev}`;
  });

  // Format date for display
  const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return new EmbedBuilder()
    .setTitle(`${teamCode} ${category.label} Leaders vs ${opponent}`)
    .setDescription(lines.join('\n'))
    .setColor(0x006847)
    .setFooter({ text: displayDate });
}
