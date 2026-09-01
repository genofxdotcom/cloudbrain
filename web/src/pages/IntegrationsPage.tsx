import React, { useCallback, useEffect, useState } from 'react';
import type {
  ActionSummary,
  ConnectedAccount,
  ConnectionFlowSpec,
  ToolkitSummary,
} from '@cloudbrain/shared';
import { apiClient } from '../api';

export function IntegrationsPage(): React.ReactElement {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [apps, setApps] = useState<ToolkitSummary[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [connectState, setConnectState] = useState<{ slug: string; url: string | null; status: string } | null>(null);

  const load = useCallback(async () => {
    const status = await apiClient.integrationStatus();
    setConfigured(status.configured);
    setStatusMessage(status.message ?? '');
    if (!status.configured) return;
    const [{ applications }, { accounts: acc }] = await Promise.all([
      apiClient.applications(),
      apiClient.accounts().catch(() => ({ accounts: [] })),
    ]);
    setApps(applications);
    setAccounts(acc);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      const { applications } = await apiClient.applications();
      setApps(applications);
      return;
    }
    const { applications } = await apiClient.applications(q);
    setApps(applications);
  }, []);

  if (configured === null) {
    return <div className="empty">Loading integrations…</div>;
  }

  // Operator hasn't set COMPOSIO_API_KEY — show configuration state, not a broken catalog.
  if (!configured) {
    return (
      <div className="page-body centered">
        <div className="card">
          <h3>Composio is not configured on this deployment</h3>
          <p>
            CloudBrain uses <a href="https://composio.dev" target="_blank" rel="noreferrer">Composio</a> as its
            integration provider (Bring-Your-Own-Key). The operator of this deployment must set the{' '}
            <code className="inline">COMPOSIO_API_KEY</code> secret to enable the integrations directory:
          </p>
          <pre style={{ background: 'var(--code-bg)', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
            npx wrangler secret put COMPOSIO_API_KEY
          </pre>
          {statusMessage && <p className="small muted">{statusMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="page-body">
      <div className="row between" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 360 }}
          placeholder="Search applications…"
          value={query}
          onChange={(e) => void search(e.target.value)}
        />
        <span className="small muted">{apps.length} applications</span>
      </div>

      {connectState && (
        <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 12 }}>
          <h3>Connection {connectState.status}</h3>
          {connectState.url ? (
            <p>
              Complete authorization in the provider window, then{' '}
              <button className="btn sm" onClick={() => window.location.reload()}>
                refresh
              </button>{' '}
              to see the connected account.
            </p>
          ) : (
            <p className="muted">Status: {connectState.status}</p>
          )}
        </div>
      )}

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="card">
          <h3>Connected accounts</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Status</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} data-status={a.status}>
                  <td className="mono">{a.toolkitSlug}</td>
                  <td>
                    <span className="badge">{a.status.toLowerCase()}</span>
                  </td>
                  <td className="small muted">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn danger sm"
                      onClick={async () => {
                        await apiClient.disconnect(a.id).catch(() => undefined);
                        void load();
                      }}
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Directory */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        {apps.map((app) => (
          <ApplicationCard key={app.slug} app={app} onOpen={() => setSelected(app.slug)} />
        ))}
      </div>

      {selected && (
        <ApplicationDetail
          slug={selected}
          onClose={() => setSelected(null)}
          onConnected={() => {
            setSelected(null);
            void load();
          }}
          onFlow={(url, status) => setConnectState({ slug: selected, url, status })}
        />
      )}
    </div>
  );
}

function ApplicationCard({ app, onOpen }: { app: ToolkitSummary; onOpen: () => void }): React.ReactElement {
  return (
    <div className="card" data-status={app.connectionStatus} style={{ cursor: 'pointer' }} onClick={onOpen}>
      <div className="row between">
        <strong style={{ fontSize: 13.5 }}>{app.name}</strong>
        {app.connectionStatus !== 'NOT_CONNECTED' && <span className="badge">{app.connectionStatus.toLowerCase()}</span>}
      </div>
      <p style={{ marginTop: 4, minHeight: 32 }}>{app.description.slice(0, 110)}{app.description.length > 110 ? '…' : ''}</p>
      <div className="row between">
        <span className="small muted">{app.category ?? 'app'}</span>
        <span className="small muted">{app.authSchemes.join(' · ').toLowerCase()}</span>
      </div>
    </div>
  );
}

