import { Client, Message } from 'discord.js';
import { getGuildConfig } from '../../db/queries.js';
import pino from 'pino';

const logger = pino({ name: 'link-fixer' });

// Patterns and their replacements for better Discord embeds
const LINK_REPLACEMENTS: { pattern: RegExp; replace: string; label: string }[] = [
  {
    pattern: /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([\w/]+\/status\/\d+\S*)/gi,
    replace: 'https://fxtwitter.com/$3',
    label: 'Twitter/X',
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
