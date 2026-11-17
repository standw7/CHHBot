"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLinkFixer = registerLinkFixer;
const queries_js_1 = require("../../db/queries.js");
const hofLinks_js_1 = require("../../services/hofLinks.js");
const socialCaption_js_1 = require("../../services/socialCaption.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'link-fixer' });
// Patterns and their replacements for better Discord embeds
// Only matches original domains (not already-fixed ones)
const LINK_REPLACEMENTS = [
    {
        pattern: /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([\w/]+\/status\/\d+\S*)/gi,
        replace: 'https://fxtwitter.com/$3',
        label: 'Twitter/X',
    },
    {
        pattern: /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/([\w-]+\S*)/gi,
        // ddinstagram.com is dead (no longer resolves); vxinstagram verified 2026-11-17
        replace: 'https://vxinstagram.com/$2/$3',
        label: 'Instagram',
    },
    // vxtiktok.com no longer serves video embeds; tnktok (fxTikTok) verified 2026-11-17
    {
        pattern: /https?:\/\/vm\.tiktok\.com\/(\S+)/gi,
        replace: 'https://vm.tnktok.com/$1',
        label: 'TikTok',
    },
    {
        pattern: /https?:\/\/(www\.)?tiktok\.com\/(\S+)/gi,
        replace: 'https://tnktok.com/$2',
        label: 'TikTok',
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
                fixedLinks.push({ url: fixed, label });
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
            // vxinstagram's player-card embed hides the caption, so post it under the link ourselves.
            // (Twitter/TikTok embeds already show their text.)
            const links = await Promise.all(fixedLinks.map(async ({ url, label }) => ({
                url,
                caption: label === 'Instagram' ? await (0, socialCaption_js_1.fetchInstagramCaption)(url) : null,
            })));
            await message.reply({
                content: (0, hofLinks_js_1.buildFollowupContent)(null, links),
                allowedMentions: { parse: [], repliedUser: false },
            });
        }
        catch (error) {
            logger.error({ error }, 'Failed to post fixed links');
        }
    });
}
//# sourceMappingURL=linkFixer.js.map