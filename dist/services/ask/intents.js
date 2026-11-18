"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coreQuestion = coreQuestion;
exports.parseIntent = parseIntent;
exports.playerNameCandidates = playerNameCandidates;
exports.formatStatAnswer = formatStatAnswer;
const text_js_1 = require("./text.js");
const LEADING_FILLER = new Set(['hey', 'yo', 'so', 'ok', 'okay', 'tusky', 'um', 'uh', 'quick', 'question']);
const TRAILING_FILLER = new Set(['tusky', 'please', 'pls', 'plz', 'thanks', 'thx', 'lol', 'again', 'rn']);
/** Strip greeting/filler words at either end ("hey tusky when is the next game please"). */
function coreQuestion(normalized) {
    const t = (0, text_js_1.tokens)(normalized);
    while (t.length > 1 && LEADING_FILLER.has(t[0]))
        t.shift();
    while (t.length > 1 && TRAILING_FILLER.has(t[t.length - 1]))
        t.pop();
    return t.join(' ');
}
const US = '(?:we|the mammoth|mammoth|utah|the team)';
const WHEN = '(?: today| tonight| next| again| this week)?';
const NEXT_GAME = [
    new RegExp(`^(?:when|what time) (?:is|s|does|do) (?:the |our )?(?:next )?(?:mammoth |utah )?(?:game|puck drop)(?: start)?${WHEN}$`),
    new RegExp(`^(?:when|what time) (?:do|does) ${US} play${WHEN}$`),
    new RegExp(`^(?:whens|whats) (?:the |our )?(?:next game|puck drop|game time)${WHEN}$`),
    new RegExp(`^who (?:do|are|does) ${US} (?:play|playing|face|facing)${WHEN}$`),
    new RegExp(`^(?:next game|next match|game time|puck drop)${WHEN}$`),
    new RegExp(`^is there a game (?:today|tonight)$`),
    new RegExp(`^(?:do|are) ${US} (?:play|playing) (?:today|tonight)$`),
];
const STANDINGS = [
    /^(?:the |our |nhl |league |west |western |east |eastern )?standings$/,
    /^(?:show|show me|get|check|pull up) (?:the |our )?(?:nhl |league |west |western |east |eastern )?standings$/,
    new RegExp(`^where (?:are|do|does|is) ${US} (?:stand|sit|at|in the standings)(?: in the standings)?(?: right now| now)?$`),
    new RegExp(`^(?:wheres|where is) ${US} in the standings$`),
    /^what place are we in(?: the standings)?(?: right now| now)?$/,
    /^(?:how are we doing in the standings|hows the standings|how do the standings look|how are the standings)$/,
];
const LAST_GAME = [
    /^(?:what was|whats|what is) (?:the )?(?:score|final score|final|result)(?: of)?(?: the)? (?:last|previous|latest) game$/,
    /^(?:what was|whats) the (?:score|final score) (?:last night|yesterday)$/,
    new RegExp(`^did ${US} (?:win|lose)(?: last night| yesterday| the last game| last game)?$`),
    /^(?:who won|how did we do|how did the mammoth do)(?: last night| yesterday| the last game| last game)$/,
    /^(?:how did we do|how did the last game go|how was the last game)$/,
    /^(?:last game|last game score|last nights game|score of the last game|final score of the last game)$/,
];
const LATEST_EPISODE = [
    /^(?:whats |what is )?(?:the )?(?:newest|latest|new|last|most recent) (?:clean hits )?(?:episode|ep|video|podcast|pod)(?: of clean hits| of the podcast)?(?: out)?$/,
    /^(?:is there|did) (?:a )?(?:new )?(?:clean hits )?(?:episode|ep|video|pod)(?: out| drop| come out)?(?: yet)?$/,
    /^did (?:clean hits|the podcast|the pod) (?:drop|post|upload)(?: a new episode| a new video| anything)?(?: yet)?$/,
    /^(?:new|newest|latest) clean hits$/,
];
const LATEST_SUBSTACK = [
    /^(?:whats |what is )?(?:the )?(?:newest|latest|new|last|most recent) (?:clean hits )?(?:substack|newsletter|article|blog)(?: post)?$/,
    /^(?:whats |what is )?(?:the )?(?:newest|latest|last|most recent) (?:post|article) on (?:the )?substack$/,
];
const STAT_WORDS = [
    ['power play goals', 'powerPlayGoals'],
    ['penalty minutes', 'pim'],
    ['plus minus', 'plusMinus'],
    ['games', 'gamesPlayed'],
    ['goals', 'goals'],
    ['assists', 'assists'],
    ['points', 'points'],
    ['shots', 'shots'],
    ['pim', 'pim'],
    ['ppg', 'powerPlayGoals'],
    ['wins', 'wins'],
    ['shutouts', 'shutouts'],
];
const STAT_ALT = STAT_WORDS.map(([w]) => w).join('|');
const PLAYER_STAT_Q = new RegExp(`^how many (${STAT_ALT}) (?:does|has|did|have) (.+?) (?:have|got|get|scored|score|played|play|had|recorded)(?: this season| so far| this year)?$`);
const PLAYER_STATS = [
    /^(?:what are |whats |show me |show |get |pull up )?(.+?) (?:stats|statline|stat line|numbers)(?: this season| this year)?$/,
    /^(?:stats|statline|numbers) (?:for|on) (.+?)$/,
    /^how (?:is|has) (.+?) (?:doing|playing|been playing|been doing)(?: this season| this year| lately)?$/,
    /^hows (.+?) (?:doing|playing)(?: this season| this year| lately)?$/,
];
const NOT_A_PLAYER = /^(?:we|us|our|the team|the mammoth|mammoth|utah|team|the|my|your|his|her|their|everyone|the league|nhl|it|that|this|the season)$/;
function cleanName(name) {
    const n = name.trim();
    if (!n || n.length > 40 || NOT_A_PLAYER.test(n) || n.split(' ').length > 3)
        return null;
    return n;
}
function standingsFilter(core) {
    const t = (0, text_js_1.tokens)(core);
    if (t.includes('league') || t.includes('nhl'))
        return 'league';
    if (t.includes('east') || t.includes('eastern'))
        return 'east';
    if (t.includes('west') || t.includes('western'))
        return 'west';
    return undefined;
}
/** Map a normalized message to a live-data intent, or null when it isn't a clean match. */
function parseIntent(normalized) {
    const core = coreQuestion(normalized);
    if (!core)
        return null;
    if (NEXT_GAME.some(r => r.test(core)))
        return { kind: 'next_game' };
    if (STANDINGS.some(r => r.test(core))) {
        const filter = standingsFilter(core);
        return filter ? { kind: 'standings', filter } : { kind: 'standings' };
    }
    if (LAST_GAME.some(r => r.test(core)))
        return { kind: 'last_game' };
    if (LATEST_SUBSTACK.some(r => r.test(core)))
        return { kind: 'latest_substack' };
    if (LATEST_EPISODE.some(r => r.test(core)))
        return { kind: 'latest_episode' };
    const statQ = core.match(PLAYER_STAT_Q);
    if (statQ) {
        const player = cleanName(statQ[2]);
        const stat = STAT_WORDS.find(([w]) => w === statQ[1])?.[1];
        return player ? { kind: 'player_stats', player, stat } : null;
    }
    for (const r of PLAYER_STATS) {
        const m = core.match(r);
        if (m) {
            const player = cleanName(m[1]);
            return player ? { kind: 'player_stats', player } : null;
        }
    }
    return null;
}
/** Name variants to try against the roster ("cooleys" from "cooley's stats" → also "cooley"). */
function playerNameCandidates(name) {
    const out = [name];
    if (name.endsWith('s') && name.length > 3)
        out.push(name.slice(0, -1));
    return out;
}
const STAT_LABELS = {
    goals: ['goal', 'goals'],
    assists: ['assist', 'assists'],
    points: ['point', 'points'],
    shots: ['shot', 'shots'],
    pim: ['penalty minute', 'penalty minutes'],
    plusMinus: ['', ''],
    powerPlayGoals: ['power-play goal', 'power-play goals'],
    gamesPlayed: ['game', 'games'],
    wins: ['win', 'wins'],
    shutouts: ['shutout', 'shutouts'],
};
const GOALIE_ONLY = ['wins', 'shutouts'];
const SKATER_ONLY = ['goals', 'assists', 'points', 'shots', 'pim', 'plusMinus', 'powerPlayGoals'];
/**
 * One dry line answering "how many X does Y have", from the season stats the !player embed uses.
 * Null when the stat doesn't apply to the position or isn't available.
 */
function formatStatAnswer(name, position, season, stat, seasonLabel) {
    if (!season)
        return null;
    const isGoalie = position === 'G';
    if (isGoalie && SKATER_ONLY.includes(stat))
        return null;
    if (!isGoalie && GOALIE_ONLY.includes(stat))
        return null;
    const value = season[stat];
    if (typeof value !== 'number')
        return null;
    const gp = season.gamesPlayed;
    const when = seasonLabel.replace(/ Season$/, '');
    if (stat === 'plusMinus')
        return `${name} is ${value > 0 ? '+' : ''}${value} in ${gp} games (${when}).`;
    if (stat === 'gamesPlayed')
        return `${name} has played ${value} ${value === 1 ? 'game' : 'games'} (${when}).`;
    const [one, many] = STAT_LABELS[stat];
    return `${name} has ${value} ${value === 1 ? one : many} in ${gp} ${gp === 1 ? 'game' : 'games'} (${when}).`;
}
//# sourceMappingURL=intents.js.map