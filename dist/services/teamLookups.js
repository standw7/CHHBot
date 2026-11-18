"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findNextGame = findNextGame;
exports.findLastCompletedGame = findLastCompletedGame;
exports.buildNextGameEmbed = buildNextGameEmbed;
exports.lookupNextGame = lookupNextGame;
exports.lookupUpcomingGames = lookupUpcomingGames;
exports.lookupLastGame = lookupLastGame;
exports.buildStandingsEmbed = buildStandingsEmbed;
exports.lookupStandingsEmbed = lookupStandingsEmbed;
exports.seasonLabel = seasonLabel;
exports.lookupPlayer = lookupPlayer;
exports.embedToText = embedToText;
const discord_js_1 = require("discord.js");
const nhlClient = __importStar(require("../nhl/client.js"));
const endpoints_js_1 = require("../nhl/endpoints.js");
const finalCard_js_1 = require("./finalCard.js");
// Shared lookups behind !next, /next, !standings, !player and Ask Tusky (tier 2 + LLM tools).
// Builders return embeds; Ask Tusky's LLM tools flatten them with embedToText().
const COLOR = 0x006847;
// --- Schedule ---
/** First game after `now` that hasn't started (FUT/PRE). */
function findNextGame(games, now) {
    return games.find(g => new Date(g.startTimeUTC) > now && (g.gameState === 'FUT' || g.gameState === 'PRE'));
}
/** Most recent finished game (FINAL/OFF) that started before `now`. */
function findLastCompletedGame(games, now) {
    let last;
    for (const g of games) {
        if ((g.gameState === 'FINAL' || g.gameState === 'OFF') && new Date(g.startTimeUTC) < now) {
            if (!last || new Date(g.startTimeUTC) > new Date(last.startTimeUTC))
                last = g;
        }
    }
    return last;
}
function buildNextGameEmbed(nextGame, teamCode, timezone) {
    const gameDate = new Date(nextGame.startTimeUTC);
    const formattedDate = gameDate.toLocaleDateString('en-US', {
        timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
    });
    const formattedTime = gameDate.toLocaleTimeString('en-US', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit',
    });
    const isHome = nextGame.homeTeam.abbrev === teamCode;
    const opponent = isHome ? nextGame.awayTeam : nextGame.homeTeam;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('Next Game')
        .setDescription(`**${nextGame.awayTeam.abbrev}** @ **${nextGame.homeTeam.abbrev}**`)
        .addFields({ name: 'Opponent', value: opponent.abbrev, inline: true }, { name: 'Location', value: isHome ? 'Home' : 'Away', inline: true }, { name: 'Date', value: formattedDate, inline: true }, { name: 'Time', value: formattedTime, inline: true })
        .setURL((0, endpoints_js_1.gamecenterWebUrl)(nextGame.id))
        .setColor(COLOR);
    if (nextGame.venue?.default) {
        embed.addFields({ name: 'Venue', value: nextGame.venue.default, inline: true });
    }
    const teamLogo = isHome ? nextGame.homeTeam.logo : nextGame.awayTeam.logo;
    if (teamLogo)
        embed.setThumbnail(teamLogo);
    return embed;
}
async function lookupNextGame(teamCode, timezone) {
    const schedule = await nhlClient.getSchedule(teamCode);
    if (!schedule?.games?.length)
        return { kind: 'no_schedule' };
    const game = findNextGame(schedule.games, new Date());
    if (!game)
        return { kind: 'none' };
    return { kind: 'ok', embed: buildNextGameEmbed(game, teamCode, timezone), game };
}
/** Upcoming games as plain lines (for the LLM tool). */
async function lookupUpcomingGames(teamCode, timezone, count) {
    const schedule = await nhlClient.getSchedule(teamCode);
    if (!schedule?.games)
        return null;
    const now = new Date();
    const games = schedule.games
        .filter(g => new Date(g.startTimeUTC) > now || g.gameState === 'LIVE' || g.gameState === 'CRIT')
        .slice(0, count);
    if (games.length === 0)
        return 'No upcoming games on the schedule.';
    return games.map(g => {
        const d = new Date(g.startTimeUTC);
        const when = `${d.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
        const isHome = g.homeTeam.abbrev === teamCode;
        const opp = isHome ? g.awayTeam.abbrev : g.homeTeam.abbrev;
        const live = g.gameState === 'LIVE' || g.gameState === 'CRIT' ? ' (LIVE NOW)' : '';
        return `${when}: ${teamCode} ${isHome ? 'vs' : '@'} ${opp}${g.venue?.default ? ` at ${g.venue.default}` : ''}${live}`;
    }).join('\n');
}
/** Final card (same as the post-game one) for the most recent completed game. */
async function lookupLastGame(teamCode, spoilerMode, guild) {
    const schedule = await nhlClient.getSchedule(teamCode);
    if (!schedule?.games)
        return { kind: 'unavailable' };
    const game = findLastCompletedGame(schedule.games, new Date());
    if (!game)
        return { kind: 'none' };
    const boxscore = await nhlClient.getBoxscore(game.id);
    if (!boxscore)
        return { kind: 'unavailable' };
    const { content, embed } = (0, finalCard_js_1.buildFinalCard)(boxscore, spoilerMode, guild);
    embed.setURL((0, endpoints_js_1.gamecenterWebUrl)(game.id));
    return { kind: 'ok', content, embed, game };
}
// --- Standings ---
/** Playoff picture for a conference (default: the team's), or the league top 16. */
function buildStandingsEmbed(standings, teamCode, filter) {
    const userTeam = standings.find(t => t.teamAbbrev.default === teamCode);
    const userConference = userTeam?.conferenceName || 'Western';
    const formatTeam = (team, rank, showDiff) => {
        const highlight = team.teamAbbrev.default === teamCode ? '**' : '';
        let line = `${rank}. ${highlight}${team.teamAbbrev.default}${highlight} | ${team.gamesPlayed} | ${team.wins}-${team.losses}-${team.otLosses} | ${team.points}`;
        if (showDiff !== undefined && showDiff !== 0) {
            line += ` (${showDiff > 0 ? '+' : ''}${showDiff})`;
        }
        return line;
    };
    const header = '`   Team | GP | W-L-OT | PTS`\n\n';
    if (filter === 'league' || filter === 'nhl') {
        const sorted = [...standings].sort((a, b) => b.points - a.points).slice(0, 16);
        const lines = sorted.map((team, i) => formatTeam(team, i + 1));
        return new discord_js_1.EmbedBuilder()
            .setTitle('NHL Standings (Top 16)')
            .setDescription(header + lines.join('\n'))
            .setColor(COLOR);
    }
    let conference = userConference;
    if (filter === 'east' || filter === 'eastern')
        conference = 'Eastern';
    else if (filter === 'west' || filter === 'western')
        conference = 'Western';
    const confTeams = standings.filter(t => t.conferenceName === conference);
    const div1Name = conference === 'Western' ? 'Central' : 'Atlantic';
    const div2Name = conference === 'Western' ? 'Pacific' : 'Metropolitan';
    const div1Teams = confTeams.filter(t => t.divisionName === div1Name).sort((a, b) => b.points - a.points);
    const div2Teams = confTeams.filter(t => t.divisionName === div2Name).sort((a, b) => b.points - a.points);
    // Top 3 from each division make playoffs; then two wild cards by points
    const div1Playoff = div1Teams.slice(0, 3);
    const div2Playoff = div2Teams.slice(0, 3);
    const wildCardEligible = [...div1Teams.slice(3), ...div2Teams.slice(3)].sort((a, b) => b.points - a.points);
    const wildCardIn = wildCardEligible.slice(0, 2);
    const wildCardChase = wildCardEligible.slice(2, 8);
    const wc2Points = wildCardIn[1]?.points || 0;
    let description = header;
    description += `**${div1Name} Division**\n`;
    div1Playoff.forEach((team, i) => { description += formatTeam(team, i + 1) + '\n'; });
    description += `\n**${div2Name} Division**\n`;
    div2Playoff.forEach((team, i) => { description += formatTeam(team, i + 1) + '\n'; });
    description += `\n**Wild Card**\n`;
    wildCardIn.forEach((team, i) => { description += formatTeam(team, `WC${i + 1}`) + '\n'; });
    description += `\n**In The Hunt**\n`;
    wildCardChase.forEach((team, i) => {
        description += formatTeam(team, i + 1, team.points - wc2Points) + '\n';
    });
    return new discord_js_1.EmbedBuilder()
        .setTitle(`${conference} Conference Playoff Picture`)
        .setDescription(description)
        .setColor(COLOR)
        .setFooter({ text: 'Points diff from WC2 | !standings [west|east|league]' });
}
async function lookupStandingsEmbed(teamCode, filter) {
    const standings = await nhlClient.getStandings();
    if (!standings?.standings)
        return null;
    return buildStandingsEmbed(standings.standings, teamCode, filter);
}
// --- Players ---
/** "20262027" → "2026-27 Season"; falls back to "Season" when unknown. */
function seasonLabel(season) {
    const s = String(season ?? '');
    if (!/^\d{8}$/.test(s))
        return 'Season';
    return `${s.slice(0, 4)}-${s.slice(6, 8)} Season`;
}
/** Search a player (any NHL player; active preferred) or fetch by id, and build the !player embed. */
async function lookupPlayer(query) {
    let playerId;
    let searchName;
    if (typeof query === 'string') {
        const results = await nhlClient.searchPlayers(query);
        if (!results || results.length === 0)
            return { kind: 'not_found' };
        const player = results.find(p => p.active) || results[0];
        playerId = parseInt(player.playerId, 10);
        searchName = player.name;
    }
    else {
        playerId = query.playerId;
        searchName = `player ${playerId}`;
    }
    const stats = await nhlClient.getPlayerStats(playerId);
    if (!stats)
        return { kind: 'unavailable', name: searchName };
    // Season TOI and FO% come from club stats (the landing endpoint only has career averages)
    let seasonToi = null;
    let seasonFoPct = null;
    if (stats.currentTeamAbbrev) {
        const clubStats = await nhlClient.getClubStats(stats.currentTeamAbbrev);
        const playerClubStats = clubStats?.skaters?.find(s => s.playerId === playerId);
        if (playerClubStats) {
            const toiSeconds = playerClubStats.avgTimeOnIcePerGame;
            if (toiSeconds > 0) {
                const mins = Math.floor(toiSeconds / 60);
                const secs = Math.round(toiSeconds % 60);
                seasonToi = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            if (playerClubStats.faceoffWinPctg > 0) {
                const foPct = playerClubStats.faceoffWinPctg > 1 ? playerClubStats.faceoffWinPctg : playerClubStats.faceoffWinPctg * 100;
                seasonFoPct = foPct.toFixed(1);
            }
        }
    }
    const name = `${stats.firstName.default} ${stats.lastName.default}`;
    const embed = new discord_js_1.EmbedBuilder().setTitle(name).setColor(COLOR);
    if (stats.headshot)
        embed.setThumbnail(stats.headshot);
    const position = stats.position === 'G' ? 'Goalie' :
        stats.position === 'D' ? 'Defenseman' :
            stats.position === 'C' ? 'Center' :
                stats.position === 'L' ? 'Left Wing' :
                    stats.position === 'R' ? 'Right Wing' : stats.position;
    const heightFt = Math.floor(stats.heightInInches / 12);
    const heightIn = stats.heightInInches % 12;
    let info = `**#${stats.sweaterNumber}** | **${position}** | **${stats.currentTeamAbbrev || 'FA'}**\n`;
    info += `${heightFt}'${heightIn}" | ${stats.weightInPounds} lbs | Shoots: ${stats.shootsCatches}\n`;
    const birthplace = stats.birthStateProvince?.default
        ? `${stats.birthCity.default}, ${stats.birthStateProvince.default}, ${stats.birthCountry}`
        : `${stats.birthCity.default}, ${stats.birthCountry}`;
    info += `Born: ${birthplace}`;
    embed.setDescription(info);
    const seasonStats = stats.featuredStats?.regularSeason?.subSeason;
    const label = seasonLabel(stats.featuredStats?.season);
    if (seasonStats) {
        if (stats.position === 'G') {
            const gaa = seasonStats.goalsAgainstAvg?.toFixed(2) || '0.00';
            const svPct = seasonStats.savePctg ? (seasonStats.savePctg * 100).toFixed(1) : '0.0';
            embed.addFields({
                name: label,
                value: `GP: **${seasonStats.gamesPlayed}** | W: **${seasonStats.wins}** | L: **${seasonStats.losses}** | OT: **${seasonStats.otLosses}**\n` +
                    `GAA: **${gaa}** | SV%: **${svPct}%** | SO: **${seasonStats.shutouts}**`,
                inline: false,
            });
        }
        else {
            const spct = seasonStats.shootingPctg
                ? (seasonStats.shootingPctg > 1 ? seasonStats.shootingPctg.toFixed(1) : (seasonStats.shootingPctg * 100).toFixed(1))
                : '0.0';
            let statsText = `GP: **${seasonStats.gamesPlayed}** | G: **${seasonStats.goals}** | A: **${seasonStats.assists}** | P: **${seasonStats.points}**\n` +
                `+/-: **${seasonStats.plusMinus > 0 ? '+' : ''}${seasonStats.plusMinus}** | PIM: **${seasonStats.pim}** | Shots: **${seasonStats.shots}** | S%: **${spct}%**\n` +
                `PPG: **${seasonStats.powerPlayGoals}** | TOI: **${seasonToi || 'N/A'}**`;
            if (seasonFoPct)
                statsText += ` | FO%: **${seasonFoPct}%**`;
            embed.addFields({ name: label, value: statsText, inline: false });
        }
    }
    if (stats.last5Games && stats.last5Games.length > 0) {
        const last5Lines = stats.last5Games.slice(0, 5).map(g => {
            const date = new Date(g.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (stats.position === 'G') {
                const svPct = g.savePctg ? (g.savePctg * 100).toFixed(1) : '-';
                return `${date} vs ${g.opponentAbbrev}: **${g.decision || '-'}** | ${g.goalsAgainst} GA | ${svPct}%`;
            }
            return `${date} vs ${g.opponentAbbrev}: **${g.goals}G ${g.assists}A** | ${g.plusMinus && g.plusMinus > 0 ? '+' : ''}${g.plusMinus || 0} | ${g.shots || 0} SOG`;
        });
        embed.addFields({ name: 'Last 5 Games', value: last5Lines.join('\n'), inline: false });
    }
    return { kind: 'ok', embed, stats, name };
}
// --- Plain-text flattening (for the LLM tools) ---
/** Title, description, fields and footer of an embed as plain text (bold markers and custom emoji stripped). */
function embedToText(embed, extra, opts = {}) {
    const d = embed.data;
    const parts = [];
    if (extra)
        parts.push(extra);
    if (d.title)
        parts.push(d.title);
    if (d.description)
        parts.push(d.description);
    for (const f of d.fields ?? [])
        parts.push(`${f.name}: ${f.value}`);
    if (d.footer?.text && opts.footer !== false)
        parts.push(d.footer.text);
    return parts.join('\n')
        .replace(/<a?:(\w+):\d+>/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\|\|/g, '');
}
//# sourceMappingURL=teamLookups.js.map