# CloudBrain Bindings Persistence Guide

## Problem: Bindings Disappear After Each Build

When you deploy to Cloudflare Workers, the bindings configured in the Cloudflare Dashboard **persist indefinitely** and are NOT affected by deployment. However, if they appear to disappear, it usually means:

1. **The bindings were never actually added to the Dashboard** (just commented in wrangler.toml)
2. **You're looking at the wrong worker or environment**
3. **The Dashboard binding configuration got accidentally removed**

## Solution: Bindings are Dashboard-Level Configuration (Not wrangler.toml)

### ✅ Correct Approach: Bind in Cloudflare Dashboard

Cloudflare bindings are **persistent settings on your worker** that survive multiple deployments. They are managed separately from your code.

**Steps to add bindings that persist forever:**

1. **Go to Cloudflare Dashboard**
   - Navigate to: Workers and Pages → CloudBrain → Settings → Bindings

2. **Add KV Namespace Binding (SECRETS)**
   - Click "Add binding"
   - Variable name: `SECRETS`
   - KV Namespace: Select or create `cloudbrain`
   - **This binding will persist across all future deploys**

3. **Add D1 Database Binding (DB)**
   - Click "Add binding"
   - Variable name: `DB`
   - D1 Database: Select or create `cloudbrain`
   - **This binding will persist across all future deploys**

4. **AI Binding (Already Available)**
   - AI binding is automatically available to all workers
   - No additional configuration needed
   - Variable name: `AI` (already in wrangler.toml)

### ✅ Why wrangler.toml is Commented Out

The `[[kv_namespaces]]` and `[[d1_databases]]` sections in `wrangler.toml` are **commented out** because:

- **Local Development**: For local testing with `wrangler dev`, you need to uncomment them and add your actual namespace IDs
- **Production Deployment**: The Dashboard bindings take precedence and don't need wrangler.toml configuration
- **Avoiding Conflicts**: Having IDs in wrangler.toml can cause deployment errors if the IDs don't match your Dashboard setup

### Setting Up Local Development (Optional)

If you want to test locally with `wrangler dev`:

```bash
# 1. Create KV namespace locally
wrangler kv:namespace create "cloudbrain"
# Output: { "id": "your-kv-id", "preview_id": "your-preview-id" }

# 2. Create D1 database locally
wrangler d1 create cloudbrain
# Output: { "database_id": "your-db-id" }

# 3. Uncomment in wrangler.toml and add the IDs:
# [[kv_namespaces]]
# binding = "SECRETS"
# id = "your-kv-id"
# preview_id = "your-preview-id"
#
# [[d1_databases]]
# binding = "DB"
# database_name = "cloudbrain"
# database_id = "your-db-id"

# 4. Run local development
wrangler dev
```

### Verifying Bindings are Persistent

**After deployment**, verify bindings persist by:

```bash
# View all deployed bindings
wrangler deployments view

# Or check the Dashboard:
# Workers and Pages → CloudBrain → Settings → Bindings
```

You should see all three bindings:
- ✅ KV Namespace: SECRETS (cloudbrain)
- ✅ D1 Database: DB (cloudbrain)
- ✅ AI: AI (Workers AI)

## How Credentials Flow Works

```
┌─────────────────────────────────────────────────────┐
│                 CloudBrain Worker                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  Telegram    │  │   Discord    │  │ WhatsApp │  │
│  │  Channel     │  │   Channel    │  │ Channel  │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│         │                  │                │       │
│         └──────────────────┼──────────────┬─┘       │
│                            │              │         │
│         ┌──────────────────▼──────────────▼──┐      │
│         │  ChannelManager                   │      │
│         │  (Routes messages to channels)   │      │
│         └────────────────┬─────────────────┘       │
│                          │                        │
│         ┌────────────────▼──────────────────┐     │
│         │  getCredentialsFromKV()            │     │
│         │  (Loads all credentials from KV)  │     │
│         └────────────────┬──────────────────┘     │
│                          │                        │
│         ┌────────────────▼──────────────────┐     │
│         │  SECRETS KV Namespace Binding     │     │
│         │  (Persistent, from Dashboard)     │     │
│         └─────────────────────────────────┘      │
│                                                     │
└─────────────────────────────────────────────────────┘
                       │
                       │ (Never changes after deploy)
                       ▼
         Cloudflare Dashboard
         ├─ SECRETS KV Namespace
         ├─ DB D1 Database
         └─ AI Workers AI
```

## Credential Keys in KV

When you add credentials to KV, use these exact keys:

```
Telegram:
  - SECRET_TELEGRAM_API_TOKEN: "123456789:ABCdefGHI..."
  - TELEGRAM_OWNER_ID: "987654321"

Discord:
  - DISCORD_BOT_TOKEN: "MTA..."
  - DISCORD_CLIENT_ID: "123456789"
  - DISCORD_PUBLIC_KEY: "your-public-key"
  - DISCORD_WEBHOOK_URL: "https://cloudbrain.workers.dev/discord"

WhatsApp:
  - WHATSAPP_PHONE_NUMBER_ID: "123456789"
  - WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321"
  - WHATSAPP_ACCESS_TOKEN: "EAABs..."
  - WHATSAPP_VERIFY_TOKEN: "my_verify_token_123"
```

Add them using:
```bash
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID SECRET_TELEGRAM_API_TOKEN "your-token"
```

## Troubleshooting

### Bindings Disappeared After Deploy
- **Check Dashboard**: Workers → CloudBrain → Settings → Bindings
- **Redeploy**: `wrangler deploy` will preserve all Dashboard bindings
- **Never** delete bindings from Dashboard unless intentionally removing them

### Deployment Fails with "Invalid namespace_id"
- **Solution**: Remove commented-out bindings from wrangler.toml
- **Or**: Add correct IDs from your Dashboard to wrangler.toml
- **Current Status**: Already fixed in wrangler.toml (sections are commented out)

### Credentials Not Loading
- **Check**: Verify KV binding exists in Dashboard
- **Check**: Verify credentials are added to KV with correct key names
- **Debug**: Check worker logs: `wrangler tail`

## Summary

✅ **Bindings are persistent** - They live in Cloudflare Dashboard, not in code
✅ **wrangler.toml is optional** - Only needed for local development
✅ **Credentials use KV** - All channels access credentials from the SECRETS KV binding
✅ **No manual config needed after Dashboard setup** - Just deploy your code

Your bindings will survive:
- ✅ Multiple deployments
- ✅ Code changes
- ✅ npm updates
- ✅ Worker restarts

The only way to lose bindings is to manually delete them from the Cloudflare Dashboard.
