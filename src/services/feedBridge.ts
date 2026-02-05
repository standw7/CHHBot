import RssParser from 'rss-parser';
import pino from 'pino';

const logger = pino({ name: 'feed-bridge' });
const parser = new RssParser();

interface BridgeResult {
  url: string;
  bridge: string;
}

// RSS bridge services that convert Twitter/X profiles to RSS
// Ordered by reliability -- tries each until one works
const RSSHUB_BASE = process.env.RSSHUB_URL || 'http://localhost:1200';

const TWITTER_BRIDGES: { name: string; urlTemplate: (username: string) => string }[] = [
  {
    name: 'local-rsshub',
    urlTemplate: (u) => `${RSSHUB_BASE}/twitter/user/${u}`,
  },
  {
    name: 'rsshub.app',
    urlTemplate: (u) => `https://rsshub.app/twitter/user/${u}`,
  },
  {
    name: 'nitter.poast.org',
    urlTemplate: (u) => `https://nitter.poast.org/${u}/rss`,
  },
  {
    name: 'nitter.privacydev.net',
    urlTemplate: (u) => `https://nitter.privacydev.net/${u}/rss`,
  },
  {
    name: 'twiiit.com',
    urlTemplate: (u) => `https://twiiit.com/${u}/rss`,
  },
  {
    name: 'rss.app (bird.makeup)',
    urlTemplate: (u) => `https://bird.makeup/users/${u}/rss`,
  },
];

export async function tryTwitterRssBridges(username: string): Promise<BridgeResult | null> {
  for (const bridge of TWITTER_BRIDGES) {
    const url = bridge.urlTemplate(username);
    logger.info({ bridge: bridge.name, url }, 'Trying RSS bridge');

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Tusky-Discord-Bot/1.0' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        logger.info({ bridge: bridge.name, status: response.status }, 'Bridge returned non-OK');
        continue;
      }

      // Verify it's actually valid RSS by parsing it
      const text = await response.text();
      const feed = await parser.parseString(text);

      if (feed && feed.items && feed.items.length > 0) {
        logger.info({ bridge: bridge.name, itemCount: feed.items.length }, 'Bridge working');
        return { url, bridge: bridge.name };
      }

      logger.info({ bridge: bridge.name }, 'Bridge returned empty feed');
    } catch (error) {
      logger.info({ bridge: bridge.name, err: error }, 'Bridge failed');
    }
  }

  return null;
}
