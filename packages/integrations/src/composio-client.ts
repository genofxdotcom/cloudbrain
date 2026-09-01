import type { AuthMethod, AuthFieldSpec, ConnectionFlowSpec } from '@cloudbrain/shared';

/**
 * Normalized Composio v3 REST client.
 *
 * Design notes (verified against ComposioHQ/composio `next` — @composio/client):
 *  - Base URL: https://backend.composio.dev  (API under /api/v3)
 *  - Auth: `x-api-key` header with the operator's BYOK key.
 *  - Toolkits:        GET /api/v3/toolkits            (list, filters: category, cursor, limit, sort_by)
 *                     GET /api/v3/toolkits/{slug}
 *  - Auth configs:    GET /api/v3/auth_configs?toolkit_slug=...
 *  - Connected accts: GET /api/v3/connected_accounts?toolkit_slugs=&user_ids=&statuses=
 *                     POST /api/v3/connected_accounts (initiate; OAuth + API_KEY/BASIC config)
 *                     GET  /api/v3/connected_accounts/{id}
 *                     POST /api/v3/connected_accounts/{id}/refresh
 *                     DELETE /api/v3/connected_accounts/{id}
 *  - Tools:           GET  /api/v3/tools?toolkits=...&search=...&limit=
 *                     GET  /api/v3/tools/{slug}
 *                     POST /api/v3/tools/execute { tool_slug, arguments, user_id, connected_account_id }
 *  - Statuses:        INITIALIZING | INITIATED | ACTIVE | FAILED | EXPIRED | INACTIVE | REVOKED
 *
 * We speak REST directly (fetch) instead of importing the SDK because the SDK
 * targets Node and CloudBrain runs on Workers; REST is the stable wire format
 * the SDK itself uses. All Composio access in CloudBrain is funnelled through
 * this file — nothing else may import Composio details.
 */

export const COMPOSIO_BASE_URL = 'https://backend.composio.dev';
const API_V3 = `${COMPOSIO_BASE_URL}/api/v3`;

