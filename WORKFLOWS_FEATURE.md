# Cloudflare Workflows Feature Documentation

CloudBrain now supports **Cloudflare Workflows** - a powerful feature for building durable, multi-step applications that automatically retry and persist state.

## Overview

Workflows allow you to:

- **Build multi-step processes** that run reliably on Cloudflare infrastructure
- **Automatically retry failed steps** with exponential backoff
- **Persist state** for minutes, hours, or even weeks
- **Chain complex operations** without worrying about timeouts
- **Get AI recommendations** on when to use Workflows vs Workers

## When to Use Workflows vs Workers

CloudBrain automatically analyzes task complexity and recommends the best approach:

### Use **Workflows** When:

- ✓ Task has multiple steps (e.g., validate → process → store → notify)
- ✓ Steps may take 5+ seconds each
- ✓ State needs to persist between steps
- ✓ Requires automatic retries
- ✓ Complex AI processing involved

**Example:** "Create a workflow to analyze documents daily, extract data, store results, and send summaries"

### Use **Workers** When:

- ✓ Simple, single-step tasks
- ✓ Completes within 30 seconds
- ✓ No state needed between steps
- ✓ Immediate response required

**Example:** "Transform this image to webp format"

## Creating Workflows via Natural Language

The simplest way to create workflows is through natural language commands:

### Basic Creation

```
User: "Create a workflow to check email daily and forward important ones"

CloudBrain:
✅ Recommendation: Use Workflow
Complexity: 28/50
Estimated Steps: 3

This workflow will:
- Complexity is moderate with multiple steps
- Workflow provides durability and automatic retries
- Perfect for scheduled checks with state persistence

Workflow deployed! ID: wf-check-email-daily-1234567890
```

### With Detailed Description

```
User: "Make automation: every hour, fetch latest articles from Hacker News,
       analyze them with AI, store in database, and send summary to telegram"

CloudBrain Analysis:
- Complexity: 42/50 (high)
- Estimated Steps: 5
- Requires AI: Yes
- Requires State: Yes

Recommendation: ✅ Use Workflow (preferred)
- Automatic retries and error handling
- Built-in state persistence
- Can handle long-running tasks
- Better suited for hourly scheduling

Cost Estimate: ~$0.75/1M requests (includes retries & state management)
```

## Workflow Complexity Analysis

CloudBrain analyzes tasks on a **1-50 complexity scale**:

- **1-15 (Simple)** → Use Worker
- **16-35 (Moderate)** → Hybrid approach (Worker + Workflow)
- **36-50 (Complex)** → Use Workflow

### Factors That Increase Complexity:

- Multiple steps (each adds 5-8 points)
- AI processing (adds 6 points)
- State management (adds 5 points)
- Database operations (adds 4 points)
- External API calls (adds 3-4 points)
- Error handling (adds 3 points)
- Scheduling/looping (adds 3-5 points)

## Workflow Structure

Auto-generated workflows have this structure:

```typescript
// Step 1: Validate Input
// - Verify inputs are correct
// - Check permissions

// Step 2-N: Process Steps
// - Execute business logic
// - Handle errors
// - Store intermediate results

// Complete: Mark done
// - Record completion time
// - Send notification

// Error Handler: Fallback logic
// - Retry failed steps
// - Log errors
// - Notify admin
```

## Example Workflows

### 1. Daily Email Digest

```
User: "Create a workflow that fetches emails hourly, summarizes them with AI,
       and sends a digest every evening"

Generated Workflow:
{
  name: "wf-email-digest-daily",
  trigger: "scheduled",
  steps: [
    { id: "fetch", name: "Fetch Recent Emails" },
    { id: "process", name: "Summarize with AI" },
    { id: "store", name: "Store in Database" },
    { id: "send", name: "Send Telegram Message" }
  ],
  timeout: 120,
  retryPolicy: { maxRetries: 3 }
}
```

### 2. Content Processing Pipeline

```
User: "Make an automation for: upload image → convert to webp → extract text
       with AI → store metadata → send confirmation"

Complexity: 35/50 (moderate-high)
Recommendation: Hybrid
- Worker: Handle upload and conversion (fast)
- Workflow: Manage AI extraction and storage (stateful)

Cost: ~$0.45/1M requests
```

### 3. Data Aggregation

