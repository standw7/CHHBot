"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAskHandler = registerAskHandler;
exports.mentionsBotDirectly = mentionsBotDirectly;
exports.stripBotMention = stripBotMention;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../../db/queries.js");
const data_js_1 = require("./data.js");
const guards_js_1 = require("./guards.js");
const intents_js_1 = require("./intents.js");
const llm_js_1 = require("./llm.js");
const nicknames_js_1 = require("./nicknames.js");
const podcast_js_1 = require("./podcast.js");
const presets_js_1 = require("./presets.js");
const text_js_1 = require("./text.js");
const tools_js_1 = require("./tools.js");
// Ask Tusky: answers questions when someone @mentions Tusky (or replies to one of its answers).
// Tier 1 presets → tier 2 live data → tier 3 Claude Haiku (scope-limited, capped).
const logger = (0, pino_1.default)({ name: 'ask-tusky' });
const MAX_QUESTION_CHARS = 500;
const MAX_CONTEXT_CHARS = 300;
const TYPING_INTERVAL_MS = 8000;
const NO_PINGS = { parse: [], repliedUser: false };
const cooldown = new guards_js_1.Cooldown();
const seededGuilds = new Set();
function registerAskHandler(client, options) {
    const llmClient = options.llmClient
        ?? (options.apiKey ? new sdk_1.default({ apiKey: options.apiKey, maxRetries: 1 }) : undefined);
    if (!llmClient)
        logger.info('ANTHROPIC_API_KEY not set: Ask Tusky runs presets and live data only');
    client.on('messageCreate', async (message) => {
        try {
            await handleMessage(client, message, { ...options, llmClient });
        }
        catch (err) {
            logger.error({ err }, 'Ask Tusky handler error');
        }
    });
}
/** Bot user id mentioned directly in the text (not via reply ping, role, or @everyone). */
function mentionsBotDirectly(content, botId) {
    return new RegExp(`<@!?${botId}>`).test(content);
}
function stripBotMention(content, botId) {
    return content.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}
