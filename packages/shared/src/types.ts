/**
 * CloudBrain V2 — shared domain types.
 * Imported by both the server (Cloudflare Worker) and the web SPA.
 * No runtime dependencies beyond zod.
 */

// ── Execution modes ───────────────────────────────────────────────────────
export type ExecutionMode = 'quick' | 'agent' | 'deep';

// ── Users / auth ──────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

export interface SessionInfo {
  user: User;
  expiresAt: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ConversationSummary {
  id: string;
  title: string;
  projectId: string | null;
  pinned: boolean;
  updatedAt: string;
}

export interface ToolCallRecord {
  toolId: string;
  provider: 'core' | 'composio' | 'cloudflare';
  argsSummary: string;          // redacted
  status: 'running' | 'succeeded' | 'failed';
  resultSummary?: string;       // redacted
  error?: string;
  durationMs?: number;
}

export interface PlanStep {
  id: string;
  title: string;
  tool?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  note?: string;
}

export interface AgentActivity {
  mode: ExecutionMode;
  plan?: PlanStep[];
  toolCalls: ToolCallRecord[];
  subAgents?: { name: string; purpose: string; status: 'running' | 'done' | 'failed' }[];
  integrationActions?: {
    toolkit: string;
    action: string;
    accountLabel?: string;
    status: 'running' | 'succeeded' | 'failed' | 'awaiting_approval';
    summary: string;
  }[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  model?: string;
  activity?: AgentActivity | null;
  createdAt: string;
}

// ── Stream events (Durable Object → browser) ─────────────────────────────
export type StreamEvent =
  | { type: 'status'; conversationId: string; phase: 'thinking' | 'planning' | 'executing' | 'responding' | 'done' | 'error'; message?: string }
  | { type: 'token'; conversationId: string; messageId: string; text: string }
  | { type: 'activity'; conversationId: string; activity: AgentActivity }
  | { type: 'message'; conversationId: string; message: ChatMessage }
  | { type: 'approval'; conversationId: string; approval: ApprovalRequest }
  | { type: 'task'; conversationId: string; task: TaskSummary }
  | { type: 'error'; conversationId: string; message: string };

// ── Approvals ─────────────────────────────────────────────────────────────
export type ApprovalDecision = 'pending' | 'approved_once' | 'always_allowed' | 'denied';

export interface ApprovalRequest {
  id: string;
  taskId: string | null;
  toolId: string;
  summary: string;
  resource?: string;
  consequence?: string;
  accountLabel?: string;
  createdAt: string;
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export type TaskStatus =
  | 'queued' | 'running' | 'waiting_approval' | 'blocked'
  | 'failed' | 'completed' | 'cancelled';

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  mode: ExecutionMode;
  assignedAgent?: string;
  conversationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskSummary {
  plan?: PlanStep[] | null;
  progress?: PlanStep[] | null;
  error?: string | null;
}

// ── Integrations (Composio) ───────────────────────────────────────────────
export type ConnectionStatus =
  | 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'EXPIRED'
  | 'REAUTH_REQUIRED' | 'ERROR' | 'DISCONNECTED' | 'PENDING_APPROVAL' | 'UNKNOWN';

export interface ToolkitSummary {
  slug: string;
  name: string;
  description: string;
  category?: string;
  logoUrl?: string;
  authSchemes: AuthMethod[];
  connectionStatus: ConnectionStatus;
  connectedAccountCount: number;
}

export type AuthMethod =
  | 'OAUTH2' | 'OAUTH1' | 'API_KEY' | 'BASIC' | 'BEARER_TOKEN'
  | 'NO_AUTH' | 'CUSTOM' | 'COMPOSIO_LINK' | 'UNKNOWN';

export interface AuthFieldSpec {
  name: string;
  label: string;
  type: 'string' | 'secret';
  required: boolean;
  description?: string;
}

export interface ConnectionFlowSpec {
  method: AuthMethod;
  requiresUserInput: boolean;
  fields: AuthFieldSpec[];
  /** Composio-managed OAuth → server generates redirect; custom OAuth handled by Composio dashboard. */
  isComposioManaged: boolean;
}

export interface ConnectedAccount {
  id: string;                        // CloudBrain-local id
  composioId: string;                // Composio connected account nanoid
  toolkitSlug: string;
  status: ConnectionStatus;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ActionSummary {
  slug: string;
  name: string;
  description: string;
  toolkitSlug: string;
  riskLevel: RiskLevel;
  requiresConnection: boolean;
  inputSchema?: Record<string, unknown>;
}

export type RiskLevel = 'read' | 'safe' | 'write' | 'destructive' | 'external' | 'sensitive';

export interface IntegrationActivityRecord {
  id: string;
  toolkitSlug: string;
  toolSlug: string;
  status: 'running' | 'succeeded' | 'failed' | 'awaiting_approval';
  inputSummary: string | null;
  outputSummary: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

// ── Models / providers ────────────────────────────────────────────────────
export type ProviderId =
  | 'workers-ai' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter';

export interface ModelOption {
  id: string;                        // e.g. "openai/gpt-4o-mini"
  provider: ProviderId;
  label: string;
  available: boolean;                // depends on configured secrets
  contextWindow?: number;
}

// ── Schedules ─────────────────────────────────────────────────────────────
export interface ScheduleSummary {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  prompt: string;
  mode: ExecutionMode;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

// ── Artifacts / files ─────────────────────────────────────────────────────
export interface ArtifactSummary {
  id: string;
  taskId: string | null;
  kind: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

// ── Memory ────────────────────────────────────────────────────────────────
export type MemoryKind =
  | 'working' | 'session' | 'long_term' | 'project' | 'episodic' | 'semantic';

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  content: string;
  source: string | null;
  confidence: number;
  lastUsedAt: string | null;
  createdAt: string;
}

// ── Agent tool descriptor (server → model + Tools page) ──────────────────
export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  category: 'workspace' | 'execution' | 'browser' | 'cloudflare' | 'knowledge' | 'integrations' | 'external';
  provider: 'core' | 'composio' | 'cloudflare';
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  inputSchema: Record<string, unknown>;
  associatedSkill?: string;
}
