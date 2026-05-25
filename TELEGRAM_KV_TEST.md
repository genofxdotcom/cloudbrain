# Telegram KV Credential Access - Testing Guide

## Overview

This guide verifies that Telegram bot credentials are properly accessed from the KV namespace and the webhook integration works end-to-end.

## Prerequisites

Before testing, ensure you have:

1. ✅ Cloudflare account with Workers enabled
2. ✅ KV namespace created: `cloudbrain`
3. ✅ D1 database created: `cloudbrain`
4. ✅ AI Gateway binding available
5. ✅ Telegram bot token from @BotFather
6. ✅ Your Telegram user ID from @userinfobot

## Step 1: Verify KV Credentials are Set

### Check if credentials exist in KV

```bash
# Get your KV namespace ID from Cloudflare Dashboard
NAMESPACE_ID="your-namespace-id"

# Check if Telegram token exists
wrangler kv:key get --namespace-id=$NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN

# Check if owner ID exists
wrangler kv:key get --namespace-id=$NAMESPACE_ID TELEGRAM_OWNER_ID
```

Expected output:
```
Your bot token (format: 123456789:ABCdefGHI...)
Your user ID (format: 987654321)
```

### If credentials are missing, set them:

```bash
# Set Telegram bot token
wrangler kv:key put --namespace-id=$NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN "YOUR_BOT_TOKEN_HERE"

# Set Telegram owner ID
wrangler kv:key put --namespace-id=$NAMESPACE_ID TELEGRAM_OWNER_ID "YOUR_USER_ID_HERE"

# Verify they were set
wrangler kv:key get --namespace-id=$NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN
wrangler kv:key get --namespace-id=$NAMESPACE_ID TELEGRAM_OWNER_ID
```

## Step 2: Build and Deploy

```bash
# Build the project
npm run build

# Deploy to Cloudflare Workers
wrangler deploy

# You should see output like:
# ✓ Uploaded cloudbrain
# ✓ Deployed to https://cloudbrain.workers.dev

# Note your worker URL for later use
```

## Step 3: Check Worker Health

```bash
# Replace with your actual worker URL
WORKER_URL="https://cloudbrain.workers.dev"

# Check health endpoint
curl $WORKER_URL/health

# Expected response:
{
  "status": "CloudBrain running",
  "activeChannels": ["telegram"],
  "hasAI": true,
  "hasDB": true
}
```

✅ **Success if:** `activeChannels` includes `"telegram"`

❌ **Failed if:** `activeChannels` is empty or doesn't include `"telegram"`

### Troubleshooting health check:

If Telegram is not in activeChannels:
1. Check KV credentials: `wrangler kv:key list --namespace-id=$NAMESPACE_ID`
2. Verify credentials are correct format
3. Check worker logs: `wrangler tail`
4. Redeploy: `wrangler deploy`

## Step 4: Verify Webhook Status

```bash
WORKER_URL="https://cloudbrain.workers.dev"

# Check webhook registration status
curl $WORKER_URL/telegram/status

# Expected response:
{
  "webhook": {
    "configured": true,
    "url": "https://cloudbrain.workers.dev/telegram",
    "pending_updates": 0,
    "last_error": null,
    "last_sync": 1705507200
  },
  "timestamp": "2026-05-25T10:00:00.000Z"
}
```

✅ **Success if:** `configured: true` and `url` is correct

❌ **Failed if:** `configured: false` or shows error

### Troubleshooting webhook status:

**Problem: `configured: false`**
- Check logs: `wrangler tail --format json | grep -i webhook`
- Verify bot token is correct
- Check worker URL is publicly accessible
- Redeploy: `wrangler deploy`

**Problem: `last_error` is not null**
- Check the error message
- Verify bot token format: `123456789:ABCdefGHI...`
- Verify bot token hasn't expired
- Try manual webhook setup (see below)

## Step 5: Manual Webhook Setup (If Automatic Failed)

If the automatic webhook setup fails, try manual setup:

```bash
BOT_TOKEN="YOUR_BOT_TOKEN"
WORKER_URL="https://your-worker.workers.dev"

# Register webhook manually
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WORKER_URL}/telegram\"}"

# Expected response:
# {"ok":true,"result":true,"description":"Webhook was set"}

# Verify it worked
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq
```

