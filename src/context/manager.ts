import { query } from '../db/connection';
import { log } from '../utils/logger';

/**
 * Context Manager - conversation history, long-term memory, and learning system
 * 
 * The agent remembers:
 * - Recent conversations (short-term context for AI)
 * - Explicit memories ("remember that X")
 * - Learned preferences (automatically extracted from interactions)
 * - User facts (name, timezone, projects, etc.)
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

    // Auto-learn from user messages
    if (role === 'user') {
      await this.autoLearn(userId, content);
    }
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
    // Check for duplicates
    const existing = await query(
      'SELECT id FROM memories WHERE user_id = ? AND content = ?',
      [userId, content]
    );
    if (existing.length > 0) return;

    await query(
      'INSERT INTO memories (user_id, content, importance, tags) VALUES (?, ?, ?, ?)',
      [userId, content, importance, tags ? JSON.stringify(tags) : null]
    );
    log.info('MEMORY', `Stored for user ${userId}: ${content.substring(0, 60)}`);
  }

  /**
   * Recall memories
   */
  async recall(userId: string, limit: number = 10): Promise<string[]> {
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
      'SELECT content FROM memories WHERE user_id = ? AND content LIKE ? ORDER BY importance DESC LIMIT 10',
      [userId, `%${searchTerm}%`]
    );
    return rows.map((r: any) => r.content);
  }

  /**
   * Store a learned preference
   */
  async learnPreference(userId: string, category: string, key: string, value: string): Promise<void> {
    // Upsert preference
    await query(
      'INSERT OR REPLACE INTO user_preferences (user_id, category, key, value) VALUES (?, ?, ?, ?)',
      [userId, category, key, value]
    );
    log.info('LEARN', `Preference: ${userId} → ${category}/${key} = ${value}`);
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string, category?: string): Promise<Array<{ category: string; key: string; value: string }>> {
    if (category) {
      return await query(
        'SELECT category, key, value FROM user_preferences WHERE user_id = ? AND category = ?',
        [userId, category]
      );
    }
    return await query(
      'SELECT category, key, value FROM user_preferences WHERE user_id = ?',
      [userId]
    );
  }

  /**
   * Store a fact about the user
   */
  async learnFact(userId: string, fact: string, source: string = 'conversation'): Promise<void> {
    // Don't store duplicate facts
    const existing = await query(
      'SELECT id FROM user_facts WHERE user_id = ? AND fact = ?',
      [userId, fact]
    );
    if (existing.length > 0) return;

    await query(
      'INSERT INTO user_facts (user_id, fact, source) VALUES (?, ?, ?)',
      [userId, fact, source]
    );
    log.info('LEARN', `Fact about ${userId}: ${fact.substring(0, 60)}`);
  }

  /**
   * Get facts about user
   */
  async getFacts(userId: string): Promise<string[]> {
    const rows = await query(
      'SELECT fact FROM user_facts WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    return rows.map((r: any) => r.fact);
  }

  /**
   * Auto-learn from user messages (extract preferences, facts, patterns)
   */
  private async autoLearn(userId: string, message: string): Promise<void> {
    const lower = message.toLowerCase();

    // Extract explicit "remember" instructions
    if (lower.includes('remember that') || lower.includes('remember my') || lower.includes('remember i')) {
      const content = message.replace(/^.*?remember\s+(that\s+)?/i, '').trim();
      if (content.length > 3) {
        await this.remember(userId, content, 8, ['explicit']);
      }
    }

    // Extract "my name is" / "i am" patterns
    const nameMatch = message.match(/(?:my name is|i'?m|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      await this.learnFact(userId, `User's name is ${nameMatch[1]}`, 'self-introduction');
      await this.learnPreference(userId, 'identity', 'name', nameMatch[1]);
    }

    // Extract "I prefer" / "I like" / "I use" patterns
    const preferMatch = message.match(/i\s+(?:prefer|like|use|want|always use|usually use)\s+(.{3,60})/i);
    if (preferMatch) {
      await this.learnFact(userId, `User prefers: ${preferMatch[1]}`, 'stated-preference');
    }

    // Extract "I work on" / "my project" patterns
    const projectMatch = message.match(/(?:i work on|my project is|working on|building)\s+(.{3,60})/i);
    if (projectMatch) {
      await this.learnFact(userId, `Working on: ${projectMatch[1]}`, 'project-mention');
    }

    // Extract timezone mentions
    const tzMatch = message.match(/(?:my timezone is|i'?m in|my time zone is)\s+([\w/+-]+)/i);
    if (tzMatch) {
      await this.learnPreference(userId, 'locale', 'timezone', tzMatch[1]);
    }

    // Track interaction patterns
    await this.trackPattern(userId, message);
  }

  /**
   * Track usage patterns to learn what user does frequently
   */
  private async trackPattern(userId: string, message: string): Promise<void> {
    const lower = message.toLowerCase();

    // Track which commands/intents are used most
    const intents = [
      { pattern: /deploy|push|publish/i, intent: 'deployment' },
      { pattern: /search|find|look up/i, intent: 'search' },
      { pattern: /create|build|make/i, intent: 'creation' },
      { pattern: /list|show|status/i, intent: 'monitoring' },
      { pattern: /schedule|remind|every/i, intent: 'scheduling' },
      { pattern: /delete|remove|drop/i, intent: 'cleanup' },
    ];

    for (const { pattern, intent } of intents) {
      if (pattern.test(lower)) {
        // Increment usage counter in preferences
        const existing = await this.getPreferences(userId, 'usage_count');
        const current = existing.find(p => p.key === intent);
        const count = current ? parseInt(current.value) + 1 : 1;
        await this.learnPreference(userId, 'usage_count', intent, count.toString());
        break;
      }
    }
  }

  /**
   * Build full context string for AI (includes history + memories + facts + preferences)
   */
  async buildContext(userId: string, channel: string): Promise<string> {
    const history = await this.getHistory(userId, channel, 8);
    const memories = await this.recall(userId, 5);
    const facts = await this.getFacts(userId);
    const prefs = await this.getPreferences(userId);

    let context = '';

    // User identity & facts
    if (facts.length > 0) {
      context += 'What I know about this user:\n';
      facts.slice(0, 10).forEach(f => { context += `- ${f}\n`; });
      context += '\n';
    }

    // Preferences
    const identityPrefs = prefs.filter(p => p.category === 'identity' || p.category === 'locale');
    if (identityPrefs.length > 0) {
      identityPrefs.forEach(p => { context += `- ${p.key}: ${p.value}\n`; });
      context += '\n';
    }

    // Explicit memories
    if (memories.length > 0) {
      context += 'Things the user asked me to remember:\n';
      memories.forEach(m => { context += `- ${m}\n`; });
      context += '\n';
    }

    // Recent conversation
    if (history.length > 0) {
      context += 'Recent conversation:\n';
      history.forEach(h => { context += `${h.role}: ${h.content.substring(0, 300)}\n`; });
    }

    return context;
  }

  /**
   * Cleanup old conversations (keep last N per user)
   */
  async cleanup(maxPerUser: number = 100): Promise<number> {
    const result = await query(`
      DELETE FROM conversations WHERE id NOT IN (
        SELECT id FROM conversations ORDER BY created_at DESC LIMIT ?
      )
    `, [maxPerUser * 100]);
    return result.affectedRows || 0;
  }
}