function ApplicationDetail({
  slug,
  onClose,
  onConnected,
  onFlow,
}: {
  slug: string;
  onClose: () => void;
  onConnected: () => void;
  onFlow: (url: string | null, status: string) => void;
}): React.ReactElement {
  const [data, setData] = useState<Awaited<ReturnType<typeof apiClient.application>> | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiClient
      .application(slug)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between">
          <strong>{slug}</strong>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <p className="danger-text small" style={{ marginTop: 8 }}>{error}</p>
      </div>
    );
  }
  if (!data) return <div className="empty">Loading {slug}…</div>;

  const { application, flow, actions } = data;

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      if (flow?.requiresUserInput) {
        // Credential flow: find the auth config via the connect endpoint contract.
        // The server resolves the auth config for credential flows when fields are provided.
        const res = await apiClient.connect(slug, { fields });
        if (res.connectedAccount) onConnected();
        else onFlow(res.redirectUrl ?? null, res.status);
      } else {
        const res = await apiClient.connect(slug, {});
        if (res.redirectUrl) {
          window.open(res.redirectUrl, '_blank', 'noopener');
          onFlow(res.redirectUrl, 'CONNECTING');
        } else if (res.connectedAccount) {
          onConnected();
        } else {
          onFlow(null, res.status);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 12 }} data-status={application.connectionStatus}>
      <div className="row between">
        <div>
          <strong>{application.name}</strong>{' '}
          <span className="badge">{application.connectionStatus.toLowerCase()}</span>
        </div>
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>
      <p style={{ marginTop: 6 }}>{application.description}</p>
      <div className="small muted">Auth methods: {application.authSchemes.join(', ').toLowerCase()}</div>

      {/* Adaptive connect flow */}
      {flow && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {flow.requiresUserInput ? (
            <div className="stack">
              <strong className="small">
                Connect with {flow.method.replace('_', ' ').toLowerCase()} — credentials are sent to Composio over
                TLS and never stored by CloudBrain.
              </strong>
              {flow.fields.map((f) => (
                <label key={f.name} className="stack" style={{ gap: 2 }}>
                  <span className="small">
                    {f.label || f.name}
                    {f.required && ' *'}
                    {f.type === 'secret' && ' (secret)'}
                  </span>
                  <input
                    className="input"
                    type={f.type === 'secret' ? 'password' : 'text'}
                    autoComplete="off"
                    value={fields[f.name] ?? ''}
                    onChange={(e) => setFields((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  />
                </label>
              ))}
              <div>
                <button
                  className="btn primary"
                  disabled={busy || flow.fields.some((f) => f.required && !fields[f.name])}
                  onClick={() => void connect()}
                >
                  {busy ? 'Connecting…' : 'Connect account'}
                </button>
              </div>
            </div>
          ) : flow.method === 'NO_AUTH' ? (
            <p className="small muted">This application requires no user authentication — its actions work out of the box.</p>
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => void connect()}>
              {busy ? 'Starting…' : `Connect with ${flow.method.replace('OAUTH', 'OAuth ')}`}
            </button>
          )}
        </div>
      )}

      {/* Actions explorer */}
      <div style={{ marginTop: 14 }}>
        <strong className="small">Available actions ({actions.length})</strong>
        <table className="data-table" style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th>Action</th>
              <th>Risk</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {actions.slice(0, 25).map((a: ActionSummary) => (
              <tr key={a.slug}>
                <td className="mono small">{a.slug}</td>
                <td>
                  <span className="badge" data-status={a.riskLevel === 'read' || a.riskLevel === 'safe' ? 'succeeded' : a.riskLevel === 'write' ? 'running' : 'danger'}>
                    {a.riskLevel}
                  </span>
                </td>
                <td className="small">{a.description.slice(0, 140)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
