import { query } from '../db/connection';
import { log } from '../utils/logger';

/**
 * Context Manager - conversation history and long-term memory
 */
export class ContextManager {

  /**
   * Add message to conversation history
   */
  async addMessage(userId: string, channel: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    await query(
      'INSERT INTO conversations (user_id, channel, role, content) VALUES (?, ?, ?, ?)',
      [userId, channel, role, content]
    );
  }

  /**
   * Get recent conversation history for context
   */
  async getHistory(userId: string, channel: string, limit: number = 10): Promise<Array<{ role: string; content: string }>> {
    const rows = await query(
      'SELECT role, content FROM conversations WHERE user_id = ? AND channel = ? ORDER BY created_at DESC LIMIT ?',
      [userId, channel, limit]
    );
    return rows.reverse(); // Oldest first
  }

  /**
   * Store a long-term memory
   */
  async remember(userId: string, content: string, importance: number = 5, tags?: string[]): Promise<void> {
    await query(
      'INSERT INTO memories (user_id, content, importance, tags) VALUES (?, ?, ?, ?)',
      [userId, content, importance, tags ? JSON.stringify(tags) : null]
    );
    log.info('CONTEXT', `Memory stored for user ${userId}`);
  }

  /**
   * Recall memories
   */
  async recall(userId: string, limit: number = 5): Promise<string[]> {
    const rows = await query(
      'SELECT content FROM memories WHERE user_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows.map((r: any) => r.content);
  }

  /**
   * Search memories by content
   */
  async searchMemories(userId: string, searchTerm: string): Promise<string[]> {
    const rows = await query(
      'SELECT content FROM memories WHERE user_id = ? AND content LIKE ? ORDER BY importance DESC LIMIT 5',
      [userId, `%${searchTerm}%`]
    );
    return rows.map((r: any) => r.content);
  }

  /**
   * Build context string for AI (includes recent history + important memories)
   */
  async buildContext(userId: string, channel: string): Promise<string> {
    const history = await this.getHistory(userId, channel, 5);
    const memories = await this.recall(userId, 3);

    let context = '';
    if (memories.length > 0) {
      context += 'Important things I remember about this user:\n';
      memories.forEach(m => { context += `- ${m}\n`; });
      context += '\n';
    }
    if (history.length > 0) {
      context += 'Recent conversation:\n';
      history.forEach(h => { context += `${h.role}: ${h.content.substring(0, 200)}\n`; });
    }
    return context;
  }

  /**
   * Cleanup old conversations (keep last N per user)
   */
  async cleanup(maxPerUser: number = 100): Promise<number> {
    // Keep only most recent messages (SQLite compatible)
    const result = await query(`
      DELETE FROM conversations WHERE id NOT IN (
        SELECT id FROM conversations ORDER BY created_at DESC LIMIT ?
      )
    `, [maxPerUser * 100]); // rough limit
    return result.affectedRows || 0;
  }
}
