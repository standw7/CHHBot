# HOF Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance HOF posts with reply context, Twitter/X link rendering, and media — plus a backfill command for existing posts.

**Architecture:** Rewrite `buildHofEmbed()` to return structured data (embed + content + files), add reply fetching, Twitter link extraction, and media attachment handling. Add `!hof update` command for backfilling existing posts. All changes in 3 files.

**Tech Stack:** TypeScript, discord.js v14, better-sqlite3

---

### Task 1: Rewrite HOF embed builder with reply context and Twitter rendering

**Files:**
- Modify: `src/bot/events/reactionAdd.ts`

**Step 1: Rewrite `buildHofEmbed` to an async function that returns `{ embed, content, files }`**

The new function:
- Accepts the full Discord `Message` object (not a partial type)
- Fetches reply context via `message.fetchReference()` if `message.reference` exists
- Extracts Twitter/X URLs from message content, converts to fxtwitter URLs for message content
- Handles image attachments via `setImage()`, video attachments as message file attachments
- Orders embed fields: description (message text) -> reply context field -> channel field -> link field

**Step 2: Update the send call to pass content + embed + files**

Change `hofChannel.send({ embeds: [embed] })` to `hofChannel.send({ content, embeds: [embed], files })`.

**Step 3: Export the builder function so the backfill command can reuse it**

Export `buildHofPost(message, guildId, channelId, messageId)` returning `{ embed, content, files }`.

**Step 4: Commit**

```bash
git add src/bot/events/reactionAdd.ts
git commit -m "feat: enhance HOF posts with reply context, twitter rendering, and media"
```

---

### Task 2: Add `getAllHofMessages` query for backfill

**Files:**
- Modify: `src/db/queries.ts`

**Step 1: Add query function**

```typescript
export function getAllHofMessages(guildId: string): HofMessage[] {
  return getDb().prepare(
    'SELECT * FROM hof_messages WHERE guild_id = ? AND hof_message_id IS NOT NULL'
  ).all(guildId) as HofMessage[];
}
```

**Step 2: Commit**

```bash
git add src/db/queries.ts
git commit -m "feat: add getAllHofMessages query for backfill"
```

---

### Task 3: Add `!hof update` backfill command

**Files:**
- Modify: `src/bot/events/messageCreate.ts`

**Step 1: Add `update` subcommand to `handlePrefixHof`**

- Admin-only (Manage Server permission, already gated)
- Fetches all HOF entries for the guild via `getAllHofMessages()`
- For each entry with a `hof_message_id`:
  - Fetch the original message from `original_channel_id`/`original_message_id`
  - Call `buildHofPost()` to rebuild
  - Edit the HOF message with new embed + content + files
  - Wait 2 seconds between edits (rate limiting)
- Reports progress: "Updating HOF posts... (X/Y)" then "Done! Updated X posts, Y skipped."
- Handles deleted/missing messages gracefully (skip + count)

**Step 2: Commit**

```bash
git add src/bot/events/messageCreate.ts
git commit -m "feat: add !hof update backfill command"
```

---

### Task 4: Build and verify

**Step 1: Run TypeScript build**

```bash
cd ~/Downloads/Projects/chh-bot && npm run build
```

**Step 2: Fix any type errors**

**Step 3: Commit dist if clean**

```bash
git add -A
git commit -m "chore: build dist"
git push
```
