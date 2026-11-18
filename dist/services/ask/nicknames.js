"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STARTER_NICKNAMES = void 0;
exports.nicknameKey = nicknameKey;
exports.starterNicknameRows = starterNicknameRows;
exports.resolveNicknames = resolveNicknames;
exports.formatNicknamed = formatNicknamed;
exports.nicknameUsedFor = nicknameUsedFor;
exports.resolveNameQuery = resolveNameQuery;
exports.formatNicknameList = formatNicknameList;
exports.parseAddNickname = parseAddNickname;
const text_js_1 = require("./text.js");
// Player nicknames ("Cools" → Logan Cooley). Stored per guild in ask_nicknames (seeded once from
// STARTER_NICKNAMES, edited with `!ask nick`). Questions are resolved to real names before preset
// and live-data matching; the LLM gets the list in its system prompt. Pure functions only.
/** Current-roster nicknames with a public source (KSL Sports, The Hockey News, Deseret News) or from the server owner. */
exports.STARTER_NICKNAMES = [
    { player: 'Logan Cooley', nicknames: ['Cools'] },
    { player: 'Dylan Guenther', nicknames: ['Gunner'] },
    { player: 'Liam O\'Brien', nicknames: ['Spicy Tuna', 'Tuna'] },
    { player: 'Daniil But', nicknames: ['Cheeks'] },
    { player: 'Clayton Keller', nicknames: ['Kells', 'Kellsy'] },
    { player: 'Lawson Crouse', nicknames: ['The Sheriff', 'Sheriff'] },
    { player: 'Nick Schmaltz', nicknames: ['KFC', 'Biggy Schmaltz'] },
    { player: 'Karel Vejmelka', nicknames: ['Veggie'] },
    { player: 'Michael Carcone', nicknames: ['Carcs'] },
    { player: 'Kevin Stenlund', nicknames: ['Stenny'] },
    { player: 'Kailer Yamamoto', nicknames: ['Yams'] },
    { player: 'Jack McBain', nicknames: ['Bainer'] },
    { player: 'Vincent Trocheck', nicknames: ['Tro'] },
    { player: 'Maveric Lamoureux', nicknames: ['MavLam'] },
    { player: 'Nate Schmidt', nicknames: ['Schmitty'] },
    { player: 'Mikhail Sergachev', nicknames: ['Sergy'] },
    { player: 'Dmitri Simashev', nicknames: ['Sima'] },
    { player: 'MacKenzie Weegar', nicknames: ['Weegs'] },
];
function nicknameKey(nickname) {
    return (0, text_js_1.normalizeText)(nickname);
}
function starterNicknameRows() {
    return exports.STARTER_NICKNAMES.flatMap(p => p.nicknames.map(nickname => ({ nickname, key: nicknameKey(nickname), player: p.player })));
}
function compile(nicknames) {
    return nicknames
        .map(entry => ({ entry, keyTokens: (0, text_js_1.tokens)(entry.key ?? nicknameKey(entry.nickname)), nameTokens: (0, text_js_1.tokens)((0, text_js_1.normalizeText)(entry.player)) }))
        .filter(c => c.keyTokens.length > 0 && c.nameTokens.length > 0)
        // Longest first, so "spicy tuna" wins over "tuna" and "the sheriff" over "sheriff"
        .sort((a, b) => b.keyTokens.length - a.keyTokens.length || b.keyTokens.join(' ').length - a.keyTokens.join(' ').length);
}
/** Matches `key` at msg[i..]; the last word may carry a possessive ("gunners", "coolss" from "cools's"). */
function matchAt(msg, i, key) {
    if (i + key.length > msg.length)
        return false;
    for (let j = 0; j < key.length - 1; j++)
        if (msg[i + j] !== key[j])
            return false;
    const last = msg[i + key.length - 1];
    const want = key[key.length - 1];
    return last === want || last === `${want}s`;
}
/**
 * Replaces nicknames in a normalized question (see normalizeText) with the players' names.
 * Whole words only ("tuna" never matches inside "fortunate"), case-insensitive because the
 * input is normalized, longest nickname first, possessives dropped ("gunner's goals" →
 * "dylan guenther goals"). A nickname written next to the real name ("logan cools cooley")
 * is just removed so the name isn't doubled.
 */
