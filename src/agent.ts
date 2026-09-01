/**
 * Agent Orchestrator — CloudBrain's main agent.
 *
 * Flow per PROMPT.md §7:
 *   QUICK : understand → (≤1 lookup) → answer
 *   AGENT : understand → plan → execute (tools, integrations) → verify → respond
 *   DEEP  : analyze → decompose → plan → execute sequentially → verify → iterate → finalize
 *
 * Every step emits StreamEvents through the RealtimeHub so execution is never
 * invisible. Destructive capability goes through the approval gate.
 */

import type {
  AgentActivity,
  ChatMessage as SharedChatMessage,
  PlanStep,
  ToolCallRecord,
} from '@cloudbrain/shared';
import { redactToJson } from '@cloudbrain/shared';
import { IntegrationProvider, ComposioError } from '@cloudbrain/integrations';
import { ModelGateway, type ChatMessage, type ToolCall, type ToolDef } from './models.js';
import { ToolRegistry, createCoreTools, type ToolContext } from './tools.js';
import { assembleContext, buildChatHistory, selectModelTools, type Mode } from './context.js';
import { requestApproval, waitForDecision, requiresApproval } from './permissions.js';
import { randomId } from './auth.js';
import type { Env } from './env.js';

export interface RunParams {
  userId: string;
  conversationId: string;
  mode: Mode;
  model: string;
  userMessage: string;
  projectId?: string | null;
  history: { role: SharedChatMessage['role']; content: string }[];
  memories: { content: string; confidence: number }[];
  projectInstructions?: string | null;
  connectedToolkits: { slug: string; name: string; status: string; sampleActions: string[] }[];
  publish: (event: Record<string, unknown>) => Promise<void>;
}

export interface RunResult {
  messageId: string;
  text: string;
  activity: AgentActivity;
}

const MAX_TOOL_ROUNDS = 8;

export class AgentOrchestrator {
  private registry: ToolRegistry;

  constructor(
    private readonly env: Env,
    private readonly gateway: ModelGateway,
    private readonly integration: IntegrationProvider
  ) {
    this.registry = new ToolRegistry();
    for (const tool of createCoreTools()) this.registry.register(tool);
  }

  async run(params: RunParams): Promise<RunResult> {
    const messageId = randomId('msg');
    const activity: AgentActivity = { mode: params.mode, toolCalls: [], plan: [], subAgents: [] };

    await params.publish({
      type: 'status',
      conversationId: params.conversationId,
      phase: 'thinking',
      message: params.mode === 'quick' ? 'Thinking…' : 'Analyzing request…',
    });

    // ── Planning (agent/deep modes) ──────────────────────────────────────
    if (params.mode !== 'quick') {
      await params.publish({ type: 'status', conversationId: params.conversationId, phase: 'planning' });
      const plan = await this.makePlan(params);
      activity.plan = plan;
      await params.publish({ type: 'activity', conversationId: params.conversationId, activity });
    }

    // ── Execution loop ───────────────────────────────────────────────────
    await params.publish({ type: 'status', conversationId: params.conversationId, phase: 'executing' });

    const integrationDefs = this.integrationToolDefs(params.userId);
    const { system } = assembleContext({
      mode: params.mode,
      userMessage: params.userMessage,
      memories: params.memories.map((m) => ({ ...m, id: '', kind: 'long_term', source: null, lastUsedAt: null, createdAt: '' })),
      projectInstructions: params.projectInstructions,
      connectedToolkits: params.connectedToolkits,
      executionState: activity.plan?.length ? summarizePlan(activity.plan) : null,
      modelSupportsTools: true,
    });
    const tools = selectModelTools(this.registry, { mode: params.mode, userMessage: params.userMessage, modelSupportsTools: true }, integrationDefs);

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...buildChatHistory([...params.history, { role: 'user', content: params.userMessage }]),
    ];

    let finalText = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await this.gateway.chat({
        model: params.model,
        messages,
        tools: tools.length ? tools : undefined,
        onToken: async (delta) => {
          await params.publish({ type: 'token', conversationId: params.conversationId, messageId, text: delta });
        },
      });

      if (!result.toolCalls.length) {
        finalText = result.text;
        break;
      }

