import Anthropic from '@anthropic-ai/sdk';
import type { Client, Message, MessageReplyOptions } from 'discord.js';
import pino from 'pino';
import {
  countAskLlmUsage, countAskWebSearches, getAskNicknames, getAskPresets, listGifKeyCounts, getGuildConfig, isAskReply, logAsk, seedAskNicknamesOnce,
  seedAskPresetsOnce, setAskReplyMessageId,
} from '../../db/queries.js';
import type { AskTier } from '../../db/models.js';
import { runDataIntent } from './data.js';
import { askDay, checkCaps, Cooldown, isCapExempt, todayLong, type CapLimits } from './guards.js';
import { parseIntent } from './intents.js';
import { runAskLlm, type MessagesClient } from './llm.js';
import { resolveNicknames, starterNicknameRows, type Nickname } from './nicknames.js';
import { CLEAN_HITS, templateVars } from './podcast.js';
import {
  CAPPED_GUILD_REPLIES, CAPPED_USER_REPLIES, DEFLECTIONS, EMPTY_PING_REPLIES, ERROR_REPLIES,
  fillTemplate, groupPresets, matchPreset, pickRandom, starterPresetRows,
} from './presets.js';
import { normalizeText, truncate } from './text.js';
import { createToolExecutor } from './tools.js';

// Ask Tusky: answers questions when someone @mentions Tusky (or replies to one of its answers).
// Tier 1 presets → tier 2 live data → tier 3 Claude Haiku (scope-limited, capped).

const logger = pino({ name: 'ask-tusky' });

const MAX_QUESTION_CHARS = 500;
const MAX_CONTEXT_CHARS = 300;
const TYPING_INTERVAL_MS = 8000;
const NO_PINGS = { parse: [] as [], repliedUser: false };

export interface AskOptions {
  apiKey?: string;
  caps: CapLimits;
  /** Injected in tests; defaults to the SDK client when apiKey is set. */
  llmClient?: MessagesClient;
}

const cooldown = new Cooldown();
const seededGuilds = new Set<string>();

export function registerAskHandler(client: Client, options: AskOptions): void {
  const llmClient: MessagesClient | undefined = options.llmClient
    ?? (options.apiKey ? new Anthropic({ apiKey: options.apiKey, maxRetries: 1 }) : undefined);
  if (!llmClient) logger.info('ANTHROPIC_API_KEY not set: Ask Tusky runs presets and live data only');

  client.on('messageCreate', async (message: Message) => {
    try {
      await handleMessage(client, message, { ...options, llmClient });
    } catch (err) {
      logger.error({ err }, 'Ask Tusky handler error');
    }
  });
}

/** Bot user id mentioned directly in the text (not via reply ping, role, or @everyone). */
export function mentionsBotDirectly(content: string, botId: string): boolean {
  return new RegExp(`<@!?${botId}>`).test(content);
}

