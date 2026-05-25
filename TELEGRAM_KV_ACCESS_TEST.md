# Telegram KV Access Testing Guide

This guide walks you through testing that Telegram credentials are properly accessed from the KV namespace instead of environment variables.

## Prerequisites

- Cloudflare account
- Telegram bot token (from @BotFather)
- Your Telegram User ID (from @userinfobot)
- CloudBrain deployed to Cloudflare Workers

## Step 1: Set Up KV Namespace

### Create KV Namespace

```bash
wrangler kv:namespace create "cloudbrain"
wrangler kv:namespace create "cloudbrain" --preview
```

Record the namespace IDs from the output.

### Bind KV in Dashboard

1. Go to **Cloudflare Dashboard** → **Workers** → **cloudbrain**
2. Click **Settings** → **Bindings**
3. Click **Add Binding**
4. Select **KV Namespace**
   - Variable name: `SECRETS`
   - KV Namespace: `cloudbrain` (or your namespace name)
5. Click **Save and Deploy**

## Step 2: Store Telegram Credentials in KV

Use the Cloudflare CLI to add your Telegram credentials:

```bash
# Get your KV namespace ID (from wrangler kv:namespace list)
export KV_NAMESPACE_ID="your-namespace-id"

# Store Telegram bot token
wrangler kv:key put --namespace-id=$KV_NAMESPACE_ID \
  SECRET_TELEGRAM_API_TOKEN "YOUR_BOT_TOKEN_HERE"

# Store your Telegram owner ID
wrangler kv:key put --namespace-id=$KV_NAMESPACE_ID \
  TELEGRAM_OWNER_ID "YOUR_USER_ID_HERE"
```

### Verify Credentials Were Stored

```bash
# List all keys in KV
wrangler kv:key list --namespace-id=$KV_NAMESPACE_ID

# Get a specific value (verify it's stored correctly)
wrangler kv:key get --namespace-id=$KV_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN
```

## Step 3: Deploy CloudBrain

```bash
wrangler deploy
```

Monitor the deployment logs:

```bash
wrangler tail
```

## Step 4: Verify Telegram Channel Initialization

### Check Health Endpoint

```bash
curl https://cloudbrain.workers.dev/health
```

Expected response:
```json
{
  "status": "CloudBrain running",
  "timestamp": "2026-05-25T...",
  "activeChannels": ["telegram"],
  "hasAI": true,
  "hasDB": true
}
```

**Key indicator:** `"activeChannels": ["telegram"]` means Telegram successfully initialized with KV credentials.

### Check Webhook Status

```bash
curl https://cloudbrain.workers.dev/webhook/status
```

Expected response:
```json
{
  "webhook": {
    "ok": true,
    "result": {
      "url": "https://cloudbrain.workers.dev/",
      "has_custom_certificate": false,
      "pending_update_count": 0,
      "last_error_date": 0
    }
  }
}
```

## Step 5: Test Telegram Message

### Send Test Message

1. Open Telegram
2. Find your bot (search for it or click the link from @BotFather)
3. Send a message: `/ping` or any text

### Monitor Logs

Watch the worker logs in real-time:

```bash
wrangler tail
```

You should see logs like:

```
[INFO] [REQUEST] Incoming POST /
[INFO] [CHANNEL] Initializing all channels
[DEBUG] [TELEGRAM] Initializing Telegram channel
[INFO] [TELEGRAM] Telegram channel initialized successfully
[DEBUG] [TELEGRAM] Handling incoming message payload
[INFO] [TELEGRAM] Valid message from owner
```

### Expected Response

Your bot should respond with a message in Telegram within 1-2 seconds.

## Step 6: Verify KV Access Flow

The flow is:

1. **Request arrives** → `index.ts` `fetch` handler
2. **Load credentials** → `getCredentialsFromKV()` fetches from `env.SECRETS` (KV binding)
3. **Initialize channels** → `ChannelManager` receives credentials dictionary
4. **Telegram channel** → Uses credentials from dictionary (not env variables)
5. **Message processing** → Telegram channel sends response

### Debug Points

If Telegram channel is not active:

1. **Check KV credentials exist:**
   ```bash
   wrangler kv:key get --namespace-id=$KV_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN
   wrangler kv:key get --namespace-id=$KV_NAMESPACE_ID TELEGRAM_OWNER_ID
   ```

