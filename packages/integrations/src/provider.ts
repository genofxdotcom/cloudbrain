/**
 * Server-only Composio provider — the Integration Gateway.
 *
 * CloudBrain's entity mapping decision (documented):
 *   Connections belong to a CLOUDFRAIN USER. Composio userId is derived as
 *   `cb-{cloudbrainUserId}` — stable, non-secret, collision-resistant, and
 *   scoped per user so no user can ever see or use another user's accounts.
 *   If organizations/workspaces are added later, the mapping becomes
 *   `cb-ws{workspaceId}-u{userId}` and this is the only file to change.
 *
 * Everything above this layer deals in normalized types from @cloudbrain/shared.
 * Nothing outside packages/integrations may import composio-client.ts.
 */

import type {
  ActionSummary,
  AuthFieldSpec,
  ConnectedAccount,
  ConnectionFlowSpec,
  IntegrationActivityRecord,
  ToolkitSummary,
} from '@cloudbrain/shared';
import {
  ComposioRestClient,
  buildConnectionFlow,
  normalizeAuthScheme,
  normalizeStatus,
  type ConnectedAccountRaw,
  type Toolkit,
} from './composio-client.js';
import { ComposioError } from './errors.js';

export interface ComposioEnv {
  COMPOSIO_API_KEY?: string;
}

/** Deterministic, non-secret Composio entity id for a CloudBrain user. */
export function composioUserIdFor(cloudbrainUserId: string): string {
  return `cb-${cloudbrainUserId}`;
}

export class IntegrationProvider {
  private client: ComposioRestClient | null = null;

  constructor(private readonly env: ComposioEnv) {}

  /** BYOK status — the UI shows an operator-configuration state when false. */
  get isConfigured(): boolean {
    return Boolean(this.env.COMPOSIO_API_KEY);
  }

  private requireClient(): ComposioRestClient {
    if (!this.env.COMPOSIO_API_KEY) {
      throw new ComposioError(
        'not_configured',
        'Composio is not configured. The operator must set the COMPOSIO_API_KEY secret.'
      );
    }
    if (!this.client) {
      this.client = new ComposioRestClient({ apiKey: this.env.COMPOSIO_API_KEY });
    }
    return this.client;
  }

  // ── Application discovery ───────────────────────────────────────────────
  async listApplications(category?: string, limit = 100): Promise<ToolkitSummary[]> {
    const page = await this.requireClient().listToolkits({ category, limit });
    return page.items.map((t) => this.toToolkitSummary(t));
  }

  async searchApplications(query: string, limit = 30): Promise<ToolkitSummary[]> {
    // Composio v3 toolkits list has no q param; filter client-side over a page.
    const page = await this.requireClient().listToolkits({ limit: 300 });
    const q = query.toLowerCase();
    return page.items
      .filter(
        (t) =>
          t.slug.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      )
      .slice(0, limit)
      .map((t) => this.toToolkitSummary(t));
  }

  async getApplication(slug: string): Promise<ToolkitSummary> {
    const toolkit = await this.requireClient().getToolkit(slug);
    return this.toToolkitSummary(toolkit);
  }

  private toToolkitSummary(t: Toolkit): ToolkitSummary {
    const schemes = Array.isArray(t.meta?.['auth_schemes'])
      ? (t.meta?.['auth_schemes'] as string[])
      : [];
    return {
      slug: t.slug,
      name: t.name,
      description: t.description ?? '',
      category: t.categories?.[0],
      logoUrl: typeof t.logo === 'string' ? t.logo : undefined,
      authSchemes: schemes.length
        ? schemes.map(normalizeAuthScheme)
        : [normalizeAuthScheme(undefined)],
      connectionStatus: 'NOT_CONNECTED',
      connectedAccountCount: 0,
    };
  }

  // ── Connection flows ────────────────────────────────────────────────────
  async getConnectionFlow(toolkitSlug: string): Promise<ConnectionFlowSpec> {
    const client = this.requireClient();
    const configs = await client.listAuthConfigs(toolkitSlug);
    const usable = configs.items.filter((c) => !c.is_disabled && c.toolkit?.slug === toolkitSlug);

    // Prefer Composio-managed OAuth when available; otherwise first usable config.
    const preferred =
      usable.find(
        (c) =>
          c.is_composio_managed === true &&
          ['OAUTH2', 'OAUTH1', 'COMPOSIO_LINK'].includes(c.auth_scheme?.toUpperCase() ?? '')
      ) ?? usable[0];

    if (!preferred) {
      // Toolkit may require no auth at all.
      const toolkit = await client.getToolkit(toolkitSlug);
      const schemes = Array.isArray(toolkit.meta?.['auth_schemes'])
        ? (toolkit.meta?.['auth_schemes'] as string[])
        : [];
      if (schemes.map(normalizeAuthScheme).includes('NO_AUTH')) {
        return buildConnectionFlow('NO_AUTH', false, undefined);
      }
      throw new ComposioError(
        'connection',
        `No usable auth configuration exists for "${toolkitSlug}". The operator must create one in the Composio dashboard.`
      );
    }

    const method = normalizeAuthScheme(preferred.auth_scheme);
    let fields: AuthFieldSpec[] | undefined;
    if (['API_KEY', 'BASIC', 'BEARER_TOKEN', 'CUSTOM'].includes(method)) {
      try {
        const init = await client.getConnectedAccountInitiationFields(toolkitSlug, preferred.auth_scheme);
        fields = this.normalizeFields(init);
      } catch {
        fields = undefined; // buildConnectionFlow provides sensible defaults
      }
    }
    return buildConnectionFlow(method, preferred.is_composio_managed === true, fields);
  }

