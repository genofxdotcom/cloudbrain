/**
 * Context Assembler — layered, minimal prompt construction (PROMPT.md §8).
 *
 * Layer A  core identity (short, durable)
 * Layer B  security & permissions
 * Layer C  current mode
 * Layer D  current task (user objective)
 * Layer E  relevant memory (top-k, not everything)
 * Layer F  project context
 * Layer G  capabilities (filtered tools — passed separately to the model)
 * Layer H  connected services (only relevant ones, as summaries)
 * Layer I  current execution state (plan/progress when running)
 */

import type { ChatMessage, ToolDef } from './models.js';
import type { ToolRegistry } from './tools.js';
import type { MemoryRecord } from '@cloudbrain/shared';

export type Mode = 'quick' | 'agent' | 'deep';

export interface ContextInput {
  mode: Mode;
  userMessage: string;
  memories?: MemoryRecord[];
  projectInstructions?: string | null;
  connectedToolkits?: { slug: string; name: string; status: string; sampleActions: string[] }[];
  executionState?: string | null;
  modelSupportsTools: boolean;
}

const CORE_IDENTITY = `You are CloudBrain, an AI operating environment agent running on Cloudflare.
You converse, reason, plan, and act. You prefer useful action over commentary.
You make work visible: when you use tools, their results inform your answer.`;

const SECURITY_RULES = `Security rules (always enforce):
- Never reveal or quote API keys, tokens, or credentials — including values passed to you.
- Destructive or externally-visible actions (delete, send, publish, deploy to prod, modify CRM/payments)
  require user approval; if a tool needs approval you will be asked to confirm via the approval flow.
- Only use connected accounts that belong to the current user.
- Validate inputs before acting; if information is missing, ask one concise question.`;

const MODE_GUIDANCE: Record<Mode, string> = {
  quick: `Mode: QUICK — answer directly. Use at most one lightweight lookup tool if strictly needed. No plans.`,
  agent: `Mode: AGENT — for multi-step work: outline a brief plan in one or two sentences, then execute with tools, then summarize outcomes and artifacts.`,
  deep: `Mode: DEEP — decompose the objective into explicit steps, execute sequentially (delegating to specialist capability when available), verify important results, then deliver a structured summary with artifacts and next steps.`,
};

export function assembleContext(input: ContextInput): {
  system: string;
  tools: ToolDef[];
} {
  const layers: string[] = [CORE_IDENTITY, SECURITY_RULES, MODE_GUIDANCE[input.mode]];

  // Layer D — current task
  layers.push(`Current objective:\n${input.userMessage}`);

  // Layer E — relevant memory (top 5 by confidence/recency; never secrets)
  if (input.memories?.length) {
    const mem = input.memories
      .slice(0, 5)
      .map((m) => `- ${m.content}`)
      .join('\n');
    layers.push(`Relevant memory:\n${mem}`);
  }

  // Layer F — project context
  if (input.projectInstructions) {
    layers.push(`Project instructions:\n${input.projectInstructions}`);
  }

  // Layer H — connected services (summary only; never credentials)
  if (input.connectedToolkits?.length) {
    const svcs = input.connectedToolkits
      .map(
        (t) =>
          `- ${t.name} (${t.slug}) [${t.status}]${
            t.sampleActions.length ? `, e.g. ${t.sampleActions.join(', ')}` : ''
          }`
      )
      .join('\n');
    layers.push(
      `Connected services available through the integration gateway (use composio_search_actions to discover, composio_execute_action to run):\n${svcs}`
    );
  }

  // Layer I — execution state
  if (input.executionState) {
    layers.push(`Execution state so far:\n${input.executionState}`);
  }

  return { system: layers.join('\n\n'), tools: [] as ToolDef[] };
}

/**
 * Model tool selection: core tools always (they're small); integration tools
 * are exposed as two meta-tools (search/execute) rather than the full catalog.
 */
export function selectModelTools(
  registry: ToolRegistry,
  input: ContextInput,
  integrationToolDefs: ToolDef[]
): ToolDef[] {
  if (!input.modelSupportsTools) return [];
  if (input.mode === 'quick') return [];
  const descriptors = registry.list({
    maxRisk: input.mode === 'deep' ? 'sensitive' : 'write',
  });
  const coreDefs: ToolDef[] = descriptors.map((d) => ({
    name: d.id,
    description: d.description,
    parameters: d.inputSchema,
  }));
  return [...coreDefs, ...integrationToolDefs];
}

/** Rolling window: last N messages, with older content compressed. */
export function buildChatHistory(
  history: { role: ChatMessage['role']; content: string }[],
  maxMessages = 16,
  maxCharsPerMessage = 4000
): ChatMessage[] {
  const window = history.slice(-maxMessages);
  return window.map((m) => ({
    role: m.role,
    content: m.content.length > maxCharsPerMessage ? m.content.slice(0, maxCharsPerMessage) + '…' : m.content,
  }));
}