async function handleMessage(client, message, options) {
    if (message.author.bot || message.webhookId || !message.guild)
        return;
    if (message.content.startsWith('!'))
        return; // prefix commands (messageCreate.ts)
    const botId = client.user?.id;
    if (!botId)
        return;
    if (message.mentions.everyone)
        return; // @everyone / @here never summon Tusky
    // message.mentions.users also contains the author of a replied-to message, so a reply to a
    // goal card would look like a mention. Only a literal <@bot> in the text counts.
    const direct = mentionsBotDirectly(message.content, botId);
    const refId = message.reference?.messageId;
    const followUp = !direct && !!refId && (0, queries_js_1.isAskReply)(refId);
    if (!direct && !followUp)
        return;
    const guild = message.guild;
    const config = (0, queries_js_1.getGuildConfig)(guild.id);
    if (config && config.ask_enabled === 0)
        return;
    if (!cooldown.tryAcquire(message.author.id))
        return; // quiet during the 5s cooldown
    const question = (0, text_js_1.truncate)(stripBotMention(message.content, botId), MAX_QUESTION_CHARS);
    const normalized = (0, text_js_1.normalizeText)(question);
    const day = (0, guards_js_1.askDay)();
    const vars = (0, podcast_js_1.templateVars)(guild);
    const reply = async (tier, payload, logText, llm) => {
        const logId = (0, queries_js_1.logAsk)({
            guildId: guild.id, channelId: message.channelId, userId: message.author.id, day, question,
            tier, answer: logText, llmUsed: llm?.used ?? false, inputTokens: llm?.input ?? 0, outputTokens: llm?.output ?? 0, webSearches: llm?.searches ?? 0,
        });
        try {
            const sent = await message.reply({ ...payload, allowedMentions: NO_PINGS });
            (0, queries_js_1.setAskReplyMessageId)(logId, sent.id);
        }
        catch (err) {
            logger.warn({ err, guildId: guild.id }, 'Ask Tusky reply failed');
        }
    };
    const replyText = (tier, text, llm) => reply(tier, { content: text }, text, llm);
    // Bare mention
    if (!normalized) {
        await replyText('preset', (0, presets_js_1.pickRandom)(presets_js_1.EMPTY_PING_REPLIES));
        return;
    }
    if (!seededGuilds.has(guild.id)) {
        if ((0, queries_js_1.seedAskPresetsOnce)(guild.id, (0, presets_js_1.starterPresetRows)()))
            logger.info({ guildId: guild.id }, 'Seeded Ask Tusky starter presets');
        if ((0, queries_js_1.seedAskNicknamesOnce)(guild.id, (0, nicknames_js_1.starterNicknameRows)()))
            logger.info({ guildId: guild.id }, 'Seeded Ask Tusky player nicknames');
        seededGuilds.add(guild.id);
    }
    // Nicknames → real names ("how many goals does gunner have" → "... dylan guenther ...")
    const nicknames = (0, queries_js_1.getAskNicknames)(guild.id).map(n => ({ nickname: n.nickname, key: n.nickname_key, player: n.player }));
    const resolved = (0, nicknames_js_1.resolveNicknames)(normalized, nicknames);
    // Tier 1: presets. The question as typed first, so a preset whose trigger contains a
    // nickname-like word still fires; then with nicknames resolved.
    const presetGroups = (0, presets_js_1.groupPresets)((0, queries_js_1.getAskPresets)(guild.id));
    const preset = (0, presets_js_1.matchPreset)(normalized, presetGroups)
        ?? (resolved.text !== normalized ? (0, presets_js_1.matchPreset)(resolved.text, presetGroups) : null);
    if (preset) {
        await replyText('preset', (0, presets_js_1.fillTemplate)((0, presets_js_1.pickRandom)(preset.responses).response, vars));
        return;
    }
    // Tier 2: live data
    const intent = (0, intents_js_1.parseIntent)(resolved.text);
    if (intent) {
        const data = await (0, data_js_1.runDataIntent)(intent, guild, config, resolved.hits);
        if (data) {
            await reply('data', { content: data.content, embeds: data.embeds }, data.logText);
            return;
        }
    }
    // Tier 3: LLM
    if (!options.llmClient) {
        await replyText('deflect', (0, presets_js_1.pickRandom)(presets_js_1.DEFLECTIONS));
        return;
    }
    const member = message.member;
    const exempt = !!member && (0, guards_js_1.isCapExempt)(flag => member.permissions.has(flag), member.roles.cache.map(r => r.name), podcast_js_1.CLEAN_HITS.crewRoleName);
    const cap = exempt ? { ok: true } : (0, guards_js_1.checkCaps)((0, queries_js_1.countAskLlmUsage)(guild.id, message.author.id, day), options.caps);
    if (!cap.ok) {
        await replyText('capped', (0, presets_js_1.pickRandom)(cap.scope === 'user' ? presets_js_1.CAPPED_USER_REPLIES : presets_js_1.CAPPED_GUILD_REPLIES));
        return;
    }
    const webSearch = (0, queries_js_1.countAskWebSearches)(guild.id, day) < (options.caps.search ?? 0);
    const repliedTo = refId ? await repliedText(message) : undefined;
    const stopTyping = startTyping(message);
    let outcome;
    try {
        outcome = await (0, llm_js_1.runAskLlm)({
            client: options.llmClient,
            input: { question, repliedTo, today: (0, guards_js_1.todayLong)() },
            nicknames,
            webSearch,
            executeTool: (0, tools_js_1.createToolExecutor)({
                teamCode: config?.primary_team ?? 'UTA',
                timezone: config?.timezone ?? 'America/Denver',
                nicknames,
                gifKeys: () => (0, queries_js_1.listGifKeyCounts)(guild.id),
            }),
        });
    }
    finally {
        stopTyping();
    }
    const llm = { used: true, input: outcome.inputTokens, output: outcome.outputTokens, searches: outcome.webSearches };
    switch (outcome.kind) {
        case 'answer':
            await replyText('llm', (0, presets_js_1.fillTemplate)(outcome.answer, vars), llm);
            return;
        case 'off_topic':
        case 'refusal':
            await replyText('deflect', (0, presets_js_1.pickRandom)(presets_js_1.DEFLECTIONS), llm);
            return;
        case 'error':
            logger.error({ reason: outcome.reason, err: outcome.error, guildId: guild.id }, 'Ask Tusky LLM call failed');
            await replyText('error', (0, presets_js_1.pickRandom)(presets_js_1.ERROR_REPLIES), llm);
            return;
    }
}
/** ≤300 chars of the message being replied to (text, else its embed), as context for the LLM. */
async function repliedText(message) {
    try {
        const ref = await message.fetchReference();
        const embed = ref.embeds[0];
        const text = ref.content || [embed?.title, embed?.description].filter(Boolean).join('\n');
        return text ? (0, text_js_1.truncate)(text.replace(/<@[!&]?\d+>/g, '@someone'), MAX_CONTEXT_CHARS) : undefined;
    }
    catch {
        return undefined;
    }
}
function startTyping(message) {
    const channel = message.channel;
    if (!('sendTyping' in channel))
        return () => { };
    const send = () => { channel.sendTyping().catch(() => { }); };
    send();
    const timer = setInterval(send, TYPING_INTERVAL_MS);
    return () => clearInterval(timer);
}
//# sourceMappingURL=index.js.map