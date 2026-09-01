-- CloudBrain V3 — D1 schema
-- Relational product data. Secrets are NEVER stored here (BYOK keys live in
-- Worker secrets; Composio stores user credentials server-side).
-- Identity is Cloudflare Access — no local passwords or session tables.

-- ── Users (auto-provisioned from Access JWT on first visit) ─────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Projects ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,                       -- per-project agent instructions
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'text/plain',
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,                    -- objects live in R2 under this key
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, path)
);

-- ── Chat ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  model TEXT,
  branch TEXT NOT NULL DEFAULT 'main',
  activity TEXT,                            -- JSON: tool calls / plan / steps
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- ── Tasks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'quick' CHECK (mode IN ('quick','agent','deep')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_approval','blocked','failed','completed','cancelled')),
  plan TEXT,                                -- JSON plan
  progress TEXT,                            -- JSON step results
  error TEXT,
  assigned_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  summary TEXT NOT NULL,                    -- what the agent wants to do
  resource TEXT,                            -- what will change
  consequence TEXT,                         -- why it matters
  account_label TEXT,                       -- which connected account
  scope TEXT NOT NULL DEFAULT 'once',
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending','approved_once','always_allowed','denied')),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals(user_id, decision);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_scope_active
  ON approvals(user_id, tool_id, scope, decision) WHERE decision = 'always_allowed';

-- ── Integrations (Composio) ────────────────────────────────────────────
-- Local mirror of Composio state for fast UI queries + audit. The Composio
-- API remains the source of truth; rows carry the non-secret identifiers.
CREATE TABLE IF NOT EXISTS integration_accounts (
  id TEXT PRIMARY KEY,                      -- CloudBrain-local id (ulid-ish)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  composio_connected_account_id TEXT NOT NULL,
  toolkit_slug TEXT NOT NULL,
  auth_config_id TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_CONNECTED'
    CHECK (status IN ('NOT_CONNECTED','CONNECTING','CONNECTED','EXPIRED','REAUTH_REQUIRED','ERROR','DISCONNECTED','PENDING_APPROVAL','UNKNOWN')),
  label TEXT,                               -- user-facing alias
  owner_scope TEXT NOT NULL DEFAULT 'user', -- 'user' | 'workspace'
  last_used_at TEXT,
  last_validated_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, composio_connected_account_id)
);
CREATE INDEX IF NOT EXISTS idx_int_accounts_user ON integration_accounts(user_id, toolkit_slug);

CREATE TABLE IF NOT EXISTS integration_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT,
  toolkit_slug TEXT NOT NULL,
  action_slug TEXT NOT NULL,
  account_id TEXT,
  account_label TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','awaiting_approval')),
  input_summary TEXT,                       -- redacted JSON
  output_summary TEXT,                      -- redacted JSON
  error TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_int_activity_user ON integration_activity(user_id, created_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,                   -- cryptographically random
  user_id TEXT NOT NULL,
  toolkit_slug TEXT NOT NULL,
  connected_account_ref TEXT,               -- composio connection request id
  redirect_after TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- ── Schedules / automations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  prompt TEXT NOT NULL,                      -- agent instructions for the run
  mode TEXT NOT NULL DEFAULT 'agent',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id, enabled);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  task_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

-- ── Artifacts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT,
  kind TEXT NOT NULL DEFAULT 'file',
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'text/plain',
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artifacts_user ON artifacts(user_id, created_at);

-- ── Memory ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'long_term'
    CHECK (kind IN ('working','session','long_term','project','episodic','semantic')),
  content TEXT NOT NULL,
  source TEXT,
  confidence REAL NOT NULL DEFAULT 0.8,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, kind);

-- ── Audit ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,                               -- redacted JSON
  task_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);
