# CloudBrain Workflows - Complete Guide

## Overview

CloudBrain now includes native **Workflow** support for automating complex multi-step operations. Workflows are recommended for orchestrating tasks like:
- Multi-step processes with branching logic
- Scheduled/recurring operations
- Long-running operations with state management
- Error recovery and retry logic

## Quick Start

### Create a Workflow (Natural Language)

Simply tell the AI to create a workflow:

```
"Create a workflow called daily_summary that sends me a summary every morning"
"Make a workflow that collects data from an API and stores it"
"Create workflow called backup_files that backs up all files to R2 daily"
```

### Workflow Execution

```
"Execute workflow daily_summary"
"Run the backup_files workflow"
"List all workflows"
```

## When to Use Workflows vs Workers

### ✅ Use **Workflows** When:
- **Multi-step processes** (5+ steps)
- **Long-running operations** (takes >5 seconds)
- **Complex branching logic** with conditionals
- **State needs to persist** across steps
- **Error recovery/retries** are important
- **Scheduled/recurring** tasks
- **Decoupled execution** needed

**Pros:**
- ✅ Built-in error handling and retries
- ✅ State persistence across steps
- ✅ Native support for complex branching
- ✅ Automatic timeout and recovery
- ✅ Better monitoring and debugging
- ✅ Scalable for high-frequency executions

**Cons:**
- ❌ Higher latency per execution
- ❌ More resource overhead
- ❌ Less direct control

### ⚡ Use **Workers** When:
- **Simple operations** (<5 steps)
- **Real-time responses** needed (sub-100ms)
- **Minimal state management**
- **Direct user interaction**
- **Cost-sensitive** operations

**Pros:**
- ✅ Lowest latency (<100ms)
- ✅ Direct real-time execution
- ✅ Minimal overhead
- ✅ Best for user-facing operations
- ✅ Lower cost per execution
- ✅ Full control over execution flow

**Cons:**
- ❌ 30-second timeout limit
- ❌ Must handle retries manually
- ❌ No built-in state persistence
- ❌ Less suitable for long-running operations

### 🤝 Use **Hybrid** When:
- **Medium complexity** workflows
- **Mix of real-time and async** operations
- **Moderate execution frequency**

Best of both worlds: trigger from Worker, orchestrate via Workflow for complex parts.

## Workflow Structure

```typescript
interface Workflow {
  id: string;                    // Unique workflow ID
  name: string;                  // Human-readable name
  description: string;           // What it does
  enabled: boolean;              // Active/inactive
  trigger: WorkflowTrigger;      // How it starts
  steps: WorkflowStep[];         // What it executes
  metadata?: {
    author?: string;
    tags?: string[];
    executionCount?: number;
    lastExecuted?: number;
    errorCount?: number;
  };
}
```

## Trigger Types

### Manual Trigger
```typescript
trigger: {
  type: 'manual'
}
```
Executed on-demand via natural language or API.

### Message Trigger
```typescript
trigger: {
  type: 'message',
  channels: ['telegram', 'discord'],  // Optional: specific channels
  conditions?: {
    contains: 'keyword',               // Optional: message must contain text
  }
}
```
Triggered when message is received on specified channels.

### Schedule Trigger
```typescript
trigger: {
  type: 'schedule',
  schedule: '0 9 * * *'  // Cron format: Daily at 9 AM
}
```
Triggered on a schedule (cron format).

### Webhook Trigger
```typescript
trigger: {
  type: 'webhook',
  conditions?: {
    path: '/my-webhook'
  }
}
```
Triggered by incoming webhook requests.

## Step Types

### Action Steps
Execute built-in actions:

```typescript
{
  name: 'send_notification',
  type: 'action',
  description: 'Send a notification',
  config: {
    action: 'send_message',  // or 'store_data', 'retrieve_data', 'delete_data'
  }
}
```

Available actions:
- `send_message` - Send message to user
- `store_data` - Store data in database
- `retrieve_data` - Get data from database
- `delete_data` - Delete data

### API Call Steps
Make external HTTP requests:

```typescript
{
  name: 'fetch_weather',
  type: 'api_call',
  description: 'Get weather data',
  config: {
    url: 'https://api.weather.com/data',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer token'
    }
  }
}
```

### Condition Steps
Branching logic:

```typescript
{
  name: 'check_temperature',
  type: 'condition',
  description: 'Check if temp > 25°C',
  config: {
    field: 'temperature',
    operator: 'greater_than',  // or 'equals', 'contains', 'starts_with'
    value: 25
  }
}
```