function resolveNicknames(normalized, nicknames) {
    const msg = (0, text_js_1.tokens)(normalized);
    const compiled = compile(nicknames);
    if (msg.length === 0 || compiled.length === 0)
        return { text: normalized, hits: [] };
    const out = [];
    const hits = [];
    const seen = new Set();
    let i = 0;
    while (i < msg.length) {
        const c = compiled.find(x => matchAt(msg, i, x.keyTokens));
        if (!c) {
            out.push(msg[i]);
            i++;
            continue;
        }
        const next = msg[i + c.keyTokens.length];
        const besideRealName = out[out.length - 1] === c.nameTokens[0] || next === c.nameTokens[c.nameTokens.length - 1];
        if (!besideRealName)
            out.push(...c.nameTokens);
        const k = c.keyTokens.join(' ');
        if (!seen.has(k)) {
            seen.add(k);
            hits.push({ nickname: c.entry.nickname, player: c.entry.player });
        }
        i += c.keyTokens.length;
    }
    return { text: out.join(' '), hits };
}
/** `Logan "Cools" Cooley`; a one-word name gets the nickname in front. */
function formatNicknamed(fullName, nickname) {
    const name = fullName.trim();
    if (!nickname.trim() || (0, text_js_1.normalizeText)(nickname) === (0, text_js_1.normalizeText)(name))
        return name;
    const space = name.indexOf(' ');
    if (space === -1)
        return `"${nickname}" ${name}`;
    return `${name.slice(0, space)} "${nickname}" ${name.slice(space + 1)}`;
}
/** The nickname the user used for `player` (a normalized name as it appears in the resolved text), if any. */
function nicknameUsedFor(player, hits) {
    return hits.find(h => (0, text_js_1.normalizeText)(h.player) === player)?.nickname;
}
/**
 * Safety net for the LLM's get_player_stats input: a nickname becomes the real name
 * ("Spicy Tuna" → "Liam O'Brien"); anything else is passed through unchanged.
 */
function resolveNameQuery(query, nicknames) {
    const normalized = (0, text_js_1.normalizeText)(query);
    const r = resolveNicknames(normalized, nicknames);
    if (r.hits.length === 0)
        return query;
    if (r.hits.length === 1 && r.text === (0, text_js_1.normalizeText)(r.hits[0].player))
        return r.hits[0].player;
    return r.text;
}
/**
 * "Player: Nick, Nick" lines for the LLM system prompt, sorted by player then nickname
 * (independent of DB order) so the cached prompt only changes when the list does.
 */
function formatNicknameList(nicknames) {
    const byPlayer = new Map();
    for (const n of nicknames) {
        const k = (0, text_js_1.normalizeText)(n.player);
        if (!k || !n.nickname.trim())
            continue;
        let g = byPlayer.get(k);
        if (!g)
            byPlayer.set(k, g = { player: n.player.trim(), nicks: new Set() });
        g.nicks.add(n.nickname.trim());
    }
    const cmp = (a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : a < b ? -1 : a > b ? 1 : 0);
    return [...byPlayer.entries()]
        .sort(([a], [b]) => cmp(a, b))
        .map(([, g]) => `- ${g.player}: ${[...g.nicks].sort(cmp).join(', ')}`)
        .join('\n');
}
// --- !ask nick add parsing ---
const RESERVED = new Set(['tusky', 'mammoth', 'the mammoth', 'utah', 'we', 'us', 'our', 'the', 'team', 'the team', 'stats', 'nhl', 'game']);
/** Parses `<nickname> => <player name>` (the part after `!ask nick add`). */
function parseAddNickname(raw) {
    const idx = raw.indexOf('=>');
    if (idx === -1)
        return { ok: false, error: 'Usage: `!ask nick add <nickname> => <player name>`' };
    const nickname = raw.slice(0, idx).trim().replace(/^["“”']+|["“”']+$/g, '').trim();
    const player = raw.slice(idx + 2).trim().replace(/\s+/g, ' ');
    const key = nicknameKey(nickname);
    if (!key)
        return { ok: false, error: 'The nickname is empty after removing punctuation.' };
    if (key.length < 2)
        return { ok: false, error: 'Nicknames need at least two letters.' };
    if (key.length > 40 || (0, text_js_1.tokens)(key).length > 4)
        return { ok: false, error: 'Keep the nickname to four words and 40 characters.' };
    if (RESERVED.has(key) || text_js_1.FILLER_WORDS.has(key))
        return { ok: false, error: `\`${nickname}\` is too common a word to use as a nickname.` };
    if (!(0, text_js_1.normalizeText)(player))
        return { ok: false, error: 'The player name is empty.' };
    if (player.length > 60)
        return { ok: false, error: 'Keep the player name under 60 characters.' };
    return { ok: true, nickname, key, player };
}
//# sourceMappingURL=nicknames.js.map