Expected output:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-worker.workers.dev/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_synchronization_unixtime": 1705507200
  }
}
```

## Step 6: Test Message Reception

Now test if Telegram bot can receive and process messages:

### 1. Send test message to your bot

Open Telegram and send a message to your bot:
```
Test message from KV verification
```

### 2. Check real-time logs

```bash
# View live logs
wrangler tail --format json

# Look for lines like:
# [TELEGRAM] Message received
# [TELEGRAM] Valid message from owner
# [TELEGRAM] Message sent successfully
```

Expected log sequence:
```
[WEBHOOK] Webhook setup completed successfully
[TELEGRAM] Message received from owner
[REQUEST] Received message from telegram
[TASK] Starting task execution
[AI] Calling AI model
[TELEGRAM] Sending message response
[TASK] Task execution completed
```

### 3. Verify response in Telegram

✅ **Success:** Bot responds to your message within 1-2 seconds

❌ **Failed:** No response after 5 seconds or error message

### Troubleshooting message reception:

**Problem: Message received but no response**
1. Check owner ID: `wrangler kv:key get --namespace-id=$NS TELEGRAM_OWNER_ID`
2. Your message sender ID must match owner ID
3. Check logs for authorization error: `Message from unauthorized user`
4. Get correct ID: Message @userinfobot

**Problem: AI model not responding**
1. Check AI binding: `wrangler tail | grep -i ai`
2. Verify D1 database is bound
3. Check Cloudflare dashboard for AI gateway status

**Problem: Webhook not receiving updates**
1. Check webhook status: `curl $WORKER_URL/telegram/status`
2. Verify bot token is correct
3. Try manual webhook setup
4. Check for network connectivity issues

## Step 7: Test All Channels Work

Once Telegram is working, verify other channels:

```bash
# Health check shows active channels
curl $WORKER_URL/health

# Should show something like:
{
  "activeChannels": ["telegram"]
  // discord and whatsapp only if credentials configured
}
```

To enable Discord or WhatsApp:
1. Set their credentials in KV (see README.md)
2. Redeploy: `wrangler deploy`
3. Verify they appear in `activeChannels`

## Step 8: Verify Credential Refresh

Test that credentials are properly refreshed on each request:

```bash
# 1. Deploy
wrangler deploy

# 2. Check telegram is active
curl $WORKER_URL/health | grep -i telegram

# 3. Disable telegram (remove credentials)
wrangler kv:key delete --namespace-id=$NS SECRET_TELEGRAM_API_TOKEN

# 4. Send request - telegram should be inactive
curl $WORKER_URL/health

# 5. Re-add credentials
wrangler kv:key put --namespace-id=$NS SECRET_TELEGRAM_API_TOKEN "TOKEN"

# 6. Send request - telegram should be active again
curl $WORKER_URL/health
```

✅ **Success if:** Channels change status immediately after credential changes

## Step 9: Load Testing (Optional)

Test Telegram can handle multiple concurrent messages:

```bash
# Send 10 messages rapidly to simulate concurrent requests
for i in {1..10}; do
  echo "Message $i" | wrangler tail &
done

# All should be processed successfully
# Check logs for any errors or timeouts
wrangler tail --format json | grep ERROR
```

Expected: No errors

## Step 10: Performance Verification

Check response times:

```bash
# Monitor logs for timing
wrangler tail --format json | grep TASK

# Look for execution times
# Example:
# [TASK] Task execution completed (duration: 245ms)
```

✅ **Success if:** Response time is < 2000ms (2 seconds)

Typical times:
- Message received to response: 500-2000ms
- AI processing: 300-1500ms
- Total: 1-3 seconds

## Comprehensive Test Checklist

- [ ] KV credentials verified
- [ ] Worker deployed successfully
- [ ] Health endpoint shows telegram active
- [ ] Webhook status shows configured: true
- [ ] Manual webhook test successful
- [ ] Test message sent to bot
- [ ] Bot responded within 2 seconds
- [ ] Logs show proper credential access
- [ ] No authorization errors
- [ ] No AI processing errors
- [ ] Response times acceptable
- [ ] Credential refresh working
- [ ] No memory leaks in logs

## Common Issues & Solutions

### Issue: `activeChannels` is empty

**Cause:** Credentials not found in KV

**Solution:**
```bash
# Verify credentials exist
wrangler kv:key list --namespace-id=$NS

