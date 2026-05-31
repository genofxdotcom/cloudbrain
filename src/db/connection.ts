import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { log } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

let db: SqlJsDatabase | null = null;
let dbFilePath: string = '';

export interface DBConfig {
  dbPath?: string; // SQLite file path
}

/**
 * Initialize SQLite database (embedded, no server required)
 * Uses sql.js (pure JS/WASM, no native bindings needed)
 * The DB file is stored at ~/.cloudbrain/cloudbrain.db
 */
export async function initDatabase(config?: DBConfig): Promise<SqlJsDatabase> {
  if (db) return db;

  try {
    const dbDir = config?.dbPath
      ? path.dirname(config.dbPath)
      : path.join(os.homedir(), '.cloudbrain');

    dbFilePath = config?.dbPath
      ? config.dbPath
      : path.join(dbDir, 'cloudbrain.db');

    // Create directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Initialize sql.js
    const SQL = await initSqlJs();

    // Load existing DB file or create new one
    if (fs.existsSync(dbFilePath)) {
      const buffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    log.success('DB', `SQLite connected: ${dbFilePath}`);

    // Run migrations
    runMigrations(db);

    // Save after migrations
    saveDatabase();

    return db;
  } catch (error) {
    log.error('DB', 'Failed to initialize database', error);
    throw error;
  }
}

function saveDatabase() {
  if (!db || !dbFilePath) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbFilePath, buffer);
}

function runMigrations(database: SqlJsDatabase) {
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_user_channel ON conversations(user_id, channel)`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at)`,
      `CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        importance INTEGER DEFAULT 5,
        tags TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)`,
      `CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        action TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        channel TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_run TEXT,
        next_run TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active)`,
      `CREATE TABLE IF NOT EXISTS task_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed')),
        result TEXT,
        error TEXT,
        duration_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_task_log_task ON task_log(task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_log_status ON task_log(status)`,
      `CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        policy TEXT NOT NULL DEFAULT 'ask' CHECK(policy IN ('ask', 'always_approve', 'always_deny')),
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, operation)
      )`,
      `CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, category, key)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(user_id)`,
      `CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        models TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS user_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        fact TEXT NOT NULL,
        source TEXT DEFAULT 'conversation',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_user_facts_user ON user_facts(user_id)`,
    ];

    for (const stmt of statements) {
      try {
        database.run(stmt);
      } catch (err: any) {
        if (!err.message?.includes('already exists')) {
          log.warn('DB', `Migration warning: ${err.message}`);
        }
      }
    }

    log.success('DB', 'Database schema ready');
  } catch (error) {
    log.error('DB', 'Migration error', error);
  }
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Run initDatabase() first.');
  return db;
}

/**
 * Execute a query and return rows.
 * Supports both SELECT (returns rows) and INSERT/UPDATE/DELETE (returns result info).
 */
export async function query(sql: string, params?: any[]): Promise<any> {
  const database = getDb();

  // Normalize params
  const normalizedParams = (params || []).map(p => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });

  // Convert MySQL-specific syntax to SQLite
  let sqliteSQL = convertToSQLite(sql);

  const trimmed = sqliteSQL.trim().toUpperCase();

  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    const stmt = database.prepare(sqliteSQL);
    if (normalizedParams.length > 0) {
      stmt.bind(normalizedParams);
    }
    const rows: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
    }
    stmt.free();
    return rows;
  } else {
    database.run(sqliteSQL, normalizedParams);
    const changes = database.getRowsModified();
    // Persist to disk after writes
    saveDatabase();
    return { affectedRows: changes, insertId: 0 };
  }
}

/**
 * Convert common MySQL-specific SQL to SQLite-compatible SQL
 */
function convertToSQLite(sql: string): string {
  let result = sql;

  // Handle INSERT ... ON DUPLICATE KEY UPDATE -> INSERT OR REPLACE
  const onDuplicateMatch = result.match(/INSERT\s+INTO\s+(.+?)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)\s*ON\s+DUPLICATE\s+KEY\s+UPDATE\s+.+/is);
  if (onDuplicateMatch) {
    const table = onDuplicateMatch[1].trim();
    const cols = onDuplicateMatch[2].trim();
    const vals = onDuplicateMatch[3].trim();
    result = `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${vals})`;
  }

  // NOW() -> datetime('now')
  result = result.replace(/\bNOW\(\)/gi, "datetime('now')");

  // BOOLEAN TRUE/FALSE
  result = result.replace(/\bTRUE\b/gi, '1');
  result = result.replace(/\bFALSE\b/gi, '0');

  return result;
}

// Keep backward-compatible exports
export function getPool(): any {
  return getDb();
}

export async function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    log.info('DB', 'Database connection closed');
  }
}
