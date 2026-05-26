/**
 * Skills Manager - Now a thin pass-through layer
 * All actual logic is handled in index.ts executeUserRequest()
 * This file exists only for backward compatibility with imports
 */

import { ChannelManager } from '../channels/manager';
import { MemoryDatabase } from '../db/memory';

export interface ActionContext {
  userId: string;
  channelType: 'telegram' | 'discord' | 'whatsapp';
  text: string;
  aiResponse: string;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * SkillsManager - Kept for backward compatibility only.
 * The main processing logic has moved to index.ts processMessage().
 * This class no longer sends messages or triggers duplicate actions.
 */
export class SkillsManager {
  private channelManager: ChannelManager;
  private memoryDb: MemoryDatabase;

  constructor(channelManager: ChannelManager, memoryDb: MemoryDatabase) {
    this.channelManager = channelManager;
    this.memoryDb = memoryDb;
  }

  /**
   * No-op: All action execution is now handled directly in index.ts
   * This prevents the duplicate message problem where skills would
   * fire alongside the AI response.
   */
  async executeAction(_context: ActionContext): Promise<ActionResult> {
    // Intentionally does nothing - prevents duplicate messages
    return { success: false, message: 'No action matched' };
  }
}
