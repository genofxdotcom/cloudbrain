# CloudBrain Credential Names - Complete Reference

## Overview
All credentials are stored in Cloudflare KV (SECRETS namespace) and fetched by the worker on startup. This document serves as the single source of truth for all KV key names.

## Telegram Credentials (2 keys required)
| KV Key Name | Description | Format | Example |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | `{botId}:{token}` | `123456789:ABCdefGHIjklmnoPQRstuvWXYZ` |
| `TELEGRAM_OWNER_ID` | Your Telegram user ID | numeric string | `987654321` |

**How to get:**
1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts
2. Message [@userinfobot](https://t.me/userinfobot) → get your ID

**Add to KV:**
```bash
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID TELEGRAM_BOT_TOKEN "123456789:ABCdefGHI..."
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID TELEGRAM_OWNER_ID "987654321"
```

---

## Discord Credentials (3 keys required)
| KV Key Name | Description | Format | Example |
|---|---|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from Developer Portal | starts with `MTA` | `MTA4...` |
| `DISCORD_CLIENT_ID` | Application ID | numeric string | `123456789` |
| `DISCORD_PUBLIC_KEY` | Public key for signature verification | hex string | `abc123...` |

**How to get:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create or select your application
3. Go to "Bot" section → copy token
4. Go to "General Information" → copy Application ID
5. Copy Public Key from same page

**Add to KV:**
```bash
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID DISCORD_BOT_TOKEN "MTA..."
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID DISCORD_CLIENT_ID "123456789"
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID DISCORD_PUBLIC_KEY "abc123..."
```

---

## WhatsApp Credentials (4 keys required)
| KV Key Name | Description | Format | Example |
|---|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp phone number ID | numeric string | `123456789` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta Business Account ID | numeric string | `987654321` |
| `WHATSAPP_ACCESS_TOKEN` | Meta access token | long JWT-like string | `EAABs...` |
| `WHATSAPP_VERIFY_TOKEN` | Custom verification token (you create this) | any string | `my_verify_token_123` |

**How to get:**
1. Go to [Meta Business Platform](https://business.facebook.com)
2. WhatsApp → Settings → API Setup
3. Copy Phone Number ID and Business Account ID
4. Generate or copy access token
5. Create any string for verification token

**Add to KV:**
```bash
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID WHATSAPP_PHONE_NUMBER_ID "123456789"
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID WHATSAPP_BUSINESS_ACCOUNT_ID "987654321"
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID WHATSAPP_ACCESS_TOKEN "EAABs..."
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID WHATSAPP_VERIFY_TOKEN "my_verify_token_123"
```

---

## Cloudflare API Credentials (2 keys required for AI agent)
| KV Key Name | Description | Format | Example |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | long JWT-like string | `v1.0_abc123...` |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID | UUID-like string | `abc123def456...` |

**Purpose:** The AI agent uses these credentials to programmatically manage Cloudflare resources (D1 databases, KV namespaces, R2 buckets, etc.)

**How to get:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Account Settings → API Tokens
3. Create a token with permissions for D1, KV, R2, or use existing
4. Your Account ID is shown in Account Settings → Right sidebar

**Add to KV:**
```bash
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID CLOUDFLARE_API_TOKEN "v1.0_abc123..."
wrangler kv:key put --namespace-id=YOUR_NAMESPACE_ID CLOUDFLARE_ACCOUNT_ID "abc123def456..."
```

---

## Complete Credential List (for reference)

**All 12 KV Keys:**
1. `TELEGRAM_BOT_TOKEN` ✓
2. `TELEGRAM_OWNER_ID` ✓
3. `DISCORD_BOT_TOKEN` ✓
4. `DISCORD_CLIENT_ID` ✓
5. `DISCORD_PUBLIC_KEY` ✓
6. `WHATSAPP_PHONE_NUMBER_ID` ✓
7. `WHATSAPP_BUSINESS_ACCOUNT_ID` ✓
8. `WHATSAPP_ACCESS_TOKEN` ✓
9. `WHATSAPP_VERIFY_TOKEN` ✓
10. `CLOUDFLARE_API_TOKEN` ✓
11. `CLOUDFLARE_ACCOUNT_ID` ✓

---

## Auto-Detection
CloudBrain automatically detects which channels are configured:
- If `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OWNER_ID` present → Telegram enabled
- If `DISCORD_BOT_TOKEN` + `DISCORD_CLIENT_ID` + `DISCORD_PUBLIC_KEY` present → Discord enabled
- If `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_BUSINESS_ACCOUNT_ID` + `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_VERIFY_TOKEN` present → WhatsApp enabled

You don't need all channels - only add credentials for channels you want to use.

---

## Debugging Credentials
Check what's stored in KV:

```bash
# List all KV keys
wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID

# Check specific credential
wrangler kv:key get --namespace-id=YOUR_NAMESPACE_ID TELEGRAM_BOT_TOKEN

# Access diagnostic endpoint
curl https://your-worker.workers.dev/debug/diagnostics
```

---

## Important Notes
- ⚠️ **Never commit credentials to Git**
- ⚠️ **Credentials are KV key names - case sensitive**
- ✅ **Credentials are fetched at worker startup** from KV
- ✅ **Credentials persist across deployments** (stored in KV, not wrangler.toml)
- ✅ **You can update credentials without redeploying** (just update KV values)