Operators:
- `equals` - Exact match
- `not_equals` - Does not match
- `greater_than` - Numeric greater than
- `less_than` - Numeric less than
- `contains` - String contains substring
- `starts_with` - String starts with value

## Examples

### Example 1: Simple Notification Workflow

```
"Create a workflow called morning_brief that sends me a hello message every morning at 9 AM"
```

Results in:
```typescript
{
  name: 'morning_brief',
  description: 'sends me a hello message every morning at 9 AM',
  trigger: {
    type: 'schedule',
    schedule: '0 9 * * *'
  },
  steps: [
    {
      name: 'send_notification',
      type: 'action',
      config: { action: 'send_message' }
    }
  ]
}
```

### Example 2: Data Collection & Storage

```
"Make a workflow that fetches data from the API and stores it every day"
```

Results in:
```typescript
{
  name: 'daily_data_collection',
  trigger: { type: 'schedule' },
  steps: [
    {
      name: 'fetch_data',
      type: 'api_call',
      config: {
        url: 'https://api.example.com/data',
        method: 'GET'
      }
    },
    {
      name: 'store_data',
      type: 'action',
      config: { action: 'store_data' }
    }
  ]
}
```

### Example 3: Complex Workflow with Conditions

```
"Create workflow that checks temperature, if hot send alert, otherwise send normal update"
```

Results in:
```typescript
{
  name: 'temperature_monitor',
  trigger: { type: 'schedule' },
  steps: [
    {
      name: 'check_temp',
      type: 'api_call',
      config: { url: 'https://api.weather.com/temp' }
    },
    {
      name: 'is_hot',
      type: 'condition',
      config: {
        field: 'temperature',
        operator: 'greater_than',
        value: 30
      }
    },
    {
      name: 'send_alert',
      type: 'action',
      config: { action: 'send_message' }
    }
  ]
}
```

## Workflow Recommendations

CloudBrain automatically recommends whether to use **Worker**, **Workflow**, or **Hybrid** approach:

```
Created workflow "daily_task"
🔄 Recommended: Cloudflare Workflows - Better for complex, long-running operations with state management

✅ Pros:
- Built-in error handling and retries
- State persistence across steps
- Better monitoring and debugging
- Scalable for high-frequency executions

❌ Cons:
- Higher latency per execution
- More resource overhead
```

## Monitoring & Debugging

### View Workflow Status

```
"List all workflows"
"Show workflow daily_task"
```

Returns:
```json
{
  "id": "wf_123456_abc123",
  "name": "daily_task",
  "enabled": true,
  "status": "running",
  "lastExecuted": 1705507200000,
  "executionCount": 42,
  "errorCount": 0,
  "metadata": {
    "author": "ai_agent",
    "tags": ["scheduled", "daily"]
  }
}
```

### Check Execution History

```
"Show execution history for daily_task"
```

Returns execution records with:
- Status (pending, running, success, failed)
- Start time and duration
- Results from each step
- Error messages if failed

## Natural Language Commands

### Create Workflows

```
"Create a workflow called X that does Y"
"Make an automation for X"
"Setup workflow to do X"
```

### Execute Workflows

```
"Run workflow X"
"Execute X"
"Start the X workflow"
```

### Manage Workflows

```
"List all workflows"
"Show workflows"
"Disable workflow X"
"Enable workflow X"
"Delete workflow X"
```

## Workflow State & Persistence

Workflows maintain state across steps:

```typescript
// Step 1: Fetch data from API
{
  type: 'api_call',
  config: { url: '...' }
  // Returns: { apiResponse: {...}, status: 'success' }
}

// Step 2: Store data - can access results from Step 1
{
  type: 'action',
  config: { 
    action: 'store_data',
    dataFromPreviousStep: 'apiResponse'  // References previous step
  }
}
```

## Error Handling

Workflows automatically handle errors:

```
If a step fails:
1. Error is logged
2. Execution marked as 'failed'
3. Error message is saved
4. Workflow can be retried

If all retries exhausted:
1. User is notified
2. Error details are stored
3. Workflow can be manually investigated
```

## Performance Metrics

### Typical Execution Times:
- **Simple workflow** (1-3 steps): 100-500ms
- **Medium workflow** (3-7 steps): 500ms-2s
- **Complex workflow** (7+ steps with API calls): 2-10s+