2. **Check worker logs for errors:**
   ```bash
   wrangler tail --format json
   ```
   Look for errors in `[ERROR] [TELEGRAM]` or `[ERROR] [KV]`

3. **Verify binding configuration:**
   - Go to Worker Settings → Bindings
   - Confirm SECRETS binding points to correct KV namespace
   - Confirm DB binding points to correct D1 database
   - Confirm AI binding is set

4. **Test KV access directly:**
   Add a debug endpoint to verify KV is accessible:
   ```typescript
   if (pathname === '/debug/kv') {
     const testValue = await env.SECRETS.get('SECRET_TELEGRAM_API_TOKEN');
     return new Response(JSON.stringify({ token: testValue ? '✓ exists' : '✗ missing' }));
   }
   ```

## Step 7: Test All Credential Keys

Verify all expected keys can be accessed:

```bash
# Create a test script
cat > test_credentials.sh << 'EOF'
#!/bin/bash

KV_NAMESPACE_ID="your-namespace-id"
KEYS=(
  "SECRET_TELEGRAM_API_TOKEN"
  "TELEGRAM_OWNER_ID"
  "DISCORD_BOT_TOKEN"
  "DISCORD_CLIENT_ID"
  "WHATSAPP_PHONE_NUMBER_ID"
)

for key in "${KEYS[@]}"; do
  value=$(wrangler kv:key get --namespace-id=$KV_NAMESPACE_ID "$key")
  if [ -z "$value" ]; then
    echo "❌ $key - NOT SET"
  else
    echo "✓ $key - exists"
  fi
done
EOF

chmod +x test_credentials.sh
./test_credentials.sh
```

## Step 8: Monitor Active Channels

The `getCredentialsFromKV()` function logs which credentials it finds:

```
[INFO] [KV] Fetching credentials from KV namespace
[DEBUG] [KV] Found credential: SECRET_TELEGRAM_API_TOKEN
[DEBUG] [KV] Found credential: TELEGRAM_OWNER_ID
[INFO] [KV] Loaded 2 credentials
```

If you don't see these logs, the KV binding may not be properly configured.

## Troubleshooting

### Telegram channel shows as inactive

**Symptom:**
```json
{
  "activeChannels": [],
  "status": "No channels configured"
}
```

**Solutions:**
1. Verify KV namespace binding in Dashboard
2. Verify credentials are stored in KV
3. Check token format: should be `123456789:ABCdefGHI...`
4. Check owner ID format: should be numeric string

### Webhook registration fails

**Symptom:**
```
[ERROR] [WEBHOOK] Failed to register webhook
```

**Solutions:**
1. Verify bot token is correct
2. Verify worker URL is accessible from internet
3. Check Telegram API status
4. Verify token has permission to set webhooks

### Messages not being received

**Symptom:**
- Webhook registered successfully
- But no messages processed

**Solutions:**
1. Verify you're sending messages to correct bot
2. Verify your Telegram user ID matches `TELEGRAM_OWNER_ID` in KV
3. Check worker logs for message processing errors
4. Verify bot token hasn't expired

### KV Binding Error

**Symptom:**
```
[ERROR] [KV] Error reading credentials from KV
TypeError: env.SECRETS is not defined
```

**Solutions:**
1. Go to Worker Settings → Bindings
2. Verify SECRETS binding is added
3. Verify it points to the correct KV namespace
4. Redeploy: `wrangler deploy`

## Success Criteria

✓ Terraform shows Telegram as active channel
✓ Webhook is registered and verified
✓ Messages from owner are processed
✓ Bot responds within 1-2 seconds
✓ Logs show credentials loaded from KV
✓ No environment variables are used for credentials

## Files Modified

The following files have been updated to use KV credentials:

- `src/index.ts` - Added `getCredentialsFromKV()` function
- `src/channels/telegram.ts` - Accepts credentials as parameter
- `src/channels/manager.ts` - Passes credentials to channels
- `wrangler.toml` - Documented binding setup

## Next Steps

Once testing is complete:

1. Test other channels (Discord, WhatsApp) if credentials available
2. Test workflow creation feature
3. Monitor production logs with: `wrangler tail --format json`
4. Set up alerting for errors in production
