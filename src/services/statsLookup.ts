import { EmbedBuilder } from 'discord.js';
import { getClubStats } from '../nhl/client.js';
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

const STAT_CATEGORIES: StatCategory[] = [
  { key: 'points', label: 'Point', abbrev: 'P', type: 'skater', field: 'points' },
  { key: 'goals', label: 'Goal', abbrev: 'G', type: 'skater', field: 'goals' },
  { key: 'assists', label: 'Assist', abbrev: 'A', type: 'skater', field: 'assists' },
  { key: 'plusminus', label: '+/-', abbrev: '+/-', type: 'skater', field: 'plusMinus', format: formatPlusMinus },
  { key: 'pim', label: 'Penalty Minute', abbrev: 'PIM', type: 'skater', field: 'penaltyMinutes' },
  { key: 'ppg', label: 'Power Play Goal', abbrev: 'PPG', type: 'skater', field: 'powerPlayGoals' },
  { key: 'shg', label: 'Shorthanded Goal', abbrev: 'SHG', type: 'skater', field: 'shorthandedGoals' },
  { key: 'gwg', label: 'Game-Winning Goal', abbrev: 'GWG', type: 'skater', field: 'gameWinningGoals' },
  { key: 'otg', label: 'Overtime Goal', abbrev: 'OTG', type: 'skater', field: 'overtimeGoals' },
  { key: 'shots', label: 'Shot', abbrev: 'S', type: 'skater', field: 'shots' },
  { key: 'shootingpct', label: 'Shooting %', abbrev: 'SH%', type: 'skater', field: 'shootingPctg', format: formatPctg },
  { key: 'toi', label: 'TOI/GP', abbrev: 'TOI', type: 'skater', field: 'avgTimeOnIcePerGame', format: formatToi },
  { key: 'gp', label: 'Games Played', abbrev: 'GP', type: 'skater', field: 'gamesPlayed' },
  { key: 'faceoffpct', label: 'Faceoff %', abbrev: 'FO%', type: 'skater', field: 'faceoffWinPctg', format: formatPctg },
  { key: 'wins', label: 'Win', abbrev: 'W', type: 'goalie', field: 'wins' },
  { key: 'gaa', label: 'Goals Against Average', abbrev: 'GAA', type: 'goalie', field: 'goalsAgainstAverage', sortAscending: true, format: formatGaa },
  { key: 'savepct', label: 'Save %', abbrev: 'SV%', type: 'goalie', field: 'savePctg', format: formatPctg },
  { key: 'shutouts', label: 'Shutout', abbrev: 'SO', type: 'goalie', field: 'shutouts' },
];

// --- Keyword-to-category mapping (longest match first) ---

interface KeywordMapping {
  keywords: string[];
  categoryKey: string;
}

// Ordered so longer phrases are checked before shorter ones
const KEYWORD_MAPPINGS: KeywordMapping[] = [
  { keywords: ['power play goals', 'powerplay goals', 'pp goals', 'ppg', 'power play'], categoryKey: 'ppg' },
  { keywords: ['shorthanded goals', 'short handed goals', 'sh goals', 'shg', 'shorthanded'], categoryKey: 'shg' },
  { keywords: ['game winning goals', 'game-winning goals', 'gwg', 'game winners', 'game winning'], categoryKey: 'gwg' },
  { keywords: ['overtime goals', 'ot goals', 'otg', 'overtime'], categoryKey: 'otg' },
  { keywords: ['penalty minutes', 'pim', 'penalties', 'goons', 'penalty mins'], categoryKey: 'pim' },
  { keywords: ['shooting percentage', 'shooting pct', 'shooting%', 'shoot pct', 'sh%'], categoryKey: 'shootingpct' },
  { keywords: ['faceoff percentage', 'faceoff pct', 'faceoff%', 'faceoffs', 'fo%', 'faceoff'], categoryKey: 'faceoffpct' },
  { keywords: ['save percentage', 'save pct', 'save%', 'sv%', 'save'], categoryKey: 'savepct' },
  { keywords: ['goals against average', 'goals against', 'gaa'], categoryKey: 'gaa' },
  { keywords: ['time on ice', 'toi', 'ice time'], categoryKey: 'toi' },
  { keywords: ['games played', 'gp'], categoryKey: 'gp' },
  { keywords: ['plus minus', 'plus/minus', '+/-', 'plusminus'], categoryKey: 'plusminus' },
  { keywords: ['shutouts', 'shutout', 'so'], categoryKey: 'shutouts' },
  { keywords: ['points', 'pts'], categoryKey: 'points' },
  { keywords: ['goals', 'goal'], categoryKey: 'goals' },
  { keywords: ['assists', 'assist', 'apples'], categoryKey: 'assists' },
  { keywords: ['shots', 'shot'], categoryKey: 'shots' },
  { keywords: ['wins', 'win'], categoryKey: 'wins' },
];

export function matchStatCategory(input: string): StatCategory {
  const lower = input.toLowerCase().trim();

  for (const mapping of KEYWORD_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (lower.includes(keyword)) {
        const cat = STAT_CATEGORIES.find(c => c.key === mapping.categoryKey);
        if (cat) return cat;
      }
    }
  }

  // Default to points
  return STAT_CATEGORIES[0];
}

// --- Embed builder ---

const MEDALS = ['🥇', '🥈', '🥉'];

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
  const category = matchStatCategory(query);
  const stats = await getClubStats(teamCode);

  if (!stats) {
    return new EmbedBuilder()
      .setTitle('Stats Unavailable')
      .setDescription('Could not fetch stats from the NHL API.')
      .setColor(0xff0000);
  }

  if (category.type === 'goalie') {
    return buildGoalieEmbed(stats.goalies, category, teamCode);
  }
  return buildSkaterEmbed(stats.skaters, category, teamCode);
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
    const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`;
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
    const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`;
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

export function buildStatsHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Stats Lookup')
    .setDescription(
      'Ask me about team stats! Examples:\n\n' +
      '`@Tusky who leads in goals?`\n' +
      '`@Tusky penalty minutes`\n' +
      '`@Tusky save percentage`\n' +
      '`/stats goals`\n' +
      '`!stats pim`\n\n' +
      '**Skater stats:** points, goals, assists, +/-, PIM, PPG, SHG, GWG, OTG, shots, shooting%, TOI, GP, faceoff%\n' +
      '**Goalie stats:** wins, GAA, save%, shutouts'
    )
    .setColor(0x006847)
    .setFooter({ text: 'Defaults to points if no stat keyword is recognized' });
}
