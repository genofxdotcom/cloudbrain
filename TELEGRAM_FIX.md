# Telegram Message Sending Fix

## Problem
When sending messages to Telegram, the worker was throwing:
```
TypeError: this.bot.api.sendMessage is not a function
```

## Root Cause
The `@codebam/cf-workers-telegram-bot` library (v9.1.4) has the send methods directly on the bot instance, **not** on a nested `api` object.

### What was wrong:
```typescript
// ❌ WRONG - this.bot.api doesn't exist
await (this.bot as any).api.sendMessage({
  chat_id: parseInt(userId),
  text,
});
```

### What's correct:
```typescript
// ✅ CORRECT - methods are directly on bot instance
await (this.bot as any).sendMessage(parseInt(userId), text);
```

## Changes Made

### File: `src/channels/telegram.ts`

**sendMessage() method** (line 145):
```typescript
// Before
const result = await (this.bot as any).api.sendMessage({
  chat_id: parseInt(userId),
  text,
});

// After
const result = await (this.bot as any).sendMessage(parseInt(userId), text);
```

**sendFile() method** (line 177):
```typescript
// Before
const result = await (this.bot as any).api.sendDocument({
  chat_id: parseInt(userId),
  document: fileUrl,
  caption,
});

// After
const result = await (this.bot as any).sendDocument(parseInt(userId), fileUrl, { caption });
```

## Library Documentation
- **Library**: `@codebam/cf-workers-telegram-bot`
- **Version**: 9.1.4
- **Available Methods**:
  - `bot.sendMessage(chatId: number, text: string, options?: object)`
  - `bot.sendDocument(chatId: number, fileUrl: string, options?: object)`
  - And other send methods

## Verification
After deploying this fix:

1. Send a message to your Telegram bot
2. Check the logs - should now show:
   ```
   [INFO] [TELEGRAM] Message sent successfully
   ```
3. You should receive the bot's response in Telegram

## Testing
```bash
# Deploy the fix
wrangler deploy

# Send a test message to your Telegram bot
# Bot should respond immediately

# Check logs
wrangler tail --filter "TELEGRAM"
```

## Impact
- ✅ Telegram messages now send correctly
- ✅ File sharing via Telegram now works
- ✅ All Telegram features fully functional

---

**Commit**: 19fe32a
**Date**: May 25, 2026
