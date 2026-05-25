# CloudBrain Integration Guide

Complete guide to understanding how all CloudBrain components work together.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                         │
│                    (CloudBrain)                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Webhook Receivers (Telegram, Discord, WhatsApp)   │    │
│  └─────────┬───────────────────────────────────────────┘    │
│            │                                                  │
│  ┌─────────▼───────────────────────────────────────────┐    │
│  │  Channel Manager (Routes to active channels)       │    │
│  └─────────┬───────────────────────────────────────────┘    │
│            │                                                  │
│  ┌─────────▼───────────────────────────────────────────┐    │
│  │  Agent Coordinator (AI processing with Llama 2)   │    │
│  └─────────┬───────────────────────────────────────────┘    │
│            │                                                  │
│  ┌─────────┴───────────────────────┬───────────────────┐   │
│  │                                 │                   │    │
│  ▼                                 ▼                   ▼    │
│ Skills/Actions              Workflows              Memory   │
│ - Send files                - Analyze task        - Store   │
│ - Review content            - Deploy workflow     - Recall  │
│ - Create automation         - Trigger execution   - Search  │
│ - Store memory              - Monitor status                │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Cloudflare Bindings:                                        │
│  • SECRETS (KV) - Stores credentials & configs              │
│  • DB (D1) - Persistent memory & data storage               │
│  • AI (Workers AI) - Llama 2 model for NLP                  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Message Processing Flow

```
1. User sends message (Telegram/Discord/WhatsApp)
   ↓
2. Platform webhook received
   ↓
3. Credentials loaded from KV (SECRETS binding)
   ↓
4. ChannelManager routes to appropriate channel
   ↓
5. Channel parses message
   ↓
6. AgentCoordinator processes with AI
   ↓
7. Skills system checks for actions (workflows, memory, etc.)
   ↓
8. Response generated and sent back through same channel
   ↓
9. Important info stored in DB (D1)
```

### Credential Access Flow

```
Request → index.ts
          ↓
     getCredentialsFromKV()
          ↓
     Loop through credential keys:
     - SECRET_TELEGRAM_API_TOKEN
     - TELEGRAM_OWNER_ID
     - DISCORD_BOT_TOKEN
     - etc.
          ↓
     env.SECRETS.get(key)  ← KV Binding
          ↓
     Return credentials dict
          ↓
     Pass to ChannelManager.initializeChannels()
```

### Workflow Creation Flow

```
User: "Create workflow to analyze emails daily"
      ↓
SkillsManager.executeAction()
      ↓
isWorkflowCreationRequest() → YES
      ↓
createWorkflowAction()
      ↓
analyzeTask() → Complexity: 32/50
      ↓
getRecommendation() → Recommend: Workflow
      ↓
suggestWorkflowDefinition() → Generate workflow structure
      ↓
WorkflowManager.deployWorkflow()
      ↓
Cloudflare API: PUT /accounts/{id}/workflows/{name}
      ↓
Workflow deployed! ✓
      ↓
Response sent to user with workflow ID
```

## Component Details

### 1. Channels System

**Purpose:** Abstract multi-platform communication

**Components:**
- `channels/base.ts` - Abstract interface all channels implement
- `channels/telegram.ts` - Telegram Bot implementation
- `channels/discord.ts` - Discord Bot implementation
- `channels/whatsapp.ts` - WhatsApp Cloud API implementation
- `channels/manager.ts` - Routes messages to active channels

**Credentials Stored in KV:**
```
SECRETS binding (KV Namespace)
├── Telegram
│   ├── SECRET_TELEGRAM_API_TOKEN
│   └── TELEGRAM_OWNER_ID
├── Discord
│   ├── DISCORD_BOT_TOKEN
│   ├── DISCORD_CLIENT_ID
│   ├── DISCORD_PUBLIC_KEY
│   └── DISCORD_WEBHOOK_URL
└── WhatsApp
    ├── WHATSAPP_PHONE_NUMBER_ID
    ├── WHATSAPP_BUSINESS_ACCOUNT_ID
    ├── WHATSAPP_ACCESS_TOKEN
    └── WHATSAPP_VERIFY_TOKEN
```

### 2. AI Processing

**Purpose:** Natural language understanding and response generation

**Components:**
- `agents/coordinator.ts` - Coordinates AI responses
- `actions.ts` - Defines action types and handlers
- Cloudflare Workers AI (Llama 2 model)

**Process:**
1. Message text → AI with system prompt
2. AI generates response with intent understanding
3. Optional action execution (if intent detected)
4. Response returned to user

### 3. Skills/Actions System

**Purpose:** Handle natural language actions like "create workflow", "send file", etc.

**Components:**
- `skills/index.ts` - Main skills manager
- `skills/workflow.ts` - Workflow creation and management
- `actions.ts` - Specific action implementations

**Supported Actions:**
- Send/share files
- Review/analyze content
- Store/recall memories
- Move files between channels
- Create automations (workflows)

### 4. Workflows Feature

**Purpose:** Build durable, multi-step applications

**Components:**
- `workflows/types.ts` - Type definitions
- `workflows/analyzer.ts` - Task analysis & recommendations
- `workflows/manager.ts` - Deployment & lifecycle management
- `workflows/index.ts` - Public API

**Decision Logic:**
- Analyzes task description
- Calculates complexity (1-50 scale)
- Recommends Worker (simple) vs Workflow (complex)
- Auto-generates workflow definition if recommended

### 5. Data Storage

**Purpose:** Persistent storage for memories, conversations, metadata

**Components:**
- `db/memory.ts` - Memory database layer
- `storage.ts` - File storage abstraction
- D1 Database (SQL)
- KV Namespace (key-value, credentials)
- R2 Storage (files)