      // Record assistant tool_call turn, execute each call, feed results back.
      messages.push({
        role: 'assistant',
        content: result.text,
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const record = await this.executeToolCall(call, params, activity, integrationDefs);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: typeof record.resultSummary === 'string' ? record.resultSummary : JSON.stringify(record.resultSummary ?? {}),
        });
      }
      await params.publish({ type: 'activity', conversationId: params.conversationId, activity });
    }

    // Final response if the loop ended on tool results without a summary.
    if (!finalText) {
      const result = await this.gateway.chat({
        model: params.model,
        messages: [
          ...messages,
          {
            role: 'user',
            content:
              'Summarize the outcome for the user now. Be concise. Mention artifacts created, side effects, and any failures with recovery steps.',
          },
        ],
        onToken: async (delta) => {
          await params.publish({ type: 'token', conversationId: params.conversationId, messageId, text: delta });
        },
      });
      finalText = result.text;
    }

    await params.publish({ type: 'status', conversationId: params.conversationId, phase: 'done' });
    await params.publish({
      type: 'message',
      conversationId: params.conversationId,
      message: {
        id: messageId,
        conversationId: params.conversationId,
        role: 'assistant',
        content: finalText,
        model: params.model,
        activity,
        createdAt: new Date().toISOString(),
      },
    });

    return { messageId, text: finalText, activity };
  }

  // ── Planning ─────────────────────────────────────────────────────────────
  private async makePlan(params: RunParams): Promise<PlanStep[]> {
    try {
      const result = await this.gateway.chat({
        model: params.model,
        temperature: 0.1,
        maxTokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'You are a planning module. Output ONLY a JSON array of steps: [{"title": string, "tool"?: string}]. ' +
              'Max 6 steps for deep mode, 3 for agent mode. No prose.',
          },
          { role: 'user', content: params.userMessage },
        ],
      });
      const match = result.text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { title?: string; tool?: string }[];
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 6).map((s, i) => ({
            id: `step_${i + 1}`,
            title: String(s.title ?? `Step ${i + 1}`),
            tool: s.tool,
            status: 'pending' as const,
          }));
        }
      }
    } catch {
      // planning is best-effort; fall through to implicit plan
    }
    return [
      { id: 'step_1', title: 'Gather information', status: 'pending' },
      { id: 'step_2', title: 'Execute the task', status: 'pending' },
      { id: 'step_3', title: 'Summarize results', status: 'pending' },
    ];
  }

  // ── Tool execution with approval gate ────────────────────────────────────
  private async executeToolCall(
    call: ToolCall,
    params: RunParams,
    activity: AgentActivity,
    integrationDefs: ToolDef[]
  ): Promise<ToolCallRecord> {
    const started = Date.now();
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
    } catch {
      parsedArgs = {};
    }

    const record: ToolCallRecord = {
      toolId: call.name,
      provider: integrationDefs.some((d) => d.name === call.name) ? 'composio' : 'core',
      argsSummary: redactToJson(parsedArgs) ?? '{}',
      status: 'running',
    };
    activity.toolCalls.push(record);

    try {
      let output: unknown;

      if (call.name === 'composio_search_actions') {
        const query = String(parsedArgs['query'] ?? '');
        const actions = await this.integration.searchActions(query, { limit: 8 });
        output = actions;
        record.resultSummary = `${actions.length} actions found`;
      } else if (call.name === 'composio_execute_action') {
        output = await this.executeIntegrationAction(parsedArgs, params, activity, record);
      } else {
        const handler = this.registry.get(call.name);
        if (!handler) {
          throw new Error(`Unknown tool: ${call.name}`);
        }
        if (requiresApproval(handler.descriptor.riskLevel)) {
          const accountLabel =
            typeof parsedArgs['connectedAccountId'] === 'string'
              ? String(parsedArgs['connectedAccountId'])
              : undefined;
          const req = await requestApproval(this.env.DB, {
            userId: params.userId,
            taskId: null,
            toolId: call.name,
            summary: `Agent wants to run "${handler.descriptor.name}".`,
            resource: redactToJson(parsedArgs) ?? undefined,
            consequence: handler.descriptor.riskLevel === 'destructive' ? 'This action may delete or irreversibly change data.' : undefined,
            accountLabel,
          });
          await params.publish({
            type: 'approval',
            conversationId: params.conversationId,
            approval: {
              id: req.approvalId,
              taskId: null,
              toolId: call.name,
              summary: `Agent wants to run "${handler.descriptor.name}".`,
              resource: record.argsSummary,
              accountLabel,
              createdAt: new Date().toISOString(),
            },
          });
          if (!req.existingAlwaysAllowed) {
            const decision = await waitForDecision(this.env.DB, req.approvalId);
            if (!decision.approved) {
              record.status = 'failed';
              record.error = 'Denied by user (approval required).';
              return record;
            }
          }
        }
        const ctx: ToolContext = {
          env: this.env,
          userId: params.userId,
          integration: this.integration,
          onEvent: async (summary) => {
            await params.publish({ type: 'status', conversationId: params.conversationId, phase: 'executing', message: summary });
          },
        };
        output = await handler.run(parsedArgs, ctx);
        record.resultSummary = compactResult(output);
      }

      record.status = 'succeeded';
      record.durationMs = Date.now() - started;
      return record;
    } catch (err) {
      record.status = 'failed';
      record.durationMs = Date.now() - started;
      record.error = err instanceof Error ? err.message : String(err);
      if (err instanceof ComposioError && (err.kind === 'auth' || err.kind === 'connection')) {
        record.error = `${record.error} (Check the Integrations page to reconnect.)`;
      }
      return record;
    }
  }

  private async executeIntegrationAction(
    parsedArgs: Record<string, unknown>,
    params: RunParams,
    activity: AgentActivity,
    record: ToolCallRecord
  ): Promise<unknown> {
    const actionSlug = String(parsedArgs['action'] ?? '');
    const toolkitSlug = actionSlug.split('_')[0]?.toLowerCase() ?? 'unknown';
    const rawArgs = (parsedArgs['arguments'] ?? {}) as Record<string, unknown>;
    const connectedAccountId =
      typeof parsedArgs['connectedAccountId'] === 'string' ? parsedArgs['connectedAccountId'] : undefined;

    // Look up risk before executing.
    let risk: 'read' | 'safe' | 'write' | 'destructive' | 'external' | 'sensitive' = 'safe';
    try {
      const schema = await this.integration.getActionSchema(actionSlug);
      risk = schema.riskLevel;
    } catch {
      // unknown schema → treat cautiously
      risk = 'write';
    }

    const actionRecord: NonNullable<AgentActivity['integrationActions']>[number] = {
      toolkit: toolkitSlug,
      action: actionSlug,
      accountLabel: connectedAccountId ?? 'default account',
      status: 'running',
      summary: record.argsSummary,
    };
    if (!activity.integrationActions) activity.integrationActions = [];
    activity.integrationActions.push(actionRecord);

    if (requiresApproval(risk)) {
      const req = await requestApproval(this.env.DB, {
        userId: params.userId,
        taskId: null,
        toolId: `composio:${actionSlug}`,
        summary: `Agent wants to execute ${actionSlug} via ${toolkitSlug}.`,
        resource: record.argsSummary,
        consequence:
          risk === 'destructive'
            ? 'This may delete or irreversibly change external data.'
            : risk === 'external'
              ? 'This will communicate with an external service on your behalf.'
              : 'This will modify external data.',
        accountLabel: actionRecord.accountLabel,
      });
      await params.publish({
        type: 'approval',
        conversationId: params.conversationId,
        approval: {
          id: req.approvalId,
          taskId: null,
          toolId: `composio:${actionSlug}`,
          summary: `Execute ${actionSlug} (${toolkitSlug})`,
          resource: record.argsSummary,
          accountLabel: actionRecord.accountLabel,
          createdAt: new Date().toISOString(),
        },
      });
      if (!req.existingAlwaysAllowed) {
        const decision = await waitForDecision(this.env.DB, req.approvalId);
        if (!decision.approved) {
          actionRecord.status = 'awaiting_approval';
          record.status = 'failed';
          record.error = 'Denied by user (approval required).';
          return { error: 'Approval denied.' };
        }
      }
    }

    const res = await this.integration.executeAction({
      cloudbrainUserId: params.userId,
      toolSlug: actionSlug,
      args: rawArgs,
      connectedAccountId,
    });

    // Record audit trail (redacted).
    await this.env.DB.prepare(
      `INSERT INTO activity (id, user_id, toolkit_slug, tool_slug, status, input_summary, output_summary, error, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        randomId('act'),
        params.userId,
        toolkitSlug,
        actionSlug,
        res.successful ? 'succeeded' : 'failed',
        record.argsSummary,
        compactResult(res.data),
        res.error ?? null,
        Date.now() % 1_000_000
      )
      .run()
      .catch(() => undefined);

    actionRecord.status = res.successful ? 'succeeded' : 'failed';
    record.resultSummary = compactResult(res.data) ?? res.error ?? 'done';
    return res.data ?? { ok: res.successful };
  }

  // ── Integration meta-tools (progressive discovery — never the catalog) ──
  private integrationToolDefs(userId: string): ToolDef[] {
    if (!this.integration.isConfigured) return [];
    void userId;
    return [
      {
        name: 'composio_search_actions',
        description:
          'Search available actions across the user’s connected applications (Gmail, Slack, GitHub, Notion…). ' +
          'Returns action slugs, descriptions and required connections. Use before executing.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'What you want to do, e.g. "send slack message"' } },
          required: ['query'],
        },
      },
      {
        name: 'composio_execute_action',
        description:
          'Execute a specific integration action (external side effects). Provide the exact action slug from ' +
          'composio_search_actions plus a JSON arguments object matching its schema.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Exact action slug, e.g. SLACK_SEND_MESSAGE' },
            arguments: { type: 'object', description: 'Arguments matching the action schema' },
            connectedAccountId: { type: 'string', description: 'Optional specific connected account id' },
          },
          required: ['action', 'arguments'],
        },
      },
    ];
  }
}

function summarizePlan(plan: PlanStep[]): string {
  return plan.map((s, i) => `${i + 1}. ${s.title}${s.tool ? ` [${s.tool}]` : ''}`).join('\n');
}

function compactResult(output: unknown): string | undefined {
  const json = redactToJson(output, 1200);
  return json ?? undefined;
}