```
User: "Create workflow: collect data from 5 APIs, merge results, analyze trends,
       store in DB, and alert if thresholds exceeded"

Complexity: 44/50 (very high)
Recommendation: Workflow (strongly preferred)
- 5 parallel API calls
- AI trend analysis
- Database state management
- Conditional alerting
```

## Managing Workflows

### List Deployed Workflows

```
User: "Show my workflows"

CloudBrain:
📋 Deployed Workflows:

1. **wf-email-digest-daily** (deployed)
   ID: 550e8400-e29b-41d4-a716-446655440000
   Created: May 25, 2026

2. **wf-document-processor** (deployed)
   ID: 660f9511-f40c-52e5-b827-557766551111
   Created: May 24, 2026
```

### Trigger a Workflow

```
User: "Run the email digest workflow now"

CloudBrain:
✅ Workflow triggered!

Workflow: wf-email-digest-daily
Instance ID: inst-abc123
Status: queued

The workflow is now running. You can check its progress anytime.
```

### Check Workflow Status

```
User: "Show status of wf-email-digest-daily"

CloudBrain:
📊 Workflow Instance Status:

Workflow: wf-email-digest-daily
Instance ID: inst-abc123
Status: running

Steps:
- fetch: ✓ complete (2.3s)
- process: ⏳ running (started 5s ago)
- store: ⏳ waiting
- send: ⏳ waiting

Progress: 33% (1 of 3 steps complete)
```

### Delete a Workflow

```
User: "Delete the email digest workflow"

CloudBrain:
✅ Workflow "wf-email-digest-daily" deleted successfully

All instances of this workflow have been terminated.
```

## Advanced Features

### Parallel Processing

Workflows support parallel steps:

```
"Create a workflow that fetches data from 5 different APIs in parallel,
 then combines the results"

Workflow Structure:
├─ fetch_api_1 ─┐
├─ fetch_api_2 ─┤
├─ fetch_api_3 ─┼─→ combine → store
├─ fetch_api_4 ─┤
└─ fetch_api_5 ─┘
```

### Conditional Logic

Workflows can branch based on conditions:

```
"Create automation: check email, if urgent send immediately,
 else wait and send as digest"

Workflow Structure:
fetch_email → is_urgent? ─→ yes → send_immediately
             └─→ no → add_to_digest
```

### Long-running Tasks

Workflows can handle tasks that exceed 30-second worker timeout:

```
"Process large file, analyze sections, AI review each part, compile report"

Total Time: ~120 seconds (4 minutes)
- File processing: 20s
- Section analysis: 60s (5 sections × 12s each)
- AI review: 30s
- Report compilation: 10s

Worker would timeout after 30s → Workflow handles it perfectly
```

## Cost Considerations

### Workflow vs Worker Pricing

| Factor | Worker | Workflow |
|--------|--------|----------|
| Base Cost | $0.50/1M req | ~$0.15/step |
| Single Step | $0.50/1M | $0.15/1M |
| 5 Steps | $0.50/1M | $0.75/1M |
| Retries | Extra cost | Included |
| State Storage | Extra (KV) | Included |
| Long Tasks (>30s) | Not possible | Possible |

### Cost Optimization Tips

1. **Use Workers for simple tasks** - 1-2 steps, <10 seconds
2. **Use Workflows for complex tasks** - 3+ steps or state-heavy
3. **Combine both** - Worker for UI response, Workflow for background processing
4. **Batch operations** - Group smaller tasks into fewer steps

## Error Handling

Workflows automatically handle errors:

```
Step execution:
1. Execute step
2. If fails, wait (exponential backoff)
3. Retry (default: 3 times)
4. If still fails, move to error handler
5. Log error and notify admin
```

### Example Error Scenario

```
User: "Create workflow: fetch data, process, store"

Execution:
✓ fetch_data: success (2s)
✗ process: failed (API timeout after 15s)
⏳ retry 1: waiting 1s
✗ retry 1: failed
⏳ retry 2: waiting 2s
✗ retry 2: failed
⏳ retry 3: waiting 4s
✓ retry 3: success (10s)
✓ store: success (1s)

Result: Workflow completed successfully after 3 retries
```

## Monitoring & Observability

### View Workflow Logs

```bash
# Stream logs while workflow runs
wrangler tail --format json | grep "WORKFLOW"
```

