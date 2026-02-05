import { EmbedBuilder } from 'discord.js';
import { getClubStats } from '../nhl/client.js';
import { getMoneyPuckSkaters, type MoneyPuckSkater } from './moneyPuck.js';
import { extractDateFromQuery, buildGameStatsEmbed } from './gameStats.js';
import type { SkaterStats, GoalieStats } from '../nhl/statsTypes.js';

// --- Stat category definitions ---

interface StatCategory {
  key: string;
  label: string;
  abbrev: string;
  type: 'skater' | 'goalie';
  field: keyof SkaterStats | keyof GoalieStats;
  sortAscending?: boolean; // default false (descending)
  format?: (value: number) => string;
}

// MoneyPuck fallback stats (not in NHL API)
interface MoneyPuckCategory {
  key: string;
  label: string;
  abbrev: string;
  field: keyof MoneyPuckSkater;
  format?: (value: number) => string;
}

function formatPctg(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

function formatToi(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPlusMinus(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatGaa(value: number): string {
  return value.toFixed(2);
}

function formatXg(value: number): string {
  return value.toFixed(1);
}

function formatRecord(goalie: GoalieStats): string {
  return `${goalie.wins}-${goalie.losses}-${goalie.overtimeLosses}`;
}

// NHL API stats
const STAT_CATEGORIES: StatCategory[] = [
  // Skater stats
  { key: 'goals', label: 'Goal', abbrev: 'G', type: 'skater', field: 'goals' },
  { key: 'assists', label: 'Assist', abbrev: 'A', type: 'skater', field: 'assists' },
  { key: 'points', label: 'Point', abbrev: 'P', type: 'skater', field: 'points' },
  { key: 'plusminus', label: '+/-', abbrev: '+/-', type: 'skater', field: 'plusMinus', format: formatPlusMinus },
  { key: 'pim', label: 'Penalty Minute', abbrev: 'PIM', type: 'skater', field: 'penaltyMinutes' },
  { key: 'shots', label: 'Shot', abbrev: 'S', type: 'skater', field: 'shots' },
  { key: 'shootingpct', label: 'Shooting %', abbrev: 'SH%', type: 'skater', field: 'shootingPctg', format: formatPctg },
  { key: 'toi', label: 'TOI/GP', abbrev: 'TOI', type: 'skater', field: 'avgTimeOnIcePerGame', format: formatToi },
  { key: 'faceoffpct', label: 'Faceoff %', abbrev: 'FO%', type: 'skater', field: 'faceoffWinPctg', format: formatPctg },
  { key: 'ppg', label: 'Power Play Goal', abbrev: 'PPG', type: 'skater', field: 'powerPlayGoals' },
  { key: 'shg', label: 'Shorthanded Goal', abbrev: 'SHG', type: 'skater', field: 'shorthandedGoals' },
  { key: 'gwg', label: 'Game-Winning Goal', abbrev: 'GWG', type: 'skater', field: 'gameWinningGoals' },
  { key: 'otg', label: 'Overtime Goal', abbrev: 'OTG', type: 'skater', field: 'overtimeGoals' },
  // Goalie stats
  { key: 'wins', label: 'Win', abbrev: 'W', type: 'goalie', field: 'wins' },
  { key: 'losses', label: 'Loss', abbrev: 'L', type: 'goalie', field: 'losses' },
  { key: 'otl', label: 'OT Loss', abbrev: 'OTL', type: 'goalie', field: 'overtimeLosses' },
  { key: 'gaa', label: 'Goals Against Average', abbrev: 'GAA', type: 'goalie', field: 'goalsAgainstAverage', sortAscending: true, format: formatGaa },
  { key: 'savepct', label: 'Save %', abbrev: 'SV%', type: 'goalie', field: 'savePercentage', format: formatPctg },
  { key: 'shutouts', label: 'Shutout', abbrev: 'SO', type: 'goalie', field: 'shutouts' },
  { key: 'record', label: 'Record', abbrev: 'W-L-OTL', type: 'goalie', field: 'wins' }, // Special handling
];

function formatTotalMinutes(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// MoneyPuck stats (fallback for stats not in NHL API)
const MONEYPUCK_CATEGORIES: MoneyPuckCategory[] = [
  { key: 'hits', label: 'Hit', abbrev: 'HIT', field: 'hits' },
  { key: 'blocks', label: 'Blocked Shot', abbrev: 'BLK', field: 'blockedShots' },
  { key: 'takeaways', label: 'Takeaway', abbrev: 'TK', field: 'takeaways' },
  { key: 'giveaways', label: 'Giveaway', abbrev: 'GV', field: 'giveaways' },
  { key: 'xgoals', label: 'Expected Goal', abbrev: 'xG', field: 'xGoals', format: formatXg },
  { key: 'totalminutes', label: 'Total Minutes', abbrev: 'MIN', field: 'icetime', format: formatTotalMinutes },
];

// --- Keyword-to-category mapping (longest match first) ---

interface KeywordMapping {
  keywords: string[];
  categoryKey: string;
  source: 'nhl' | 'moneypuck';
}

// Ordered so longer phrases are checked before shorter ones
const KEYWORD_MAPPINGS: KeywordMapping[] = [
  // NHL API stats
  { keywords: ['goals scored'], categoryKey: 'goals', source: 'nhl' },
  { keywords: ['points per game', 'pts/game'], categoryKey: 'points', source: 'nhl' },
  { keywords: ['plus-minus', 'plus minus', 'plusminus', '+/-'], categoryKey: 'plusminus', source: 'nhl' },
  { keywords: ['penalty minutes', 'pim'], categoryKey: 'pim', source: 'nhl' },
  { keywords: ['shots on goal', 'sog'], categoryKey: 'shots', source: 'nhl' },
  { keywords: ['shooting percentage', 'shooting %', 'shot%', 'sh%'], categoryKey: 'shootingpct', source: 'nhl' },
  { keywords: ['total minutes', 'played minutes', 'minutes played', 'season minutes', 'total toi', 'minutes'], categoryKey: 'totalminutes', source: 'moneypuck' },
  { keywords: ['time on ice', 'ice time', 'toi', 'toi/gp', 'avg toi'], categoryKey: 'toi', source: 'nhl' },
  { keywords: ['faceoff percentage', 'faceoff %', 'fo%', 'faceoffs'], categoryKey: 'faceoffpct', source: 'nhl' },
  { keywords: ['power-play goals', 'power play goals', 'ppg'], categoryKey: 'ppg', source: 'nhl' },
  { keywords: ['shorthanded goals', 'short-handed goals', 'shg'], categoryKey: 'shg', source: 'nhl' },
  { keywords: ['game-winning goals', 'game winning goals', 'game winner', 'gwg'], categoryKey: 'gwg', source: 'nhl' },
  { keywords: ['overtime goals', 'otg'], categoryKey: 'otg', source: 'nhl' },
  { keywords: ['save percentage', 'save %', 'sv%', 'save pct'], categoryKey: 'savepct', source: 'nhl' },
  { keywords: ['goals against average', 'gaa'], categoryKey: 'gaa', source: 'nhl' },
  { keywords: ['shutouts', 'shutout'], categoryKey: 'shutouts', source: 'nhl' },
  { keywords: ['record', 'wins', 'losses', 'otl'], categoryKey: 'record', source: 'nhl' },
  { keywords: ['points', 'pts'], categoryKey: 'points', source: 'nhl' },
  { keywords: ['goals', 'goal'], categoryKey: 'goals', source: 'nhl' },
  { keywords: ['assists', 'assist'], categoryKey: 'assists', source: 'nhl' },
  { keywords: ['shots', 'shot'], categoryKey: 'shots', source: 'nhl' },
  // MoneyPuck stats (fallback)
  { keywords: ['expected goals', 'xg', 'xgoals'], categoryKey: 'xgoals', source: 'moneypuck' },
  { keywords: ['blocked shots', 'blocks', 'blk'], categoryKey: 'blocks', source: 'moneypuck' },
  { keywords: ['takeaways', 'takeaway', 'tk'], categoryKey: 'takeaways', source: 'moneypuck' },
  { keywords: ['giveaways', 'giveaway', 'gv'], categoryKey: 'giveaways', source: 'moneypuck' },
  { keywords: ['hits', 'hit'], categoryKey: 'hits', source: 'moneypuck' },
];

interface MatchResult {
  categoryKey: string;
  source: 'nhl' | 'moneypuck';
}

function matchKeywords(input: string): MatchResult | null {
  const lower = input.toLowerCase().trim();

  for (const mapping of KEYWORD_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (lower.includes(keyword)) {
        return { categoryKey: mapping.categoryKey, source: mapping.source };
      }
    }
  }

  return null;
}

// --- Embed builder ---

function positionLabel(code: string): string {
  switch (code) {
    case 'C': return 'C';
    case 'L': return 'LW';
    case 'R': return 'RW';
    case 'D': return 'D';
    default: return code;
  }
}

export async function buildStatsEmbed(teamCode: string, query: string): Promise<EmbedBuilder> {
  // Check if query contains a date - if so, use per-game stats
  const dateExtract = extractDateFromQuery(query);
  if (dateExtract) {
    return buildGameStatsEmbed(teamCode, dateExtract.date, dateExtract.statQuery);
  }

  const match = matchKeywords(query);

  if (!match) {
    return buildStatNotSupportedEmbed(query);
  }

  // Use MoneyPuck for advanced stats
  if (match.source === 'moneypuck') {
    return buildMoneyPuckEmbed(teamCode, match.categoryKey);
  }

  // Use NHL API for standard stats
  const category = STAT_CATEGORIES.find(c => c.key === match.categoryKey);
  if (!category) {
    return buildStatNotSupportedEmbed(query);
  }

  const stats = await getClubStats(teamCode);

  if (!stats) {
    return new EmbedBuilder()
      .setTitle('Stats Unavailable')
      .setDescription('Could not fetch stats from the NHL API.')
      .setColor(0xff0000);
  }

  if (category.type === 'goalie') {
    if (category.key === 'record') {
      return buildGoalieRecordEmbed(stats.goalies, teamCode);
    }
    return buildGoalieEmbed(stats.goalies, category, teamCode);
  }
  return buildSkaterEmbed(stats.skaters, category, teamCode);
}

async function buildMoneyPuckEmbed(teamCode: string, categoryKey: string): Promise<EmbedBuilder> {
  const category = MONEYPUCK_CATEGORIES.find(c => c.key === categoryKey);
  if (!category) {
    return buildStatNotSupportedEmbed(categoryKey);
  }

  const skaters = await getMoneyPuckSkaters(teamCode);

  if (!skaters || skaters.length === 0) {
    return new EmbedBuilder()
      .setTitle('Stats Unavailable')
      .setDescription(
        `Could not fetch ${category.label.toLowerCase()} stats from MoneyPuck.\n\n` +
        '*This may be a temporary issue or the team code may not match. Try again later.*'
      )
      .setColor(0xff0000);
  }

  const field = category.field;
  const sorted = [...skaters].sort((a, b) => {
    const aVal = a[field] as number;
    const bVal = b[field] as number;
    return bVal - aVal; // descending
  });

  const top5 = sorted.slice(0, 5);
  const format = category.format ?? ((v: number) => `${v}`);

  const lines = top5.map((player, i) => {
    const prefix = `${i + 1}.`;
    const pos = positionLabel(player.position);
    const val = format(player[field] as number);
    return `${prefix} **${player.name}** (${pos}) - **${val}** ${category.abbrev} (${player.gamesPlayed} GP)`;
  });

  return new EmbedBuilder()
    .setTitle(`${teamCode} ${category.label} Leaders`)
    .setDescription(lines.join('\n'))
    .setColor(0x006847)
    .setFooter({ text: '2025-2026 Season • Data: MoneyPuck' });
}

function buildStatNotSupportedEmbed(query: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Stat Not Supported')
    .setDescription(
      `I couldn't find a stat matching "**${query}**".\n\n` +
      '**Skater stats (NHL API):**\n' +
      'goals, assists, points, +/-, PIM, shots, shooting%, TOI, minutes (total), faceoff%, PPG, SHG, GWG, OTG\n\n' +
      '**Skater stats (MoneyPuck):**\n' +
      'hits, blocks, takeaways, giveaways, xG\n\n' +
      '**Goalie stats:**\n' +
      'wins, losses, OTL, record, GAA, save%, shutouts'
    )
    .setColor(0xff6600)
    .setFooter({ text: 'Try !stats help for usage examples' });
}

function buildSkaterEmbed(skaters: SkaterStats[], category: StatCategory, teamCode: string): EmbedBuilder {
  const field = category.field as keyof SkaterStats;
  const sorted = [...skaters].sort((a, b) => {
    const aVal = a[field] as number;
    const bVal = b[field] as number;
    return category.sortAscending ? aVal - bVal : bVal - aVal;
  });

  const top5 = sorted.slice(0, 5);
  const format = category.format ?? ((v: number) => `${v}`);

  const lines = top5.map((player, i) => {
    const prefix = `${i + 1}.`;
    const name = `${player.firstName.default} ${player.lastName.default}`;
    const pos = positionLabel(player.positionCode);
    const val = format(player[field] as number);
    return `${prefix} **${name}** (${pos}) - **${val}** ${category.abbrev} (${player.gamesPlayed} GP)`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${teamCode} ${category.label} Leaders`)
    .setDescription(lines.join('\n'))
    .setColor(0x006847)
    .setFooter({ text: '2025-2026 Season' });

  if (top5[0]?.headshot) {
    embed.setThumbnail(top5[0].headshot);
  }

  return embed;
}

function buildGoalieEmbed(goalies: GoalieStats[], category: StatCategory, teamCode: string): EmbedBuilder {
  const field = category.field as keyof GoalieStats;
  const sorted = [...goalies].sort((a, b) => {
    const aVal = a[field] as number;
    const bVal = b[field] as number;
    return category.sortAscending ? aVal - bVal : bVal - aVal;
  });

  const top5 = sorted.slice(0, 5);
  const format = category.format ?? ((v: number) => `${v}`);

  const lines = top5.map((player, i) => {
    const prefix = `${i + 1}.`;
    const name = `${player.firstName.default} ${player.lastName.default}`;
    const val = format(player[field] as number);
    return `${prefix} **${name}** (G) - **${val}** ${category.abbrev} (${player.gamesPlayed} GP)`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${teamCode} ${category.label} Leaders`)
    .setDescription(lines.join('\n'))
    .setColor(0x006847)
    .setFooter({ text: '2025-2026 Season' });

  if (top5[0]?.headshot) {
    embed.setThumbnail(top5[0].headshot);
  }

  return embed;
}

function buildGoalieRecordEmbed(goalies: GoalieStats[], teamCode: string): EmbedBuilder {
  // Sort by wins descending
  const sorted = [...goalies].sort((a, b) => b.wins - a.wins);
  const top5 = sorted.slice(0, 5);

  const lines = top5.map((player, i) => {
    const prefix = `${i + 1}.`;
    const name = `${player.firstName.default} ${player.lastName.default}`;
    const record = formatRecord(player);
    return `${prefix} **${name}** (G) - **${record}** (${player.gamesPlayed} GP)`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${teamCode} Goalie Records`)
    .setDescription(lines.join('\n'))
    .setColor(0x006847)
    .setFooter({ text: '2025-2026 Season' });

  if (top5[0]?.headshot) {
    embed.setThumbnail(top5[0].headshot);
  }

  return embed;
}

export function buildStatsHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Stats Lookup')
    .setDescription(
      'Look up team stats using `!stats` or `/stats`\n\n' +
      '**Season stats:**\n' +
      '`!stats goals`\n' +
      '`!stats hits`\n' +
      '`/stats xg`\n\n' +
      '**Per-game stats:**\n' +
      '`!stats goals on 02/02/26`\n' +
      '`/stats hits on Feb 2`\n\n' +
      '**Season stats (NHL API):**\n' +
      'goals, assists, points, +/-, PIM, shots, shooting%, TOI, faceoff%, PPG, SHG, GWG, OTG\n\n' +
      '**Season stats (MoneyPuck):**\n' +
      'hits, blocks, takeaways, giveaways, xG, minutes (total)\n\n' +
      '**Goalie stats:**\n' +
      'wins, losses, OTL, record, GAA, save%, shutouts'
    )
    .setColor(0x006847);
}