**Data Stored:**
```
D1 Database (DB binding)
├── Users
│   ├── id
│   ├── telegram_id
│   ├── name
│   └── created_at
├── Memories
│   ├── id
│   ├── user_id
│   ├── content
│   ├── importance
│   └── created_at
└── Conversations
    ├── id
    ├── user_id
    ├── message
    ├── response
    └── timestamp

KV Namespace (SECRETS binding)
├── Credentials (shown above)
├── Temporary caches
└── Runtime config
```

## Integration Points

### Adding a New Channel

1. Create `src/channels/myplatform.ts`
2. Extend `BaseChannel`
3. Implement required methods
4. Add credential keys to KV
5. Update `ChannelManager` to initialize

### Adding a New Action

1. Create handler in `src/skills/` or `src/actions.ts`
2. Add pattern matching in `SkillsManager`
3. Store results in database if needed
4. Return response to user

### Adding Workflow Support

Already fully integrated! Use:
```typescript
import { WorkflowManager, analyzeTask, getRecommendation } from './workflows';

const manager = new WorkflowManager();
await manager.initialize(env);
```

## Testing & Debugging

### Debug Endpoints

- `GET /health` - System status
- `GET /webhook/status` - Telegram webhook info
- `GET /debug/diagnostics` - Full system diagnostics
  
### Check Logs

```bash
# Stream logs
wrangler tail

# Filter for specific component
wrangler tail | grep "WORKFLOW"
wrangler tail | grep "TELEGRAM"
wrangler tail | grep "ERROR"
```

### Test KV Access

Use the diagnostic tools in `src/debug/kv-test.ts`:

```bash
# Via endpoint
curl https://cloudbrain.workers.dev/debug/diagnostics
```

### Test Channels

1. **Telegram**: Send message to bot
2. **Discord**: Send slash command
3. **WhatsApp**: Send message to business number

## Security Considerations

### Credential Management

- ✓ All credentials stored in KV (never in code)
- ✓ Credentials passed as parameters (not env variables)
- ✓ Telegram owner ID verification (messages only from owner)
- ✓ Discord signature verification
- ✓ WhatsApp token verification

### Data Protection

- ✓ HTTPS only (Cloudflare handles)
- ✓ Private channel setup required
- ✓ Rate limiting (platform limits apply)
- ✓ No sensitive data in logs

## Performance Optimization

### Caching

- ChannelManager cached per request
- Channel credentials cached from KV
- AI model loaded once per request
- DB connections reused

### Async Processing

- Webhook setup runs in background (non-blocking)
- Large responses sent asynchronously
- Database writes don't block response

### Cost Optimization

- Use Workers for simple tasks (<10s, single step)
- Use Workflows for complex tasks (>10s, multiple steps)
- Cache frequently used data
- Batch KV operations

## Deployment Checklist

- [ ] Create KV namespace: `wrangler kv:namespace create "cloudbrain"`
- [ ] Create D1 database: `wrangler d1 create cloudbrain`
- [ ] Add credentials to KV (at minimum: Telegram token & owner ID)
- [ ] Bind KV in Cloudflare Dashboard (SECRETS)
- [ ] Bind D1 in Cloudflare Dashboard (DB)
- [ ] Bind AI in Cloudflare Dashboard (AI)
- [ ] Deploy: `wrangler deploy`
- [ ] Test: `curl https://yourdomain/health`
- [ ] Send test message to bot
- [ ] Monitor logs: `wrangler tail`

## Troubleshooting Flow

```
Problem: Channels not showing as active

1. Check bindings configured
   └─→ Go to Worker Settings → Bindings
   └─→ Verify SECRETS, DB, AI are all bound

2. Check credentials in KV
   └─→ wrangler kv:key list --namespace-id=YOUR_ID
   └─→ Verify keys exist

3. Check credential format
   └─→ Telegram token: 123456789:ABCdefGHI...
   └─→ Owner ID: numeric

4. Check logs
   └─→ wrangler tail
   └─→ Look for [ERROR] messages

5. Run diagnostics
   └─→ curl https://yourdomain/debug/diagnostics
   └─→ Review JSON output
```

## Monitoring Production

### Key Metrics

- Active channels (should show Telegram if token set)
- Error rate (check logs regularly)
- Workflow deployments & executions
- API call success rate
- Database query performance

### Alerting

1. Check logs daily: `wrangler tail --format json`
2. Look for `[ERROR]` entries
3. Set up Cloudflare alerting:
   - Workers error rate > 5%
   - Response time > 5 seconds
4. Monitor KV quota usage

### Logs to Monitor

```
[ERROR] [TELEGRAM] - Issues with Telegram channel
[ERROR] [WORKFLOW] - Workflow deployment failures
[ERROR] [KV] - Credential access issues
[WARN] [WEBHOOK] - Webhook registration problems
```

## Next Steps

1. **Deploy CloudBrain**
   - Follow deployment checklist
   - Test basic functionality

2. **Set up Telegram**
   - Follow TELEGRAM_KV_ACCESS_TEST.md
   - Send test messages

3. **Try Workflows**
   - Follow WORKFLOWS_FEATURE.md
   - Create a workflow via natural language

4. **Monitor & Maintain**
   - Check logs regularly
   - Update credentials as needed
   - Monitor cost & performance

## Support & Resources

- **README.md** - General setup and features
- **TELEGRAM_KV_ACCESS_TEST.md** - Testing guide
- **WORKFLOWS_FEATURE.md** - Workflow documentation
- **DEPLOYMENT_GUIDE.md** - Step-by-step deployment
- **Cloudflare Docs** - Infrastructure documentation
