import Database from 'better-sqlite3';
import { log } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

let db: Database.Database | null = null;

export interface DBConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  dbPath?: string; // SQLite file path
}

/**
 * Initialize SQLite database (embedded, no server required)
 * The DB file is stored at ~/.cloudbrain/cloudbrain.db
 */
export async function initDatabase(config?: DBConfig): Promise<Database.Database> {
  if (db) return db;

  try {
    // Determine DB file location
    const dbDir = config?.dbPath
      ? path.dirname(config.dbPath)
      : path.join(os.homedir(), '.cloudbrain');

    const dbFile = config?.dbPath
      ? config.dbPath
      : path.join(dbDir, 'cloudbrain.db');

    // Create directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbFile);

    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    log.success('DB', `SQLite connected: ${dbFile}`);

    // Run migrations
    runMigrations(db);

    return db;
  } catch (error) {
    log.error('DB', 'Failed to initialize database', error);
    throw error;
  }
}

function runMigrations(database: Database.Database) {
  try {
    // SQLite-compatible schema
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
    ];

    for (const stmt of statements) {
      try {
        database.exec(stmt);
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

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Run initDatabase() first.');
  return db;
}

/**
 * Execute a query and return rows.
 * Supports both SELECT (returns rows) and INSERT/UPDATE/DELETE (returns result info).
 * Uses ? placeholders compatible with the existing codebase.
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
    return stmt.all(...normalizedParams);
  } else {
    const stmt = database.prepare(sqliteSQL);
    const result = stmt.run(...normalizedParams);
    return { affectedRows: result.changes, insertId: result.lastInsertRowid };
  }
}

/**
 * Convert common MySQL-specific SQL to SQLite-compatible SQL
 */
function convertToSQLite(sql: string): string {
  let result = sql;

  // Replace backtick-quoted identifiers (both work in SQLite, but just in case)
  // No change needed - SQLite supports backticks

  // Handle INSERT ... ON DUPLICATE KEY UPDATE -> INSERT OR REPLACE
  // This is the most common MySQL-ism in the codebase
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
    db.close();
    db = null;
    log.info('DB', 'Database connection closed');
  }
}
