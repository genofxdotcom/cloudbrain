import type {
  ApprovalRequest,
  ChatMessage,
  ConnectionFlowSpec,
  ConnectedAccount,
  ConversationSummary,
  IntegrationActivityRecord,
  MemoryRecord,
  ModelOption,
  ScheduleSummary,
  TaskSummary,
  ToolkitSummary,
  ActionSummary,
} from '@cloudbrain/shared';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const apiClient = {
  // identity (Cloudflare Access in front of the Worker)
  me: () =>
    api<{
      user: { id: string; email: string; displayName?: string; isAdmin: boolean };
      provider: string;
    }>('/api/auth/me'),

  // chat
  conversations: () => api<{ conversations: ConversationSummary[] }>('/api/conversations'),
  createConversation: () => api<{ id: string }>('/api/conversations', { method: 'POST' }),
  messages: (conversationId: string) =>
    api<{ messages: ChatMessage[] }>(`/api/conversations/${conversationId}/messages`),
  send: (payload: {
    conversationId?: string;
    message: string;
    mode: string;
    model?: string;
  }) => api<{ conversationId: string }>('/api/chat', { method: 'POST', body: JSON.stringify(payload) }),

  // models
  models: () => api<{ models: ModelOption[]; default: string }>('/api/models'),

  // integrations
  integrationStatus: () =>
    api<{ configured: boolean; ok?: boolean; message?: string }>('/api/integrations/status'),
  applications: (q?: string) =>
    api<{ applications: ToolkitSummary[] }>(`/api/integrations/applications${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  application: (slug: string) =>
    api<{
      application: ToolkitSummary;
      flow: ConnectionFlowSpec | null;
      accounts: ConnectedAccount[];
      actions: ActionSummary[];
    }>(`/api/integrations/applications/${slug}`),
  connect: (slug: string, payload: { authConfigId?: string; fields?: Record<string, string> } | {}) =>
    api<{ redirectUrl?: string; status: string; connectedAccount?: ConnectedAccount }>(
      `/api/integrations/applications/${slug}/connect`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  disconnect: (accountId: string) =>
    api<void>(`/api/integrations/accounts/${accountId}`, { method: 'DELETE' }),
  accounts: () => api<{ accounts: ConnectedAccount[] }>('/api/integrations/accounts'),
  activity: () => api<{ activity: IntegrationActivityRecord[] }>('/api/integrations/activity'),

  // approvals
  pendingApprovals: () => api<{ approvals: ApprovalRequest[] }>('/api/approvals/pending'),
  decideApproval: (id: string, decision: 'approve_once' | 'always' | 'deny') =>
    api<{ ok: boolean }>(`/api/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  // tasks
  tasks: () => api<{ tasks: TaskSummary[] }>('/api/tasks'),

  // schedules
  schedules: () => api<{ schedules: ScheduleSummary[] }>('/api/schedules'),
  createSchedule: (payload: {
    name: string;
    cron: string;
    timezone?: string;
    prompt: string;
    mode?: string;
    enabled?: boolean;
  }) => api<{ id: string }>('/api/schedules', { method: 'POST', body: JSON.stringify(payload) }),
  toggleSchedule: (id: string, enabled: boolean) =>
    api<{ ok: boolean }>(`/api/schedules/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  deleteSchedule: (id: string) => api<void>(`/api/schedules/${id}`, { method: 'DELETE' }),

  // memory
  memories: () => api<{ memories: MemoryRecord[] }>('/api/memory'),
  addMemory: (content: string, kind?: string) =>
    api<{ id: string }>('/api/memory', { method: 'POST', body: JSON.stringify({ content, kind }) }),
  deleteMemory: (id: string) => api<void>(`/api/memory/${id}`, { method: 'DELETE' }),
};