# If missing, add them
wrangler kv:key put --namespace-id=$NS SECRET_TELEGRAM_API_TOKEN "token"
wrangler kv:key put --namespace-id=$NS TELEGRAM_OWNER_ID "id"

# Redeploy
wrangler deploy
```

### Issue: Webhook shows `configured: false`

**Cause:** Webhook registration failed

**Solution:**
```bash
# Check logs
wrangler tail | grep -i webhook

# Manually register webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"https://your-worker.workers.dev/telegram\"}"

# Verify
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

### Issue: Message from unauthorized user

**Cause:** Sender ID doesn't match owner ID

**Solution:**
```bash
# Get correct owner ID
# Message @userinfobot on Telegram

# Update KV
wrangler kv:key put --namespace-id=$NS TELEGRAM_OWNER_ID "correct_id"

# Redeploy
wrangler deploy
```

### Issue: Bot doesn't respond

**Cause:** Multiple possible causes

**Solution:**
1. Check logs: `wrangler tail`
2. Verify message was received: Look for `[TELEGRAM] Message received`
3. Check authorization: Look for `[TELEGRAM] Message from unauthorized user`
4. Check AI: Look for `[AI] Calling AI model`
5. Check response: Look for `[TELEGRAM] Message sent successfully`

## Testing Script (Automated)

Create `test-telegram.sh`:

```bash
#!/bin/bash

NAMESPACE_ID="$1"
BOT_TOKEN="$2"
WORKER_URL="$3"

if [ -z "$NAMESPACE_ID" ] || [ -z "$BOT_TOKEN" ] || [ -z "$WORKER_URL" ]; then
  echo "Usage: ./test-telegram.sh <namespace-id> <bot-token> <worker-url>"
  exit 1
fi

echo "🧪 Testing Telegram KV Integration..."
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
HEALTH=$(curl -s "$WORKER_URL/health")
if echo "$HEALTH" | grep -q "telegram"; then
  echo "✅ Telegram is active"
else
  echo "❌ Telegram not in active channels"
  echo "Response: $HEALTH"
fi

# Test 2: Webhook status
echo ""
echo "Test 2: Webhook Status"
WEBHOOK=$(curl -s "$WORKER_URL/telegram/status")
if echo "$WEBHOOK" | grep -q "\"configured\": true"; then
  echo "✅ Webhook is configured"
else
  echo "❌ Webhook not configured"
  echo "Response: $WEBHOOK"
fi

# Test 3: Verify credentials in KV
echo ""
echo "Test 3: KV Credentials"
TOKEN=$(wrangler kv:key get --namespace-id=$NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN)
if [ ! -z "$TOKEN" ]; then
  echo "✅ Bot token found in KV"
else
  echo "❌ Bot token not found in KV"
fi

OWNER=$(wrangler kv:key get --namespace-id=$NAMESPACE_ID TELEGRAM_OWNER_ID)
if [ ! -z "$OWNER" ]; then
  echo "✅ Owner ID found in KV"
else
  echo "❌ Owner ID not found in KV"
fi

echo ""
echo "🎉 Testing complete!"
```

Usage:
```bash
chmod +x test-telegram.sh
./test-telegram.sh your-namespace-id your-bot-token https://your-worker.workers.dev
```

## Success Criteria

✅ **All tests passed if:**
1. KV credentials are set and retrievable
2. Worker deploys successfully
3. Telegram appears in active channels
4. Webhook status shows configured
5. Messages are received and processed
6. Bot responds within 2 seconds
7. Logs show proper credential access
8. No errors in worker logs

---

## Next Steps After Successful Testing

1. **Deploy to Production**
   ```bash
   wrangler deploy --env production
   ```

2. **Enable Other Channels** (optional)
   - Add Discord credentials
   - Add WhatsApp credentials
   - Re-deploy

3. **Set Up Monitoring**
   - Enable logs persistence in wrangler.toml
   - Set up alerts in Cloudflare dashboard

4. **Document Configuration**
   - Save your KV namespace ID
   - Document your worker URL
   - Share setup guide with team

---

**Last Updated:** May 25, 2026
**Version:** 2.0.0
**Test Coverage:** Telegram KV Integration
