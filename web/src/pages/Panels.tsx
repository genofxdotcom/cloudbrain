import React, { useCallback, useEffect, useState } from 'react';
import type { MemoryRecord, ScheduleSummary } from '@cloudbrain/shared';
import { apiClient } from '../api';
import { useUser } from '../userContext';

// ── Automations (schedules) ───────────────────────────────────────────────
export function AutomationsPage(): React.ReactElement {
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [form, setForm] = useState({ name: '', cron: '0 9 * * *', prompt: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { schedules: s } = await apiClient.schedules();
    setSchedules(s);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setError('');
    try {
      await apiClient.createSchedule({ ...form, mode: 'agent', timezone: 'UTC', enabled: true });
      setForm({ name: '', cron: '0 9 * * *', prompt: '' });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed.');
    }
  };

  return (
    <div className="page-body">
      <div className="card">
        <h3>New automation</h3>
        <p className="small muted">
          Runs the agent on a cron schedule. The run executes with your connected tools and integrations, and its
          activity is visible in Chat.
        </p>
        <div className="stack" style={{ maxWidth: 560 }}>
          <input
            className="input"
            placeholder="Name, e.g. Morning digest"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="input mono"
            placeholder="Cron, e.g. 0 9 * * *"
            value={form.cron}
            onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
          />
          <textarea
            className="textarea"
            rows={3}
            placeholder="Instructions for the agent each run…"
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          />
          {error && <div className="danger-text small">{error}</div>}
          <div>
            <button className="btn primary" disabled={!form.name || !form.prompt} onClick={() => void create()}>
              Create schedule
            </button>
          </div>
        </div>
      </div>

      {schedules.length > 0 && (
        <div className="card">
          <h3>Schedules</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Cron</th>
                <th>Status</th>
                <th>Last run</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="mono small">{s.cron}</td>
                  <td>
                    <span className="badge" data-status={s.enabled ? 'succeeded' : 'unknown'}>
                      {s.enabled ? 'enabled' : 'paused'}
                    </span>
                  </td>
                  <td className="small muted">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—'}</td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        await apiClient.toggleSchedule(s.id, !s.enabled).catch(() => undefined);
                        void load();
                      }}
                    >
                      {s.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      className="btn danger sm"
                      style={{ marginLeft: 6 }}
                      onClick={async () => {
                        await apiClient.deleteSchedule(s.id).catch(() => undefined);
                        void load();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Memory ────────────────────────────────────────────────────────────────
export function MemoryPage(): React.ReactElement {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [content, setContent] = useState('');
  const user = useUser();

  const load = useCallback(async () => {
    const { memories: m } = await apiClient.memories();
    setMemories(m);
  }, []);

  useEffect(() => {
    if (user.user) void load();
  }, [load, user.user]);

  const add = async () => {
    if (!content.trim()) return;
    await apiClient.addMemory(content, 'long_term').catch(() => undefined);
    setContent('');
    void load();
  };

  return (
    <div className="page-body">
      <div className="card">
        <h3>Long-term memory</h3>
        <p className="small muted">
          Facts the agent should always consider. Fully inspectable and deletable — the agent never stores provider
          secrets here. Retrieved by relevance, only the top entries enter any given prompt.
        </p>
        <div className="row" style={{ maxWidth: 640 }}>
          <input
            className="input"
            placeholder="e.g. My deploy branch is production"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="btn primary" onClick={() => void add()}>Add</button>
        </div>
      </div>

      {memories.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Memory</th>
                <th>Kind</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {memories.map((m) => (
                <tr key={m.id}>
                  <td>{m.content}</td>
                  <td><span className="badge">{m.kind}</span></td>
                  <td className="small muted">{new Date(m.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn danger sm"
                      onClick={async () => {
                        await apiClient.deleteMemory(m.id).catch(() => undefined);
                        void load();
                      }}
                    >
                      Forget
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Settings (models + deployment info) ───────────────────────────────────
interface ModelOption {
  id: string;
  provider: string;
  label: string;
  available: boolean;
  contextWindow?: number;
}

export function SettingsPage(): React.ReactElement {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState('');

  useEffect(() => {
    void apiClient
      .models()
      .then(({ models: m, default: d }) => {
        setModels(m);
        setDefaultModel(d);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="page-body">
      <div className="card">
        <h3>Models</h3>
        <p className="small muted">
          The default model (<code className="inline">{defaultModel || 'workers-ai'}</code>) runs on the Workers AI
          binding — zero configuration. Remote providers activate automatically when their operator secret is set.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Context</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td className="small muted">{m.provider}</td>
                <td className="small mono">{m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k` : '—'}</td>
                <td>
                  <span className="badge" data-status={m.available ? 'succeeded' : 'unknown'}>
                    {m.available ? 'available' : 'key not set'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Operator secrets</h3>
        <p className="small muted">Set via <code className="inline">wrangler secret put &lt;NAME&gt;</code>. Never stored in the database, never returned to the browser.</p>
        <table className="data-table">
          <thead>
            <tr><th>Secret</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            <tr><td className="mono small">AUTH_SECRET</td><td className="small">Session token derivation (required)</td></tr>
            <tr><td className="mono small">COMPOSIO_API_KEY</td><td className="small">Composio BYOK — enables integrations</td></tr>
            <tr><td className="mono small">OPENAI_API_KEY</td><td className="small">OpenAI models</td></tr>
            <tr><td className="mono small">ANTHROPIC_API_KEY</td><td className="small">Anthropic models</td></tr>
            <tr><td className="mono small">GEMINI_API_KEY</td><td className="small">Gemini models</td></tr>
            <tr><td className="mono small">GROQ_API_KEY</td><td className="small">Groq models</td></tr>
            <tr><td className="mono small">OPENROUTER_API_KEY</td><td className="small">OpenRouter models</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