  private normalizeFields(init: { fields?: unknown; expected_input_fields?: unknown }): AuthFieldSpec[] {
    const raw = Array.isArray(init.fields)
      ? init.fields
      : Object.entries((init.expected_input_fields as Record<string, unknown>) ?? {}).map(
          ([name, v]) => ({ name, ...(typeof v === 'object' && v ? v : {}) })
        );
    return (raw as Record<string, unknown>[])
      .map((f) => ({
        name: String(f['name'] ?? ''),
        label: String(f['display_name'] ?? f['label'] ?? f['name'] ?? ''),
        type: f['expected_type'] === 'secret' || /secret|password|token|key/i.test(String(f['name'] ?? ''))
          ? ('secret' as const)
          : ('string' as const),
        required: f['required'] !== false,
        description: typeof f['description'] === 'string' ? f['description'] : undefined,
      }))
      .filter((f) => f.name.length > 0);
  }

  // ── Connected accounts (scoped per CloudBrain user) ─────────────────────
  async listConnectedAccounts(cloudbrainUserId: string): Promise<ConnectedAccount[]> {
    const page = await this.requireClient().listConnectedAccounts({
      userIds: [composioUserIdFor(cloudbrainUserId)],
      limit: 200,
    });
    return page.items.map((a) => this.toConnectedAccount(a));
  }

  async listConnectedAccountsForToolkit(cloudbrainUserId: string, toolkitSlug: string): Promise<ConnectedAccount[]> {
    const page = await this.requireClient().listConnectedAccounts({
      userIds: [composioUserIdFor(cloudbrainUserId)],
      toolkitSlugs: [toolkitSlug],
      limit: 50,
    });
    return page.items.map((a) => this.toConnectedAccount(a));
  }

  private toConnectedAccount(a: ConnectedAccountRaw): ConnectedAccount {
    return {
      id: a.id, // use the Composio nanoid as the local id — non-secret, stable
      composioId: a.id,
      toolkitSlug: a.toolkit?.slug ?? 'unknown',
      status: normalizeStatus(a.status) as ConnectedAccount['status'],
      label: null,
      lastUsedAt: a.updated_at ?? null,
      expiresAt: null,
      createdAt: a.created_at ?? new Date().toISOString(),
    };
  }

  /**
   * Start a connection. Returns either a redirect URL (OAuth) or a completed
   * account (API key flows validate synchronously at Composio).
   */
  async startConnection(params: {
    cloudbrainUserId: string;
    toolkitSlug: string;
    authConfigId: string;
    fields?: Record<string, string>;
    callbackUrl?: string;
  }): Promise<{ connectedAccount?: ConnectedAccount; redirectUrl?: string; status: string }> {
    const client = this.requireClient();

    // Map user-supplied fields to Composio's expected connection state.
    let config: Record<string, unknown> | undefined;
    if (params.fields && Object.keys(params.fields).length > 0) {
      // Detect the single-secret shape (api_key / token) vs basic auth.
      if ('username' in params.fields || 'password' in params.fields) {
        config = {
          auth_scheme: 'BASIC',
          val: {
            username: params.fields['username'] ?? '',
            password: params.fields['password'] ?? '',
          },
        };
      } else {
        const firstSecret = Object.entries(params.fields)[0];
        if (!firstSecret) throw new ComposioError('validation', 'Missing credential fields.');
        const keyName = ['api_key', 'token', 'access_token', 'personal_token'].includes(firstSecret[0])
          ? firstSecret[0]
          : 'generic_api_key';
        config = { auth_scheme: 'API_KEY', val: { [keyName]: firstSecret[1] } };
      }
    }

    const res = await client.initiateConnectedAccount({
      userId: composioUserIdFor(params.cloudbrainUserId),
      authConfigId: params.authConfigId,
      callbackUrl: params.callbackUrl,
      config,
      allowMultiple: true,
    });

    const status = normalizeStatus(res.connectionData?.val?.status ?? 'INITIATED');
    const redirectUrl = res.redirectUrl ?? res.connectionData?.val?.redirectUrl ?? undefined;
    if (status === 'CONNECTED') {
      const account = await client.getConnectedAccount(res.id);
      return { connectedAccount: this.toConnectedAccount(account), status };
    }
    return {
      redirectUrl,
      status: status === 'UNKNOWN' ? 'CONNECTING' : status,
    };
  }