### Scalability:
- **Simple workflows**: Handle 1000s of executions/sec
- **Medium workflows**: Handle 100s of executions/sec
- **Complex workflows**: Handle 10s-100s of executions/sec

## Storage & Limits

Workflows are stored in:
- **Memory** - For current session
- **KV** - For persistence (30-day TTL)
- **D1** - For execution history (optional)

Limits:
- Max steps per workflow: 50
- Max workflow size: 1MB
- Max execution history: 1000 records per workflow

## Best Practices

### ✅ Do:
1. **Keep workflows focused** - One job per workflow
2. **Use descriptive names** - "daily_email_summary" not "wf_1"
3. **Add descriptions** - Helps with understanding and debugging
4. **Test first** - Run manually before scheduling
5. **Monitor execution** - Check history regularly
6. **Set appropriate triggers** - Right frequency for your needs
7. **Use conditions** - For branching logic instead of sequential operations

### ❌ Don't:
1. **Create too many steps** - Keep under 20 if possible
2. **Put everything in one workflow** - Separate concerns
3. **Use hard-coded values** - Use variables/config
4. **Ignore errors** - Set up error notifications
5. **Create workflows for simple tasks** - Use Workers instead
6. **Leave workflows running unnecessarily** - Disable when not needed

## API Reference

### Create Workflow

```typescript
const result = await workflowManager.createWorkflow({
  name: 'my_workflow',
  description: 'Does something',
  trigger: { type: 'manual' },
  steps: [
    {
      name: 'step1',
      type: 'action',
      config: { action: 'send_message' }
    }
  ]
});

// Returns
{
  workflow: Workflow,
  recommendation: WorkflowSuggestion,
  confirmationCode: string
}
```

### Execute Workflow

```typescript
const execution = await workflowManager.executeWorkflow('wf_id');

// Returns
{
  id: string,
  workflowId: string,
  status: 'success' | 'failed',
  result: any,
  error?: string,
  stepResults: Map<string, any>
}
```

### List Workflows

```typescript
const workflows = workflowManager.listWorkflows();
```

### Get Workflow

```typescript
const workflow = await workflowManager.getWorkflow('wf_id');
```

### Manage Workflow

```typescript
await workflowManager.disableWorkflow('wf_id');
await workflowManager.enableWorkflow('wf_id');
await workflowManager.deleteWorkflow('wf_id');
```

## Troubleshooting

### Workflow not executing?
1. Check if enabled: `"Show workflow X"`
2. Check trigger: Verify schedule/conditions are correct
3. Check logs: Review execution history
4. Test manually: `"Run workflow X"`

### Steps are failing?
1. Check step config: Verify API URLs, conditions
2. Check dependencies: Make sure previous steps succeeded
3. Check logs: View error messages in execution history

### Workflow is slow?
1. Check step count: Too many steps slows execution
2. Check API calls: External APIs may be slow
3. Consider Worker: If not truly complex, use Worker instead

## Advanced Topics

### Using Workflow Output in Subsequent Steps

```typescript
// Step 1 returns data
{
  type: 'api_call',
  config: { url: 'https://api.example.com/users' }
  // Result: { apiResponse: { users: [...] } }
}

// Step 2 uses Step 1 data
{
  type: 'action',
  config: {
    action: 'store_data',
    data: '$.apiResponse.users'  // JSONPath reference
  }
}
```

### Conditional Branching

```typescript
steps: [
  { name: 'check_status', type: 'condition', ... },
  { name: 'if_true_action', type: 'action', ... },  // Runs if condition true
  { name: 'if_false_action', type: 'action', ... }, // Runs if condition false
]
```

### Error Recovery

```typescript
{
  name: 'fetch_with_retry',
  type: 'api_call',
  config: {
    url: 'https://api.example.com/data',
    retry: {
      attempts: 3,
      backoff: 'exponential'  // 1s, 2s, 4s
    }
  }
}
```

---

## Quick Reference

| Scenario | Recommendation |
|----------|-----------------|
| Simple message on trigger | **Worker** |
| 1-3 automated steps | **Worker** |
| Daily report generation | **Workflow** |
| API integration with retry | **Workflow** |
| Real-time response needed | **Worker** |
| 5+ step orchestration | **Workflow** |
| Complex branching logic | **Workflow** |
| File processing pipeline | **Workflow** |

---

**Last Updated:** May 25, 2026
**CloudBrain Version:** 2.0.0+workflows
