"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_TRIGGER_COVERAGE = exports.ERROR_REPLIES = exports.CAPPED_GUILD_REPLIES = exports.CAPPED_USER_REPLIES = exports.DEFLECTIONS = exports.EMPTY_PING_REPLIES = exports.STARTER_PRESETS = void 0;
exports.pickRandom = pickRandom;
exports.starterPresetRows = starterPresetRows;
exports.groupPresets = groupPresets;
exports.matchPreset = matchPreset;
exports.fillTemplate = fillTemplate;
exports.parseAddPreset = parseAddPreset;
const text_js_1 = require("./text.js");
const HELP_TEXT = 'I answer questions about the Utah Mammoth, the NHL, and the Clean Hits Hockey podcast. ' +
    'Live lookups: next game, standings, last game, player stats, newest Clean Hits episode.\n' +
    'Commands worth knowing: `!next`, `!schedule`, `!standings`, `!player <name>`, `!stats <category>`, `!watch`, `!replay`. Everything else: `!help`.';
exports.STARTER_PRESETS = [
    {
        triggers: ['hi', 'hey', 'hello', 'yo', 'sup', 'howdy', 'hiya', 'gm', 'good morning', 'good afternoon', 'good evening'],
        exactOnly: ['hi', 'hey', 'hello', 'yo', 'sup', 'howdy', 'hiya', 'gm'],
        responses: [
            'Hello. Ask me something about the Mammoth.',
            'Hi. I answer hockey questions. That is the whole bit.',
            'Present. What do you need?',
        ],
    },
    {
        triggers: ['tusky', 'you there', 'are you there', 'you alive', 'are you alive', 'wake up'],
        exactOnly: ['tusky'],
        responses: ['You rang?', 'Here.', 'Awake. Mostly.'],
    },
    {
        triggers: ['thanks', 'thank you', 'thx', 'ty', 'tysm', 'thanks for the help', 'appreciate it', 'appreciate you', 'cheers'],
        exactOnly: ['ty', 'thx', 'tysm', 'cheers'],
        responses: ['Sure.', 'Any time. Within reason.', 'That is what I am here for. That and goal cards.'],
    },
    {
        triggers: ['good bot', 'good tusky', 'nice job', 'well done', 'smart bot', 'best bot', 'good job'],
        responses: ['I know.', 'Noted. I will put it in my file.', 'Thank you. Please tell the refs.'],
    },
    {
        triggers: ['bad bot', 'bad tusky', 'dumb bot', 'stupid bot', 'you suck', 'worst bot', 'useless bot'],
        responses: [
            'Feedback received. Filed under later.',
            'Fair. I am a woolly mammoth with a Wi-Fi connection.',
            'I will raise it with management. Management is also me.',
        ],
    },
    {
        triggers: ['who are you', 'what are you', 'who is tusky', 'whos tusky', 'what is tusky', 'whats tusky', 'introduce yourself'],
        responses: [
            'I am Tusky, this server\'s bot. I post goal cards, track games, and answer Mammoth, hockey, and Clean Hits questions. `!help` has the rest.',
        ],
    },
    {
        triggers: ['help', 'what can you do', 'what do you do', 'how do i use you', 'what can i ask you', 'what can i ask', 'commands', 'what are your commands'],
        exactOnly: ['help', 'commands'],
        responses: [HELP_TEXT],
    },
    {
        triggers: ['go mammoth', 'lets go mammoth', 'tusks up', 'go utah', 'lets go utah', 'mammoth time'],
        responses: ['Tusks up.', 'Tusks up. Hydrate.', 'Go Mammoth. Calmly, but with conviction.'],
    },
    {
        triggers: ['are we making the playoffs', 'will we make the playoffs', 'are we going to make the playoffs', 'are we gonna make the playoffs', 'are we a playoff team', 'playoffs'],
        exactOnly: ['playoffs'],
        responses: [
            'I do not predict. I report. `!standings` is the report.',
            'Too early for me to promise anything. `!standings` shows the current damage.',
        ],
    },
    {
        triggers: ['whos the best player', 'who is the best player', 'whos our best player', 'who is our best player', 'best player', 'whos the best player on the team'],
        exactOnly: ['best player'],
        responses: ['Depends who you ask. `!stats points` has the receipts.', 'I do not do rankings. I do `!stats points`.'],
    },
    {
        triggers: ['refs', 'the refs', 'refs suck', 'these refs', 'fire the refs', 'refs are blind', 'ref show', 'terrible call', 'bad call', 'what a call'],
        exactOnly: ['refs'],
        responses: [
            'I have filed a complaint. It went where they all go.',
            'The refs have been notified. They did not respond.',
            'Agreed. Officially, I have no comment.',
        ],
    },
    {
        triggers: ['love you', 'i love you', 'ily', 'love you tusky', 'marry me'],
        exactOnly: ['ily'],
        responses: ['I know.', 'That is nice. I love a clean zone entry.', 'Appreciated. Keep it together during the third period.'],
    },
    {
        triggers: ['ping'],
        exactOnly: ['ping'],
        responses: ['Pong.', 'Pong. Still here.'],
    },
    {
        triggers: [
            'where can i listen', 'where can i listen to clean hits', 'where do i listen', 'how do i listen to clean hits',
            'where is the podcast', 'wheres the podcast', 'where can i watch clean hits', 'clean hits', 'clean hits hockey',
            'the podcast', 'podcast link', 'podcast', 'where is clean hits', 'wheres clean hits', 'clean hits link', 'clean hits youtube',
        ],
        exactOnly: ['podcast'],
        responses: [
            'Clean Hits Hockey is on YouTube: {youtube}\nThe Substack is at {substack}',
            'YouTube: {youtube}\nSubstack: {substack}',
        ],
    },
    {
        triggers: [
            'who hosts clean hits', 'who hosts the podcast', 'who runs clean hits', 'who does clean hits', 'clean hits hosts',
            'who are the hosts', 'who hosts the pod', 'who is on clean hits', 'whos on clean hits', 'who makes clean hits',
        ],
        responses: ['That would be {crew_role}.', '{crew_role}. Direct complaints accordingly.'],
    },
    {
        triggers: ['what is clean hits', 'whats clean hits', 'what is clean hits hockey', 'whats clean hits hockey', 'what is the podcast'],
        responses: [
            'Clean Hits Hockey is a Utah Mammoth podcast from Coyotes diehards who followed the team to Utah. Prospects, the draft, game breakdowns, trades. {youtube}',
        ],
    },
    {
        triggers: ['how are you', 'how are you doing', 'hows it going', 'whats up', 'wassup', 'how you doing', 'hows your day'],
        exactOnly: ['wassup'],
        responses: ['Fine. Waiting for puck drop.', 'Operational.', 'Same as always. Watching the standings.'],
    },
    {
        triggers: ['good night', 'goodnight', 'gn', 'night'],
        exactOnly: ['gn', 'night'],
        responses: ['Good night. The standings will still be there tomorrow.', 'Night.'],
    },
    {
        triggers: ['are you a bot', 'are you real', 'are you ai', 'are you an ai', 'are you human', 'are you chatgpt', 'are you sentient'],
        responses: ['I am a bot. A mammoth-shaped one.', 'Bot. Hockey-specific. No feelings, strong opinions about icing.'],
    },
    {
        triggers: ['where can i watch', 'where can i watch the game', 'how do i watch the game', 'what channel is the game on', 'what channel', 'where is the game on', 'is the game on tv'],
        responses: ['`!watch` has the broadcast info.', 'Try `!watch`. It knows the channels.'],
    },
    {
        triggers: ['how old are you', 'when were you born', 'whats your age'],
        responses: ['Old enough to remember the Utah Hockey Club name.'],
    },
    {
        triggers: ['whats your favorite team', 'what is your favorite team', 'favorite team', 'who do you root for'],
        responses: ['The Utah Mammoth. I was built for this.', 'Utah. It is in my contract.'],
    },
    {
        triggers: ['who made you', 'who built you', 'who created you', 'who coded you', 'who owns you'],
        responses: ['Someone in this server with a laptop and too much free time. I do not name names.'],
    },
    {
        triggers: ['sorry', 'my bad', 'sorry tusky'],
        responses: ['It is fine.', 'Forgiven. Probably.'],
    },
    {
        triggers: ['boo', 'booo', 'boooo'],
        exactOnly: ['boo', 'booo', 'boooo'],
        responses: ['Noted.', 'Boo received.'],
    },
    {
        triggers: ['remind me', 'set a reminder', 'how do i set a reminder', 'reminder'],
        exactOnly: ['reminder'],
        responses: ['`!remind <time> <message>`. Add `--dm` if you want it private.'],
    },
    {
        triggers: ['what is a mammoth', 'whats a mammoth', 'why mammoth', 'why are we called the mammoth'],
        responses: ['Big, hairy, extinct, and now in the Central Division. Ask me something about the team.'],
    },
    {
        triggers: ['tell me a joke', 'say something funny', 'joke', 'be funny'],
        exactOnly: ['joke'],
        responses: ['The power play.', 'I am not that kind of bot. Ask me about the standings instead.'],
    },
];
/** Shown when someone mentions Tusky with nothing else. */
exports.EMPTY_PING_REPLIES = ['You rang? Ask me something about the Mammoth.', 'Yes?', 'Present. Ask away.'];
/** Off-topic questions (and everything the LLM tier can't take when it's disabled). */
exports.DEFLECTIONS = [
    'I\'m a hockey mammoth. Ask me about hockey.',
    'That\'s outside my rink. Mammoth, NHL, or Clean Hits. Pick one.',
    'I only know hockey. It\'s a narrow life, but it\'s mine.',
    'Not my department. My department is hockey.',
    'I\'m going to pass on that one. Ask me about the Mammoth.',
    'Can\'t help there. I\'m strictly a hockey bot.',
    'Hard pass. Try me on schedules, standings, or stats.',
];
exports.CAPPED_USER_REPLIES = [
    'I\'m out of thinking for you today. Presets and `!` commands still work.',
    'That\'s all the thinking I can spare you today. Try again tomorrow.',
];
exports.CAPPED_GUILD_REPLIES = [
    'I\'m out of thinking for today. Try again tomorrow.',
    'The whole server used up my thinking for today. Back tomorrow.',
];
exports.ERROR_REPLIES = [
    'Something broke on my end. Try again in a minute.',
    'My brain timed out. Try again shortly.',
];
function pickRandom(items, rng = Math.random) {
    return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
/** Starter set flattened to DB rows (one row per trigger × response). */
function starterPresetRows() {
    const rows = [];
    for (const p of exports.STARTER_PRESETS) {
        for (const raw of p.triggers) {
            const trigger = (0, text_js_1.normalizeText)(raw);
            const exactOnly = (p.exactOnly ?? []).includes(raw);
            for (const response of p.responses)
                rows.push({ trigger, response, exactOnly });
        }
    }
    return rows;
}
/** Groups DB rows by (trigger, exact_only) so each trigger picks among its responses. */
function groupPresets(rows) {
    const map = new Map();
    for (const r of rows) {
        const exactOnly = !!r.exact_only;
        const key = `${exactOnly ? 1 : 0}|${r.trigger}`;
        let g = map.get(key);
        if (!g) {
            g = { trigger: r.trigger, exactOnly, responses: [] };
            map.set(key, g);
        }
        g.responses.push({ id: r.id, response: r.response });
    }
    return [...map.values()];
}
/**
 * A phrase trigger only fires on a "clean hit": its words make up at least this share of
 * the message's non-filler words ("thanks so much" yes; "thanks, but when is the game" no).
 */
exports.MIN_TRIGGER_COVERAGE = 0.7;
function containsPhrase(haystack, needle) {
    if (needle.length === 0 || needle.length > haystack.length)
        return false;
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++)
            if (haystack[i + j] !== needle[j])
                continue outer;
        return true;
    }
    return false;
}
function hits(group, variant) {
    const msg = (0, text_js_1.tokens)(variant);
    const msgContent = (0, text_js_1.contentTokens)(msg);
    const trig = (0, text_js_1.tokens)(group.trigger);
    if (trig.length === 0)
        return false;
    // Exact: the whole message is the trigger (optionally padded with filler words)
    if (variant === group.trigger || msgContent.join(' ') === group.trigger)
        return true;
    if (group.exactOnly)
        return false;
    if (!containsPhrase(msg, trig))
        return false;
    const trigContent = (0, text_js_1.contentTokens)(trig).length || trig.length;
    return trigContent / Math.max(1, msgContent.length) >= exports.MIN_TRIGGER_COVERAGE;
}
/** Best preset for a normalized message: longest matching trigger wins. */
function matchPreset(normalized, groups) {
    const variants = [...new Set([normalized, (0, text_js_1.stripVocative)(normalized)])].filter(Boolean);
    let best = null;
    for (const g of groups) {
        if (!variants.some(v => hits(g, v)))
            continue;
        if (!best ||
            (0, text_js_1.tokens)(g.trigger).length > (0, text_js_1.tokens)(best.trigger).length ||
            ((0, text_js_1.tokens)(g.trigger).length === (0, text_js_1.tokens)(best.trigger).length && g.trigger.length > best.trigger.length)) {
            best = g;
        }
    }
    return best;
}
/** Replaces {name} placeholders that have a value; unknown ones are left as-is. */
function fillTemplate(text, vars) {
    return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? vars[name] : whole));
}
/**
 * Parses `<trigger> => <response>` (the part after `!ask add`). Prefix the trigger with
 * `exact:` to make it fire only when it is the whole message; one-word triggers of up to
 * three letters ("hi", "gm") are exact-only automatically.
 */
function parseAddPreset(raw) {
    const idx = raw.indexOf('=>');
    if (idx === -1)
        return { ok: false, error: 'Usage: `!ask add <trigger> => <response>` (prefix the trigger with `exact:` for whole-message only)' };
    let triggerRaw = raw.slice(0, idx).trim();
    const response = raw.slice(idx + 2).trim();
    let exactOnly = false;
    if (/^exact:/i.test(triggerRaw)) {
        exactOnly = true;
        triggerRaw = triggerRaw.slice(6).trim();
    }
    const trigger = (0, text_js_1.normalizeText)(triggerRaw);
    if (!trigger)
        return { ok: false, error: 'The trigger is empty after removing punctuation.' };
    if (trigger.length > 100)
        return { ok: false, error: 'Keep the trigger under 100 characters.' };
    if (!response)
        return { ok: false, error: 'The response is empty.' };
    if (response.length > 1500)
        return { ok: false, error: 'Keep the response under 1500 characters.' };
    if (!trigger.includes(' ') && trigger.length <= 3)
        exactOnly = true;
    return { ok: true, trigger, response, exactOnly };
}
//# sourceMappingURL=presets.js.map