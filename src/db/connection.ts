import mysql from 'mysql2/promise';
import { log } from '../utils/logger';
import fs from 'fs';
import path from 'path';

let pool: mysql.Pool | null = null;

export interface DBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export async function initDatabase(config: DBConfig): Promise<mysql.Pool> {
  if (pool) return pool;

  try {
    // Fix IPv6 issue: Node.js may resolve 'localhost' to ::1 (IPv6) which MySQL often doesn't listen on
    const host = config.host === 'localhost' ? '127.0.0.1' : config.host;

    pool = mysql.createPool({
      host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Test connection
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    log.success('DB', 'MySQL connected successfully');

    // Run migrations
    await runMigrations(pool);

    return pool;
  } catch (error) {
    log.error('DB', 'Failed to connect to MySQL', error);
    throw error;
  }
}

async function runMigrations(pool: mysql.Pool) {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await pool.execute(statement);
      } catch (err: any) {
        // Ignore "already exists" errors
        if (!err.message?.includes('already exists')) {
          log.warn('DB', `Migration statement warning: ${err.message}`);
        }
      }
    }

    log.success('DB', 'Database schema ready');
  } catch (error) {
    log.error('DB', 'Migration error', error);
  }
}

export function getPool(): mysql.Pool {
  if (!pool) throw new Error('Database not initialized. Run initDatabase() first.');
  return pool;
}

export async function query(sql: string, params?: any[]): Promise<any> {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    log.info('DB', 'Database connection closed');
  }
}
