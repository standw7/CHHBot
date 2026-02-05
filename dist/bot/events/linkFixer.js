"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLinkFixer = registerLinkFixer;
const queries_js_1 = require("../../db/queries.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'link-fixer' });
// Patterns and their replacements for better Discord embeds
const LINK_REPLACEMENTS = [
    {
        pattern: /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([\w/]+\/status\/\d+\S*)/gi,
        replace: 'https://fxtwitter.com/$3',
        label: 'Twitter/X',
    },
];
function registerLinkFixer(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot)
            return;
        if (!message.guild)
            return;
        const config = (0, queries_js_1.getGuildConfig)(message.guild.id);
        if (!config || !config.link_fix_enabled)
            return;
        const fixedLinks = [];
        for (const { pattern, replace, label } of LINK_REPLACEMENTS) {
            // Reset regex state since it's global
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(message.content)) !== null) {
                const fixed = match[0].replace(new RegExp(pattern.source, 'i'), replace);
                fixedLinks.push(fixed);
            }
        }
        if (fixedLinks.length === 0)
            return;
        try {
            // Suppress the original embeds
            if (message.embeds.length > 0 || true) {
                try {
                    await message.suppressEmbeds(true);
                }
                catch {
                    // May lack permission, that's fine
                }
            }
            await message.reply({
                content: fixedLinks.join('\n'),
                allowedMentions: { repliedUser: false },
            });
        }
        catch (error) {
            logger.error({ error }, 'Failed to post fixed links');
        }
    });
}
//# sourceMappingURL=linkFixer.js.map