### Monitor via Dashboard

1. Go to Cloudflare Dashboard
2. Workers → cloudbrain
3. Workflows section (if available)
4. View run history and metrics

### Via CloudBrain Commands

```
User: "Show logs for wf-email-digest-daily"

CloudBrain:
📋 Workflow Logs:

[2026-05-25 14:30:15] ✓ fetch_emails: Retrieved 42 messages
[2026-05-25 14:30:22] ✓ analyze_sentiment: 12 high priority, 30 normal
[2026-05-25 14:30:45] ✓ store_digest: Saved to database
[2026-05-25 14:31:02] ✓ send_notification: Sent to Telegram

Total Duration: 47 seconds
Status: ✓ Complete
```

## Limitations & Notes

### Cloudflare Workflows Limits

- **Max step timeout**: 15 minutes per step
- **Max workflow duration**: 7 days
- **State storage**: Depends on plan (free: KV limit)
- **Concurrent workflows**: 1000s per account
- **Retry policy**: Max 100 retries

### CloudBrain Workflow Limits

- **Auto-generated steps**: 1-10 steps
- **Complexity calculation**: 1-50 scale (heuristic)
- **Recommendation confidence**: Based on keyword analysis

## API Reference

### Natural Language Commands

```
# Create
"Create workflow for [description]"
"Make automation to [description]"
"Setup workflow: [description]"

# List
"Show my workflows"
"List all workflows"
"What workflows do I have?"

# Trigger
"Run [workflow name]"
"Trigger [workflow name] workflow"
"Execute [workflow name]"

# Status
"Show status of [workflow name]"
"Check [workflow name] progress"
"How's [workflow name] doing?"

# Delete
"Delete [workflow name]"
"Remove [workflow name] workflow"
"Unploy [workflow name]"
```

### Programmatic Usage

```typescript
import { WorkflowManager, analyzeTask, getRecommendation } from './workflows';

// Initialize
const manager = new WorkflowManager();
await manager.initialize(env);

// Analyze task
const analysis = analyzeTask({
  description: "Daily email digest",
  intent: { action: "email-digest", parameters: {}, confidence: 0.9, rawText: "" },
  parameters: {}
});

// Get recommendation
const rec = getRecommendation(analysis);

// Deploy
if (rec.suggested === 'workflow') {
  const deployed = await manager.deployWorkflow(definition);
}

// Trigger
const instance = await manager.triggerWorkflow('wf-email-digest', { emails: [] });

// Status
const status = await manager.getInstanceStatus('wf-email-digest', instance.id);
```

## Troubleshooting

### Workflow Fails to Deploy

**Problem:**
```
Failed to deploy workflow: API credentials not configured
```

**Solution:**
1. Add Cloudflare API token to KV: `CLOUDFLARE_API_TOKEN`
2. Add Account ID to KV: `CLOUDFLARE_ACCOUNT_ID`
3. Redeploy: `wrangler deploy`

### Workflow Stuck in Running

**Problem:**
```
Status: running (for over 1 hour)
```

**Solutions:**
1. Check step logs for errors
2. Manually terminate if needed
3. Check for infinite loops in workflow definition

### Step Keeps Retrying

**Problem:**
```
Step: process (retry 5/10)
```

**Solutions:**
1. Check error logs for root cause
2. Verify external API availability
3. Increase step timeout in workflow config
4. Modify retry policy if needed

## Roadmap

Planned features:

- [ ] Scheduled workflow triggers (cron)
- [ ] Conditional branching in UI
- [ ] Workflow templates gallery
- [ ] Performance analytics and metrics
- [ ] A/B testing for workflow variants
- [ ] Multi-region workflow execution
- [ ] Real-time workflow monitoring dashboard

## Resources

- [Cloudflare Workflows API](https://developers.cloudflare.com/workflows/)
- [Workers Documentation](https://developers.cloudflare.com/workers/)
- [KV Storage Guide](https://developers.cloudflare.com/kv/)
- [D1 Database Guide](https://developers.cloudflare.com/d1/)

## Support

For issues or questions about workflows:

1. Check the **Troubleshooting** section above
2. Review **TELEGRAM_KV_ACCESS_TEST.md** for debugging tips
3. Check **README.md** for general CloudBrain setup
4. Contact Cloudflare support for infrastructure issues
