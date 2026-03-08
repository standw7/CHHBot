# HOF Enhancements Design

## Problem

HOF posts are missing:
1. Reply context (no way to understand why a message is funny if it's a reply)
2. Media rendering (uploaded videos/images not always displayed)
3. Twitter/X link rendering (just raw URLs, no preview)

## Design

### Single-message HOF post layout

```
https://fxtwitter.com/user/status/123   <- message content (only present if twitter link exists)

[Embed Card]
  Author: avatar + display name
  Description: Original message text (with original twitter links preserved)
  Field "Reply to @Username": Full replied-to message text (truncated 300 chars) — only if message is a reply
  Field "Channel": #channel-name — always at bottom
  Field "Link": Jump to message — always at bottom
  Image: First image attachment via setImage()

[Auto-rendered tweet preview from fxtwitter URL in content]
```

### Reply context
- Check `message.reference` to detect replies
- Fetch the referenced message via `message.fetchReference()`
- Show as embed field: "Reply to @DisplayName" with full message content (truncated at 300 chars)
- Placed directly below the message description, above Channel/Link fields

### Twitter/X link rendering
- Extract twitter.com/x.com URLs from message content using existing regex from linkFixer.ts
- Convert to fxtwitter.com URLs
- Place in message `content` (outside the embed) so Discord auto-renders the preview
- Keep original URLs in the embed description text unchanged
- If the message is ONLY a twitter link, still show it in the embed description (prevents empty embed)

### Media handling
- Images: First image attachment uses `setImage()` on the embed
- Videos: Attach as files to the message so they play inline
- Multiple attachments: All linked in an "Attachments" field, first image embedded

### Backfill command: `!hof update`
- Admin-only (requires Manage Server)
- Queries all `hof_messages` rows with `hof_message_id` set
- For each entry: fetches original message, rebuilds embed with new logic, edits HOF post
- Rate-limited: ~1 edit per 2 seconds
- Reports progress in chat ("Updated X/Y posts...")
- Handles missing/deleted messages gracefully (skips with warning)

## Files to modify
- `src/bot/events/reactionAdd.ts` — rewrite `buildHofEmbed()`, update send logic for content + embed + attachments
- `src/bot/events/messageCreate.ts` — add `!hof update` subcommand
- `src/db/queries.ts` — add `getAllHofMessages()` query for backfill
