import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isDownloadableFile, isDiscordAttachment, validateMedia, displayFileName, MAX_MEDIA_BYTES, uploadLimitBytes } from './media.js';

describe('isDownloadableFile', () => {
  test('Discord attachment links are downloaded (any domain variant, with or without params)', () => {
    assert.equal(isDownloadableFile('https://cdn.discordapp.com/attachments/1/2/IMG_1702.gif?ex=69ae&is=69ac&hm=fe16&'), true);
    assert.equal(isDownloadableFile('https://media.discordapp.net/attachments/1/2/image.png?ex=1&width=800'), true);
    assert.equal(isDownloadableFile('https://cdn.discordapp.com/attachments/1/2/clip.mp3'), true);
  });

  test('direct file links on other hosts are downloaded', () => {
    assert.equal(isDownloadableFile('https://i.imgur.com/ynlv4P5.png'), true);
    assert.equal(isDownloadableFile('https://example.com/sounds/horn.MP3'), true);
    assert.equal(isDownloadableFile('https://example.com/clip.ogg?x=1'), true);
  });

  test('Tenor, Klipy and fxtwitter stay links', () => {
    assert.equal(isDownloadableFile('https://tenor.com/view/hockey-goal-gif-123'), false);
    assert.equal(isDownloadableFile('https://media.tenor.com/abc/goal.gif'), false);
    assert.equal(isDownloadableFile('https://klipy.com/gifs/goal-123'), false);
    assert.equal(isDownloadableFile('https://static.klipy.com/x/goal.gif'), false);
    assert.equal(isDownloadableFile('https://gif.fxtwitter.com/tweet_video/HEET9sEaQAADbhA.webp'), false);
  });

  test('page links and junk stay links', () => {
    assert.equal(isDownloadableFile('https://www.youtube.com/watch?v=abc'), false);
    assert.equal(isDownloadableFile('https://example.com/page'), false);
    assert.equal(isDownloadableFile('not a url'), false);
  });
});

describe('isDiscordAttachment', () => {
  test('only Discord CDN attachment paths', () => {
    assert.equal(isDiscordAttachment('https://cdn.discordapp.com/attachments/1/2/a.gif'), true);
    assert.equal(isDiscordAttachment('https://media.discordapp.net/attachments/1/2/a.gif'), true);
    assert.equal(isDiscordAttachment('https://cdn.discordapp.com/emojis/123.png'), false);
    assert.equal(isDiscordAttachment('https://i.imgur.com/a.gif'), false);
  });
});

describe('validateMedia', () => {
  test('images, video and audio under the limit are fine', () => {
    assert.equal(validateMedia('image/gif', 2_000_000), null);
    assert.equal(validateMedia('audio/mpeg', 500_000), null);
    assert.equal(validateMedia('video/mp4', MAX_MEDIA_BYTES), null);
  });

  test('too big is rejected with the size and the limit', () => {
    assert.match(validateMedia('image/gif', MAX_MEDIA_BYTES + 1) ?? '', /too big \(10\.0 MB\).*up to 10 MB/);
  });

  test('a boosted server limit allows bigger files', () => {
    const limit = uploadLimitBytes(2);
    assert.equal(validateMedia('image/gif', 44.5 * 1024 * 1024, limit), null);
    assert.match(validateMedia('image/gif', limit + 1, limit) ?? '', /up to 50 MB/);
  });

  test('non-media content (e.g. an HTML page) is rejected', () => {
    assert.match(validateMedia('text/html; charset=utf-8', 1000) ?? '', /isn't an image, video or audio file/);
    assert.match(validateMedia(null, 1000) ?? '', /isn't an image, video or audio file/);
  });
});

describe('displayFileName', () => {
  test('strips the stored id prefix', () => {
    assert.equal(displayFileName('1247333121515585556/1759700000000-horn.mp3'), 'horn.mp3');
  });
});

describe('uploadLimitBytes', () => {
  test('follows the server boost tier', () => {
    assert.equal(uploadLimitBytes(0), 10 * 1024 * 1024);
    assert.equal(uploadLimitBytes(1), 10 * 1024 * 1024);
    assert.equal(uploadLimitBytes(2), 50 * 1024 * 1024);
    assert.equal(uploadLimitBytes(3), 100 * 1024 * 1024);
  });
});
