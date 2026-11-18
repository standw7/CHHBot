import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Guild } from 'discord.js';
import { crewRoleText, formatEpisodeReply, parseRssFeed, parseYouTubeFeed, templateVars } from './podcast.js';

const YT = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UC1b1UeuxqeFbsqtyY8bJg3A"/>
 <title>Clean Hits Hockey</title>
 <entry>
  <id>yt:video:older</id>
  <yt:videoId>older</yt:videoId>
  <title>Prospect Check-In &amp; Draft Talk</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=older"/>
  <published>2026-11-07T18:00:00+00:00</published>
  <media:group><media:title>Prospect Check-In &amp; Draft Talk</media:title></media:group>
 </entry>
 <entry>
  <id>yt:video:newest</id>
  <yt:videoId>newest</yt:videoId>
  <title>Breaking Down the Tape with Hockey Alchemy</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=newest"/>
  <author><name>Clean Hits Hockey</name><uri>https://www.youtube.com/channel/UC1b1UeuxqeFbsqtyY8bJg3A</uri></author>
  <published>2026-11-14T19:30:00+00:00</published>
  <updated>2026-11-15T01:00:00+00:00</updated>
 </entry>
</feed>`;

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title><![CDATA[Clean Hits Hockey]]></title><link>https://cleanhits.substack.com</link>
<item><title><![CDATA[Cory's Utah HC Midseason Report Cards]]></title><link>https://cleanhits.substack.com/p/corys-report-cards</link><pubDate>Mon, 10 Mar 2025 15:00:00 GMT</pubDate></item>
<item><title><![CDATA[Brad's Utah HC Midseason Report Cards]]></title><link>https://cleanhits.substack.com/p/brads-report-cards</link><pubDate>Sat, 01 Feb 2025 15:00:00 GMT</pubDate></item>
</channel></rss>`;

describe('feed parsing', () => {
  test('YouTube Atom: newest first, entities decoded, channel-level link ignored', () => {
    const items = parseYouTubeFeed(YT);
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
      title: 'Breaking Down the Tape with Hockey Alchemy',
      url: 'https://www.youtube.com/watch?v=newest',
      published: '2026-11-14T19:30:00.000Z',
    });
    assert.equal(items[1].title, 'Prospect Check-In & Draft Talk');
  });

  test('Substack RSS: CDATA titles, newest first', () => {
    const items = parseRssFeed(RSS);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, "Cory's Utah HC Midseason Report Cards");
    assert.equal(items[0].url, 'https://cleanhits.substack.com/p/corys-report-cards');
    assert.equal(items[0].published, '2025-03-10T15:00:00.000Z');
  });

  test('garbage in → empty list', () => {
    assert.deepEqual(parseYouTubeFeed('<html>nope</html>'), []);
    assert.deepEqual(parseRssFeed(''), []);
  });

  test('episode reply puts the URL on its own line', () => {
    const text = formatEpisodeReply(parseYouTubeFeed(YT)[0]);
    assert.equal(text, 'Newest Clean Hits episode: "Breaking Down the Tape with Hockey Alchemy" (Nov 14, 2026).\nhttps://www.youtube.com/watch?v=newest');
  });
});

describe('crew role', () => {
  const guildWith = (roles: { id: string; name: string }[]) =>
    ({ roles: { cache: { find: (fn: (r: { id: string; name: string }) => boolean) => roles.find(fn) } } }) as unknown as Guild;

  test('role found (case-insensitive) → role mention', () => {
    assert.equal(crewRoleText(guildWith([{ id: '42', name: 'clean hits crew' }])), '<@&42>');
  });
  test('missing role or guild → plain text', () => {
    assert.equal(crewRoleText(guildWith([{ id: '1', name: 'Mods' }])), 'the Clean Hits Crew');
    assert.equal(crewRoleText(null), 'the Clean Hits Crew');
  });
  test('template vars include links', () => {
    const v = templateVars(null);
    assert.equal(v.youtube, 'https://www.youtube.com/@CleanHitsHockey');
    assert.equal(v.substack, 'https://cleanhits.substack.com/');
  });
});
