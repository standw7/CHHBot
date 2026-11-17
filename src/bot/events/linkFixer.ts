import { Client, Message } from 'discord.js';
import { getGuildConfig } from '../../db/queries.js';
import pino from 'pino';

const logger = pino({ name: 'link-fixer' });

// Patterns and their replacements for better Discord embeds
// Only matches original domains (not already-fixed ones)
const LINK_REPLACEMENTS: { pattern: RegExp; replace: string; label: string }[] = [
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

export function registerLinkFixer(client: Client): void {
  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const config = getGuildConfig(message.guild.id);
    if (!config || !config.link_fix_enabled) return;

    const fixedLinks: string[] = [];

    for (const { pattern, replace, label } of LINK_REPLACEMENTS) {
      // Reset regex state since it's global
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(message.content)) !== null) {
        const fixed = match[0].replace(new RegExp(pattern.source, 'i'), replace);
        fixedLinks.push(fixed);
      }
    }

    if (fixedLinks.length === 0) return;

    try {
      // Suppress the original embeds
      if (message.embeds.length > 0 || true) {
        try {
          await message.suppressEmbeds(true);
        } catch {
          // May lack permission, that's fine
        }
      }

      await message.reply({
        content: fixedLinks.join('\n'),
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to post fixed links');
    }
  });
}