export interface ComposioClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ComposioRestClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ComposioClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? API_V3).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { query?: Record<string, string | string[] | undefined>; body?: unknown; timeoutMs?: number }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(opts?.query ?? {})) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method,
        headers: {
          'x-api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      const { ComposioError } = await import('./errors.js');
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ComposioError('timeout', 'Composio request timed out.');
      }
      throw new ComposioError('provider', 'Could not reach Composio.', { cause: err });
    }
    clearTimeout(timeout);

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const { toComposioError } = await import('./errors.js');
      throw toComposioError(res.status, bodyText);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ── Toolkits (applications) ─────────────────────────────────────────────
  listToolkits(params?: { category?: string; limit?: number; cursor?: string }): Promise<ToolkitsPage> {
    return this.request('GET', '/toolkits', {
      query: {
        category: params?.category,
        limit: params?.limit?.toString(),
        cursor: params?.cursor,
        sort_by: 'usage',
      },
    });
  }

  getToolkit(slug: string): Promise<Toolkit> {
    return this.request('GET', `/toolkits/${encodeURIComponent(slug)}`);
  }

  listToolkitCategories(): Promise<{ items: { id: string; name: string }[] }> {
    return this.request('GET', '/toolkits/categories');
  }

  // ── Auth configs (per-toolkit auth schemes) ─────────────────────────────
  listAuthConfigs(toolkitSlug?: string): Promise<AuthConfigsPage> {
    return this.request('GET', '/auth_configs', {
      query: { toolkit_slug: toolkitSlug, limit: '100' },
    });
  }

  getConnectedAccountInitiationFields(toolkitSlug: string, authScheme: string): Promise<InitiationFields> {
    return this.request(
      'GET',
      `/toolkits/${encodeURIComponent(toolkitSlug)}/connected_account/initiation_fields`,
      { query: { auth_scheme: authScheme } }
    );
  }

  // ── Connected accounts ──────────────────────────────────────────────────
  listConnectedAccounts(params?: {
    userIds?: string[];
    toolkitSlugs?: string[];
    statuses?: string[];
    limit?: number;
    cursor?: string;
  }): Promise<ConnectedAccountsPage> {
    return this.request('GET', '/connected_accounts', {
      query: {
        user_ids: params?.userIds,
        toolkit_slugs: params?.toolkitSlugs,
        statuses: params?.statuses,
        limit: params?.limit?.toString() ?? '100',
        cursor: params?.cursor,
      },
    });
  }

  getConnectedAccount(id: string): Promise<ConnectedAccountRaw> {
    return this.request('GET', `/connected_accounts/${encodeURIComponent(id)}`);
  }

  /**
   * Initiate a connection. For OAUTH2/OAUTH1 with no `config`, Composio returns
   * a redirect_url the browser must visit. For API_KEY/BASIC/BEARER_TOKEN pass
   * `config` with the user's credentials — Composio stores them server-side.
   */
  initiateConnectedAccount(params: {
    userId: string;
    authConfigId: string;
    callbackUrl?: string;
    config?: Record<string, unknown>;
    allowMultiple?: boolean;
  }): Promise<ConnectedAccountCreateResponse> {
    return this.request('POST', '/connected_accounts', {
      body: {
        auth_config: { id: params.authConfigId },
        connection: {
          callback_url: params.callbackUrl,
          user_id: params.userId,
          state: params.config,
        },
        ...(params.allowMultiple ? { allow_multiple: true } : {}),
      },
    });
  }

  deleteConnectedAccount(id: string): Promise<{ id: string }> {
    return this.request('DELETE', `/connected_accounts/${encodeURIComponent(id)}`);
  }

  refreshConnectedAccount(id: string): Promise<ConnectedAccountRaw> {
    return this.request('POST', `/connected_accounts/${encodeURIComponent(id)}/refresh`);
  }

  // ── Tools (actions) ─────────────────────────────────────────────────────
  listTools(params?: {
    toolkits?: string[];
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ToolsPage> {
    return this.request('GET', '/tools', {
      query: {
        toolkits: params?.toolkits,
        search: params?.search,
        limit: params?.limit?.toString() ?? '50',
        cursor: params?.cursor,
      },
    });
  }

  getTool(slug: string): Promise<Tool> {
    return this.request('GET', `/tools/${encodeURIComponent(slug)}`);
  }

  /**
   * Execute a tool server-side. Composio resolves the user's connected
   * account from user_id; pass connected_account_id to pin a specific one.
   * Note: non-idempotent — we disable client-side retries upstream.
   */
  executeTool(params: {
    toolSlug: string;
    userId: string;
    args?: Record<string, unknown>;
    connectedAccountId?: string;
  }): Promise<ToolExecuteResponse> {
    return this.request('POST', '/tools/execute', {
      body: {
        tool_slug: params.toolSlug,
        arguments: params.args ?? {},
        user_id: params.userId,
        ...(params.connectedAccountId ? { connected_account_id: params.connectedAccountId } : {}),
      },
      timeoutMs: 120_000,
    });
  }
}

// ── Wire types (subset of Composio v3 responses we consume) ──────────────
export interface Toolkit {
  slug: string;
  name: string;
  description: string;
  categories?: string[];
  logo?: string;
  meta?: Record<string, unknown>;
}

export interface ToolkitsPage {
  items: Toolkit[];
  next_cursor?: string | null;
  total_pages?: number;
}

export interface AuthConfig {
  id: string;
  toolkit: { slug: string };
  auth_scheme: string;
  is_composio_managed?: boolean;
  is_disabled?: boolean;
  name?: string;
}

export interface AuthConfigsPage {
  items: AuthConfig[];
}

export interface InitiationFields {
  fields?: AuthFieldSpec[];
  expected_input_fields?: Record<string, unknown>;
}

export interface ConnectedAccountRaw {
  id: string;
  toolkit: { slug: string };
  auth_config?: { id: string };
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface ConnectedAccountsPage {
  items: ConnectedAccountRaw[];
  next_cursor?: string | null;
  total_pages?: number;
}

export interface ConnectedAccountCreateResponse {
  id: string;
  connectionData?: {
    val?: { status?: string; redirectUrl?: string | null };
  };
  redirectUrl?: string | null;
}

export interface Tool {
  slug: string;
  name: string;
  description: string;
  toolkit?: { slug: string; name?: string };
  input_parameters?: Record<string, unknown>;
  output_parameters?: Record<string, unknown>;
}

export interface ToolsPage {
  items: Tool[];
  next_cursor?: string | null;
  total_pages?: number;
}

export interface ToolExecuteResponse {
  successful: boolean;
  data?: unknown;
  error?: string | null;
  log_id?: string;
}

// ── Status normalization ─────────────────────────────────────────────────
export function normalizeStatus(raw: string | undefined): string {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'CONNECTED';
    case 'INITIALIZING':
    case 'INITIATED':
      return 'CONNECTING';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'FAILED':
      return 'ERROR';
    case 'INACTIVE':
    case 'REVOKED':
      return 'DISCONNECTED';
    case '':
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

// ── Auth-method normalization ────────────────────────────────────────────
export function normalizeAuthScheme(raw: string | undefined): AuthMethod {
  switch ((raw ?? '').toUpperCase()) {
    case 'OAUTH2':
      return 'OAUTH2';
    case 'OAUTH1':
      return 'OAUTH1';
    case 'API_KEY':
      return 'API_KEY';
    case 'BASIC':
      return 'BASIC';
    case 'BEARER_TOKEN':
      return 'BEARER_TOKEN';
    case 'NO_AUTH':
      return 'NO_AUTH';
    case 'COMPOSIO_LINK':
      return 'COMPOSIO_LINK';
    default:
      return 'CUSTOM';
  }
}

/**
 * Build the connection-flow spec the UI renders. This is the only place that
 * maps Composio auth metadata to CloudBrain's normalized model — the UI never
 * hardcodes "connect with OAuth".
 */
export function buildConnectionFlow(
  scheme: AuthMethod,
  isComposioManaged: boolean,
  fields: AuthFieldSpec[] | undefined
): ConnectionFlowSpec {
  switch (scheme) {
    case 'OAUTH2':
    case 'OAUTH1':
      return {
        method: scheme,
        requiresUserInput: false,
        fields: [],
        isComposioManaged: isComposioManaged,
      };
    case 'API_KEY':
      return {
        method: 'API_KEY',
        requiresUserInput: true,
        fields: fields?.length
          ? fields
          : [{ name: 'api_key', label: 'API key', type: 'secret', required: true }],
        isComposioManaged: false,
      };
    case 'BASIC':
      return {
        method: 'BASIC',
        requiresUserInput: true,
        fields: fields?.length
          ? fields
          : [
              { name: 'username', label: 'Username', type: 'string', required: true },
              { name: 'password', label: 'Password', type: 'secret', required: true },
            ],
        isComposioManaged: false,
      };
    case 'BEARER_TOKEN':
      return {
        method: 'BEARER_TOKEN',
        requiresUserInput: true,
        fields: fields?.length
          ? fields
          : [{ name: 'token', label: 'Access token', type: 'secret', required: true }],
        isComposioManaged: false,
      };
    case 'NO_AUTH':
      return {
        method: 'NO_AUTH',
        requiresUserInput: false,
        fields: [],
        isComposioManaged: false,
      };
    case 'COMPOSIO_LINK':
      return {
        method: 'COMPOSIO_LINK',
        requiresUserInput: false,
        fields: [],
        isComposioManaged: true,
      };
    default:
      return {
        method: scheme,
        requiresUserInput: true,
        fields: fields ?? [],
        isComposioManaged: false,
      };
  }
}