  /** Poll a connection request until ACTIVE/FAILED (server-side, bounded). */
  async waitForConnection(composioConnectedAccountId: string, timeoutMs = 60_000): Promise<ConnectedAccount> {
    const client = this.requireClient();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const account = await client.getConnectedAccount(composioConnectedAccountId);
      const status = normalizeStatus(account.status);
      if (status === 'CONNECTED') return this.toConnectedAccount(account);
      if (status === 'ERROR' || status === 'DISCONNECTED') {
        throw new ComposioError('connection', `Connection ended with status ${account.status}.`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new ComposioError('timeout', 'Connection was not completed in time. Check Integrations for status.');
  }

  async disconnect(cloudbrainUserId: string, composioConnectedAccountId: string): Promise<void> {
    // Ownership check first: the id must belong to this user's Composio entity.
    const accounts = await this.listConnectedAccounts(cloudbrainUserId);
    if (!accounts.some((a) => a.composioId === composioConnectedAccountId)) {
      throw new ComposioError('connection', 'Connected account not found for this user.');
    }
    await this.requireClient().deleteConnectedAccount(composioConnectedAccountId);
  }

  // ── Action discovery (progressive — never dump the whole catalog) ───────
  async listActions(toolkitSlug: string, limit = 50): Promise<ActionSummary[]> {
    const page = await this.requireClient().listTools({ toolkits: [toolkitSlug], limit });
    return page.items.map((t) => this.toActionSummary(t));
  }

  async searchActions(query: string, opts?: { toolkits?: string[]; limit?: number }): Promise<ActionSummary[]> {
    const page = await this.requireClient().listTools({
      search: query,
      toolkits: opts?.toolkits,
      limit: opts?.limit ?? 20,
    });
    return page.items.map((t) => this.toActionSummary(t));
  }

  async getActionSchema(toolSlug: string): Promise<ActionSummary> {
    const tool = await this.requireClient().getTool(toolSlug);
    return this.toActionSummary(tool);
  }

  private toActionSummary(t: {
    slug: string;
    name: string;
    description: string;
    toolkit?: { slug: string };
    input_parameters?: Record<string, unknown>;
  }): ActionSummary {
    return {
      slug: t.slug,
      name: t.name,
      description: t.description ?? '',
      toolkitSlug: t.toolkit?.slug ?? 'unknown',
      riskLevel: classifyRisk(t.slug),
      requiresConnection: true,
      inputSchema: t.input_parameters ?? {},
    };
  }

  // ── Action execution (the gateway) ──────────────────────────────────────
  async executeAction(params: {
    cloudbrainUserId: string;
    toolSlug: string;
    args: Record<string, unknown>;
    connectedAccountId?: string;
  }): Promise<{ successful: boolean; data?: unknown; error?: string | null; logId?: string }> {
    // If an account is pinned, verify it belongs to this user before executing.
    if (params.connectedAccountId) {
      const accounts = await this.listConnectedAccounts(params.cloudbrainUserId);
      if (!accounts.some((a) => a.composioId === params.connectedAccountId)) {
        throw new ComposioError('connection', 'Connected account not found for this user.');
      }
    }
    return this.requireClient().executeTool({
      toolSlug: params.toolSlug,
      userId: composioUserIdFor(params.cloudbrainUserId),
      args: params.args,
      connectedAccountId: params.connectedAccountId,
    });
  }

  /** Readiness check for the integrations overview. */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured) {
      return { ok: false, message: 'COMPOSIO_API_KEY secret is not set on this deployment.' };
    }
    try {
      await this.requireClient().listToolkits({ limit: 1 });
      return { ok: true, message: 'Composio connection healthy.' };
    } catch (err) {
      const msg = err instanceof ComposioError ? err.message : 'Composio health check failed.';
      return { ok: false, message: msg };
    }
  }
}

/**
 * Conservative risk classification from the action slug alone. Composio does
 * not expose a risk field; write-ish verbs get elevated risk and require
 * approval per CloudBrain policy.
 */
export function classifyRisk(slug: string): ActionSummary['riskLevel'] {
  const s = slug.toUpperCase();
  if (/(^|_)(DELETE|REMOVE|DROP|REVOKE|DESTROY|CANCEL)(_|$)/.test(s)) return 'destructive';
  if (/(^|_)(CREATE|POST|SEND|UPDATE|PATCH|PUT|REPLY|INVITE|MERGE|ADD|WRITE|MOVE|ARCHIVE|UPLOAD|DEPLOY|SUBMIT|PAY|TRANSFER|MODIFY)(_|$)/.test(s))
    return 'write';
  if (/(^|_)(MAIL|MESSAGE|SLACK|EMAIL|NOTIFY|TWEET|POST_TO)(_|$)/.test(s)) return 'external';
  if (/(^|_)(SECRET|CREDENTIAL|PASSWORD|KEY|BILLING|ADMIN|SETTINGS|PERMISSION)(_|$)/.test(s)) return 'sensitive';
  if (/(^|_)(GET|FETCH|LIST|SEARCH|READ|FIND|RETRIEVE)(_|$)/.test(s)) return 'read';
  return 'safe';
}

// Re-exports for the single import surface.
export { ComposioError } from './errors.js';
export type { IntegrationActivityRecord };
