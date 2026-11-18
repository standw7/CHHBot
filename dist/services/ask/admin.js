"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePrefixAsk = handlePrefixAsk;
const discord_js_1 = require("discord.js");
const queries_js_1 = require("../../db/queries.js");
const presets_js_1 = require("./presets.js");
const text_js_1 = require("./text.js");
// !ask add <trigger> => <response> | !ask list | !ask remove <id> | !ask misses [n]  (Manage Server)
const USAGE = [
    '**Ask Tusky presets** (Manage Server)',
    '`!ask add <trigger> => <response>` - add a response (several per trigger = random pick). Prefix the trigger with `exact:` to fire only on the whole message.',
    '`!ask list` - all presets with ids',
    '`!ask remove <id>` - remove one response',
    '`!ask misses [n]` - recent questions that went to the LLM or got deflected (default 15)',
    'Responses can use `{youtube}`, `{substack}`, `{crew_role}`. Toggle the feature with `/config set setting:ask value:on|off`.',
].join('\n');
const NO_PINGS = { parse: [], repliedUser: false };
async function handlePrefixAsk(message, args) {
    if (!message.member?.permissions.has(discord_js_1.PermissionFlagsBits.ManageGuild)) {
        await message.reply({ content: 'You need Manage Server permission to manage Ask Tusky.', allowedMentions: NO_PINGS });
        return;
    }
    const guildId = message.guild.id;
    const sub = args[0]?.toLowerCase();
    // Seed first so `!ask list` on a fresh guild shows the starter set
    (0, queries_js_1.seedAskPresetsOnce)(guildId, (0, presets_js_1.starterPresetRows)());
    switch (sub) {
        case 'add': {
            const raw = message.content.replace(/^!ask\s+add\s*/i, '');
            const parsed = (0, presets_js_1.parseAddPreset)(raw);
            if (!parsed.ok) {
                await message.reply({ content: parsed.error, allowedMentions: NO_PINGS });
                return;
            }
            const id = (0, queries_js_1.addAskPreset)(guildId, parsed.trigger, parsed.response, parsed.exactOnly, message.author.id);
            await message.reply({
                content: `Added #${id}: \`${parsed.trigger}\`${parsed.exactOnly ? ' (exact)' : ''} → ${(0, text_js_1.truncate)(parsed.response, 200)}`,
                allowedMentions: NO_PINGS,
            });
            return;
        }
        case 'list': {
            const rows = (0, queries_js_1.getAskPresets)(guildId);
            if (rows.length === 0) {
                await message.reply({ content: 'No presets. Add one with `!ask add <trigger> => <response>`.', allowedMentions: NO_PINGS });
                return;
            }
            const lines = rows.map(r => `#${r.id} ${r.exact_only ? '[exact] ' : ''}${r.trigger} → ${r.response.replace(/\n/g, ' / ')}`);
            const text = `${rows.length} presets\n` + lines.join('\n');
            if (text.length <= 1900) {
                await message.reply({ content: '```\n' + text + '\n```', allowedMentions: NO_PINGS });
            }
            else {
                const file = new discord_js_1.AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'ask-presets.txt' });
                await message.reply({ content: `${rows.length} presets (attached).`, files: [file], allowedMentions: NO_PINGS });
            }
            return;
        }
        case 'remove':
        case 'delete': {
            const id = parseInt((args[1] ?? '').replace(/^#/, ''), 10);
            if (!Number.isInteger(id)) {
                await message.reply({ content: 'Usage: `!ask remove <id>` (ids are in `!ask list`).', allowedMentions: NO_PINGS });
                return;
            }
            const ok = (0, queries_js_1.removeAskPreset)(guildId, id);
            await message.reply({ content: ok ? `Removed #${id}.` : `No preset #${id} here.`, allowedMentions: NO_PINGS });
            return;
        }
        case 'misses': {
            const n = Math.min(50, Math.max(1, parseInt(args[1] ?? '', 10) || 15));
            const rows = (0, queries_js_1.getAskMisses)(guildId, n);
            if (rows.length === 0) {
                await message.reply({ content: 'No misses yet.', allowedMentions: NO_PINGS });
                return;
            }
            const lines = rows.map(r => {
                const when = r.created_at.slice(0, 16).replace('T', ' ');
                return `${when} [${r.tier}] ${(0, text_js_1.truncate)(r.question.replace(/\n/g, ' '), 120)}\n    → ${(0, text_js_1.truncate)((r.answer ?? '').replace(/\n/g, ' '), 120)}`;
            });
            const text = `Last ${rows.length} LLM/deflected questions (UTC):\n` + lines.join('\n');
            if (text.length <= 1900) {
                await message.reply({ content: '```\n' + text + '\n```', allowedMentions: NO_PINGS });
            }
            else {
                const file = new discord_js_1.AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'ask-misses.txt' });
                await message.reply({ content: `Last ${rows.length} misses (attached).`, files: [file], allowedMentions: NO_PINGS });
            }
            return;
        }
        default:
            await message.reply({ content: USAGE, allowedMentions: NO_PINGS });
    }
}
//# sourceMappingURL=admin.js.map