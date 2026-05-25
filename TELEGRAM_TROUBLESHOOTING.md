# Telegram Troubleshooting Guide

This guide helps diagnose and fix Telegram webhook issues in CloudBrain.

## Quick Diagnosis

### 1. Check if Telegram Bot Token is Set

```bash
wrangler kv:key get --namespace-id=YOUR_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN
```

**Expected:** Your bot token (format: `123456789:ABCdefGHI...`)
**If missing:** Set it with: `wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN "YOUR_TOKEN"`

### 2. Check if Owner ID is Set

```bash
wrangler kv:key get --namespace-id=YOUR_NAMESPACE_ID TELEGRAM_OWNER_ID
```

**Expected:** Your Telegram user ID (numeric, e.g., `987654321`)
**If missing:** 
1. Message [@userinfobot](https://t.me/userinfobot) on Telegram to get your ID
2. Set it: `wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID TELEGRAM_OWNER_ID "YOUR_ID"`

### 3. Check Webhook Status

After deploying, check if webhook is registered:

```bash
# Replace with your worker URL
curl https://yourdomain.workers.dev/telegram/status
```

**Expected Response:**
```json
{
  "webhook": {
    "configured": true,
    "url": "https://yourdomain.workers.dev/telegram",
    "pending_updates": 0,
    "last_error": null,
    "last_sync": 1234567890
  },
  "timestamp": "2026-05-25T08:30:00.000Z",
  "requestId": "abc123"
}
```

**If `configured: false`:**
- Check logs: `wrangler tail`
- The webhook URL should be `https://yourdomain.workers.dev/telegram` (NOT `/webhook/telegram`)
- Worker needs public HTTPS URL (http://localhost won't work)

### 4. Check Health Endpoint

```bash
curl https://yourdomain.workers.dev/health
```

**Expected Response:**
```json
{
  "status": "CloudBrain running",
  "timestamp": "2026-05-25T08:30:00.000Z",
  "activeChannels": ["telegram"],
  "hasAI": true,
  "hasDB": true,
  "requestId": "xyz789"
}
```

**If telegram not in activeChannels:**
- Bot token or owner ID is missing/invalid
- Check KV credentials (step 1-2 above)
- Restart worker: `wrangler deploy`

## Common Issues and Fixes

### Issue: Telegram Bot Doesn't Respond to Messages

**Root Causes to Check:**

1. **Webhook not registered**
   - Run: `curl https://yourdomain.workers.dev/telegram/status`
   - If `configured: false`, check logs: `wrangler tail`
   - Look for `[WEBHOOK]` log lines

2. **Credentials not in KV**
   - Check step 1-2 above
   - Redeploy after adding credentials: `wrangler deploy`
   - Wait 10-30 seconds for worker to start up

3. **Owner ID doesn't match**
   - Send a message to your bot
   - Check logs: `wrangler tail`
   - Look for: `Message from unauthorized user`
   - Get your correct ID from [@userinfobot](https://t.me/userinfobot)

4. **Worker URL is not HTTPS or public**
   - Telegram requires public HTTPS URL
   - Cannot use `http://localhost` or private URLs
   - Verify: `curl https://yourdomain.workers.dev/health` works from any machine

5. **Telegram API blocked/rate limited**
   - Check logs for: `Webhook registration failed`
   - Wait 30 minutes for rate limit to reset
   - Check bot token is correct

### Issue: "Bot is not responding" in Telegram

**This usually means:**
- Messages are arriving but bot is crashing
- AI model not responding
- Database error
- File upload issue

**Debug Steps:**
1. Check real-time logs: `wrangler tail --format json`
2. Look for `[ERROR]` or `[TASK]` lines
3. Test with simple message: just type "hi"
4. If AI model error, verify D1 and AI bindings are configured

### Issue: Webhook Verification Failed

**Log message:** `Webhook verification failed`

**Causes:**
1. Webhook URL mismatch - should be `https://yourdomain.workers.dev/telegram`
2. Secret token issue - bot token may be invalid
3. Network issue - Telegram server can't reach your worker

**Fix:**
1. Redeploy: `wrangler deploy`
2. Check logs for exact error: `wrangler tail`
3. Manually verify webhook with curl:
   ```bash
   curl https://yourdomain.workers.dev/telegram/status
   ```

### Issue: Webhook Shows Last Error

**Example:** `last_error: "Bot token was invalid"`

**This means:**
1. Telegram tried to send updates but failed
2. The token in KV is wrong OR expired
3. Or there's been no recent message delivery

**Fix:**
1. Verify token is correct: `wrangler kv:key get --namespace-id=YOUR_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN`
2. If wrong, update it
3. Redeploy and wait 1-2 minutes for Telegram to retry

## Step-by-Step Setup Verification

Follow this if Telegram isn't working at all:

### Step 1: Create Bot (if needed)
```
1. Message @BotFather on Telegram
2. Send: /newbot
3. Follow prompts
4. You'll get a token
```

### Step 2: Set Credentials in KV
```bash
# Set token
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN "YOUR_TOKEN_HERE"

# Get your ID from @userinfobot, then set it
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID TELEGRAM_OWNER_ID "YOUR_ID_HERE"
```

### Step 3: Deploy Worker
```bash
wrangler deploy
```

### Step 4: Wait 10-30 Seconds
Worker needs time to start and register webhook.

### Step 5: Verify Webhook
```bash
curl https://yourdomain.workers.dev/telegram/status
```

Should show `"configured": true`

### Step 6: Test Bot
Send any message to your bot on Telegram. You should get a response within 2 seconds.

### Step 7: Check Logs if Issue
```bash
wrangler tail
```

Look for these patterns:
- `[WEBHOOK]` - webhook setup logs
- `[TELEGRAM]` - message handling logs
- `[ERROR]` - any errors

## Webhook Registration Retry Logic

The new implementation includes **automatic retry logic** for webhook registration:
- Tries up to **3 times** with exponential backoff
- Each retry waits longer than the previous (1s, 2s, 3s)
- Verification step after successful registration
- Full logging of each attempt

If webhook setup fails:
1. Check your internet connection
2. Verify bot token is correct
3. Check logs: `wrangler tail`
4. Restart worker: `wrangler deploy`

## Manual Webhook Setup (Emergency)

If automatic setup fails, manually register:

```bash
# Replace with your values:
BOT_TOKEN="YOUR_TOKEN_HERE"
WEBHOOK_URL="https://yourdomain.workers.dev/telegram"

# Register webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\"}"

# Should return: {"ok":true,"result":true,"description":"Webhook was set"}

# Verify it worked
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq
```

## Expected Webhook Status

After successful setup:

```json
{
  "ok": true,
  "result": {
    "url": "https://yourdomain.workers.dev/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "ip_address": "1.2.3.4",
    "last_synchronization_unixtime": 1234567890
  }
}
```

**Key fields:**
- `url` - must match your worker URL
- `pending_update_count` - should be 0 (if >0, messages are queued)
- `last_synchronization_unixtime` - timestamp of last update delivery
- No `last_error_message` field = no errors

## Still Not Working?

1. **Check exact error message:**
   ```bash
   wrangler tail --format json | grep -i telegram
   ```

2. **Verify all credentials exist:**
   ```bash
   wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID
   ```

3. **Test with a completely fresh deploy:**
   ```bash
   wrangler deploy
   # Wait 30 seconds
   curl https://yourdomain.workers.dev/telegram/status
   ```

4. **Check Telegram bot token format:**
   - Should be: `123456789:ABCdefGHIjklmnoPQRstuvWXYZ`
   - Must have colon separator
   - No spaces

5. **Look at real-time logs during message send:**
   ```bash
   # In one terminal
   wrangler tail
   
   # In another terminal, send a message in Telegram
   # Watch the logs for [TELEGRAM] entries
   ```

## Enable Telegram Polling Mode (Alternative)

If webhooks don't work, CloudBrain can use polling mode instead:

This requires modifying the polling configuration (not yet implemented but planned).

For now, webhooks are the primary method. Report issues if setup fails after following this guide.

## Getting Help

When reporting issues, include:
1. Output of: `curl https://yourdomain.workers.dev/telegram/status`
2. Recent logs: `wrangler tail --format json` (last 20 lines)
3. Bot token format (first 10 characters only)
4. Your Telegram user ID
5. Error messages from logs

---

**Last Updated:** May 2026
**Telegram Bot API Version:** Latest