export function stripBotMention(content: string, botId: string): string {
  return content.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

async function handleMessage(client: Client, message: Message, options: AskOptions & { llmClient?: MessagesClient }): Promise<void> {
  if (message.author.bot || message.webhookId || !message.guild) return;
  if (message.content.startsWith('!')) return; // prefix commands (messageCreate.ts)
  const botId = client.user?.id;
  if (!botId) return;
  if (message.mentions.everyone) return; // @everyone / @here never summon Tusky

  // message.mentions.users also contains the author of a replied-to message, so a reply to a
  // goal card would look like a mention. Only a literal <@bot> in the text counts.
  const direct = mentionsBotDirectly(message.content, botId);
  const refId = message.reference?.messageId;
  const followUp = !direct && !!refId && isAskReply(refId);
  if (!direct && !followUp) return;

  const guild = message.guild;
  const config = getGuildConfig(guild.id);
  if (config && config.ask_enabled === 0) return;

  if (!cooldown.tryAcquire(message.author.id)) return; // quiet during the 5s cooldown

  const question = truncate(stripBotMention(message.content, botId), MAX_QUESTION_CHARS);
  const normalized = normalizeText(question);
  const day = askDay();
  const vars = templateVars(guild);

  type LlmLog = { used: boolean; input: number; output: number; searches?: number };
  const reply = async (tier: AskTier, payload: MessageReplyOptions, logText: string, llm?: LlmLog) => {
    const logId = logAsk({
      guildId: guild.id, channelId: message.channelId, userId: message.author.id, day, question,
      tier, answer: logText, llmUsed: llm?.used ?? false, inputTokens: llm?.input ?? 0, outputTokens: llm?.output ?? 0, webSearches: llm?.searches ?? 0,
    });
    try {
      const sent = await message.reply({ ...payload, allowedMentions: NO_PINGS });
      setAskReplyMessageId(logId, sent.id);
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, 'Ask Tusky reply failed');
    }
  };
  const replyText = (tier: AskTier, text: string, llm?: LlmLog) =>
    reply(tier, { content: text }, text, llm);

  // Bare mention
  if (!normalized) {
    await replyText('preset', pickRandom(EMPTY_PING_REPLIES));
    return;
  }

  if (!seededGuilds.has(guild.id)) {
    if (seedAskPresetsOnce(guild.id, starterPresetRows())) logger.info({ guildId: guild.id }, 'Seeded Ask Tusky starter presets');
    if (seedAskNicknamesOnce(guild.id, starterNicknameRows())) logger.info({ guildId: guild.id }, 'Seeded Ask Tusky player nicknames');
    seededGuilds.add(guild.id);
  }

  // Nicknames → real names ("how many goals does gunner have" → "... dylan guenther ...")
  const nicknames: Nickname[] = getAskNicknames(guild.id).map(n => ({ nickname: n.nickname, key: n.nickname_key, player: n.player }));
  const resolved = resolveNicknames(normalized, nicknames);

  // Tier 1: presets. The question as typed first, so a preset whose trigger contains a
  // nickname-like word still fires; then with nicknames resolved.
  const presetGroups = groupPresets(getAskPresets(guild.id));
  const preset = matchPreset(normalized, presetGroups)
    ?? (resolved.text !== normalized ? matchPreset(resolved.text, presetGroups) : null);
  if (preset) {
    await replyText('preset', fillTemplate(pickRandom(preset.responses).response, vars));
    return;
  }

  // Tier 2: live data
  const intent = parseIntent(resolved.text);
  if (intent) {
    const data = await runDataIntent(intent, guild, config, resolved.hits);
    if (data) {
      await reply('data', { content: data.content, embeds: data.embeds }, data.logText);
      return;
    }
  }

  // Tier 3: LLM
  if (!options.llmClient) {
    await replyText('deflect', pickRandom(DEFLECTIONS));
    return;
  }
  const member = message.member;
  const exempt = !!member && isCapExempt(
    flag => member.permissions.has(flag),
    member.roles.cache.map(r => r.name),
    CLEAN_HITS.crewRoleName
  );
  const cap = exempt ? { ok: true as const } : checkCaps(countAskLlmUsage(guild.id, message.author.id, day), options.caps);
  if (!cap.ok) {
    await replyText('capped', pickRandom(cap.scope === 'user' ? CAPPED_USER_REPLIES : CAPPED_GUILD_REPLIES));
    return;
  }

  const webSearch = countAskWebSearches(guild.id, day) < (options.caps.search ?? 0);
  const repliedTo = refId ? await repliedText(message) : undefined;
  const stopTyping = startTyping(message);
  let outcome;
  try {
    outcome = await runAskLlm({
      client: options.llmClient,
      input: { question, repliedTo, today: todayLong() },
      nicknames,
      webSearch,
      executeTool: createToolExecutor({
        teamCode: config?.primary_team ?? 'UTA',
        timezone: config?.timezone ?? 'America/Denver',
        nicknames,
        gifKeys: () => listGifKeyCounts(guild.id),
      }),
    });
  } finally {
    stopTyping();
  }

  const llm = { used: true, input: outcome.inputTokens, output: outcome.outputTokens, searches: outcome.webSearches };
  switch (outcome.kind) {
    case 'answer':
      await replyText('llm', fillTemplate(outcome.answer, vars), llm);
      return;
    case 'off_topic':
    case 'refusal':
      await replyText('deflect', pickRandom(DEFLECTIONS), llm);
      return;
    case 'error':
      logger.error({ reason: outcome.reason, err: outcome.error, guildId: guild.id }, 'Ask Tusky LLM call failed');
      await replyText('error', pickRandom(ERROR_REPLIES), llm);
      return;
  }
}

/** ≤300 chars of the message being replied to (text, else its embed), as context for the LLM. */
async function repliedText(message: Message): Promise<string | undefined> {
  try {
    const ref = await message.fetchReference();
    const embed = ref.embeds[0];
    const text = ref.content || [embed?.title, embed?.description].filter(Boolean).join('\n');
    return text ? truncate(text.replace(/<@[!&]?\d+>/g, '@someone'), MAX_CONTEXT_CHARS) : undefined;
  } catch {
    return undefined;
  }
}

function startTyping(message: Message): () => void {
  const channel = message.channel;
  if (!('sendTyping' in channel)) return () => {};
  const send = () => { channel.sendTyping().catch(() => {}); };
  send();
  const timer = setInterval(send, TYPING_INTERVAL_MS);
  return () => clearInterval(timer);
}
