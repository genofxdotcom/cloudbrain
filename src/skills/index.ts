/**
 * Skills/Actions system for CloudBrain
 * Handles natural language actions like "send me that file", "review that file", etc.
 * Includes workflow creation and management
 */

import { ChannelManager } from '../channels/manager';
import { MemoryDatabase } from '../db/memory';
import { WorkflowSkills } from './workflow';

export { WorkflowSkills } from './workflow';

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

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [${tag}] ${message}`, error || '');
  },
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] [WARN] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

export class SkillsManager {
  private channelManager: ChannelManager;
  private memoryDb: MemoryDatabase;

  constructor(channelManager: ChannelManager, memoryDb: MemoryDatabase) {
    this.channelManager = channelManager;
    this.memoryDb = memoryDb;
    logger.info('SKILLS', 'Skills manager initialized');
  }

  /**
   * Parse and execute natural language actions
   */
  async executeAction(context: ActionContext): Promise<ActionResult> {
    const text = context.text.toLowerCase();
    logger.debug('SKILLS', 'Analyzing action', { userId: context.userId, textLength: text.length });

    // Send file action: "send me that file", "share that file", etc.
    if (this.matchesPattern(text, ['send', 'share', 'give'], ['file', 'document', 'image'])) {
      logger.info('SKILLS', 'Matched: Send file action');
      return this.handleSendFile(context);
    }

    // Review action: "review that file", "check that file", etc.
    if (this.matchesPattern(text, ['review', 'check', 'analyze'], ['file', 'document', 'image'])) {
      logger.info('SKILLS', 'Matched: Review file action');
      return this.handleReviewFile(context);
    }

    // Store memory action: "remember this", "save this", "note this", etc.
    if (this.matchesPattern(text, ['remember', 'save', 'note', 'store'], ['this', 'that'])) {
      logger.info('SKILLS', 'Matched: Store memory action');
      return this.handleStoreMemory(context);
    }

    // Move file action: "move this from X to Y", "transfer this", etc.
    if (this.matchesPattern(text, ['move', 'transfer', 'copy'], ['from', 'to'])) {
      logger.info('SKILLS', 'Matched: Move file action');
      return this.handleMoveFile(context);
    }

    // Create automation: "make automation", "create automation", "automate", etc.
    if (this.matchesPattern(text, ['make', 'create', 'setup'], ['automation', 'auto'])) {
      logger.info('SKILLS', 'Matched: Create automation action');
      return this.handleCreateAutomation(context);
    }

    // Recall memory: "what did I tell you", "remind me", "recall", etc.
    if (this.matchesPattern(text, ['what', 'remind', 'recall', 'remember'], ['tell', 'said', 'about'])) {
      logger.info('SKILLS', 'Matched: Recall memory action');
      return this.handleRecallMemory(context);
    }

    logger.debug('SKILLS', 'No action matched');
    return {
      success: false,
      message: 'No action matched',
    };
  }

  /**
   * Check if text matches a pattern
   */
  private matchesPattern(text: string, verbs: string[], nouns: string[]): boolean {
    const hasVerb = verbs.some((verb) => text.includes(verb));
    const hasNoun = nouns.some((noun) => text.includes(noun));
    return hasVerb && hasNoun;
  }

  /**
   * Handle sending a file
   */
  private async handleSendFile(context: ActionContext): Promise<ActionResult> {
    try {
      logger.debug('SKILLS', 'Handling send file action');
      // Extract file URL from AI response (AI should provide it)
      const fileUrlMatch = context.aiResponse.match(/https?:\/\/[^\s]+/);
      if (!fileUrlMatch) {
        logger.warn('SKILLS', 'No file URL found in AI response');
        return {
          success: false,
          error: 'No file URL found in response',
        };
      }

      const fileUrl = fileUrlMatch[0];
      logger.debug('SKILLS', 'Extracted file URL', { fileUrl });

      const success = await this.channelManager.sendFile(
        context.channelType,
        context.userId,
        fileUrl,
        'Here is the file you requested'
      );

      logger.info('SKILLS', 'Send file action completed', { success });
      return {
        success,
        message: success ? 'File sent successfully' : 'Failed to send file',
      };
    } catch (error) {
      logger.error('SKILLS', 'Error in send file action', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle reviewing a file
   */
  private async handleReviewFile(context: ActionContext): Promise<ActionResult> {
    try {
      logger.debug('SKILLS', 'Handling review file action');
      // AI response should contain the review
      const success = await this.channelManager.sendMessage(
        context.channelType,
        context.userId,
        `Review: ${context.aiResponse}`
      );

      logger.info('SKILLS', 'Review file action completed', { success });
      return {
        success,
        message: success ? 'Review sent' : 'Failed to send review',
      };
    } catch (error) {
      logger.error('SKILLS', 'Error in review file action', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle storing a memory
   */
  private async handleStoreMemory(context: ActionContext): Promise<ActionResult> {
    try {
      logger.debug('SKILLS', 'Handling store memory action');
      const memory = await this.memoryDb.storeMemory({
        userId: context.userId,
        channelType: context.channelType,
        content: context.aiResponse,
        importance: 7, // Default importance for user-requested memories
      });

      logger.debug('SKILLS', 'Memory stored', { memoryId: memory.id });

      const success = await this.channelManager.sendMessage(
        context.channelType,
        context.userId,
        `✓ Memory saved (ID: ${memory.id})`
      );

      logger.info('SKILLS', 'Store memory action completed', { success, memoryId: memory.id });
      return {
        success,
        message: 'Memory stored successfully',
      };
    } catch (error) {
      logger.error('SKILLS', 'Error in store memory action', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle moving/transferring files between channels
   */
  private async handleMoveFile(context: ActionContext): Promise<ActionResult> {
    try {
      logger.debug('SKILLS', 'Handling move file action');
      // Extract source and destination channels
      const fromMatch = context.text.match(/from\s+(\w+)/i);
      const toMatch = context.text.match(/to\s+(\w+)/i);

      if (!fromMatch || !toMatch) {
        logger.warn('SKILLS', 'Could not parse source and destination channels');
        return {
          success: false,
          error: 'Could not parse source and destination channels',
        };
      }

      const fromChannel = fromMatch[1].toLowerCase();
      const toChannel = toMatch[1].toLowerCase();
      logger.debug('SKILLS', 'Parsed channels', { fromChannel, toChannel });

      // Extract file URL
      const fileUrlMatch = context.aiResponse.match(/https?:\/\/[^\s]+/);
      if (!fileUrlMatch) {
        logger.warn('SKILLS', 'No file URL found in AI response');
        return {
          success: false,
          error: 'No file URL found',
        };
      }

      const fileUrl = fileUrlMatch[0];
      logger.debug('SKILLS', 'Extracted file URL for transfer', { fileUrl });

      // Send file to destination channel
      const success = await this.channelManager.sendFile(
        toChannel,
        context.userId,
        fileUrl,
        `File transferred from ${fromChannel}`
      );

      logger.info('SKILLS', 'Move file action completed', { success, fromChannel, toChannel });
      return {
        success,
        message: success ? `File moved from ${fromChannel} to ${toChannel}` : 'Failed to move file',
      };
    } catch (error) {
      logger.error('SKILLS', 'Error in move file action', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle creating automation
   */
  private async handleCreateAutomation(context: ActionContext): Promise<ActionResult> {
    try {
      logger.debug('SKILLS', 'Handling create automation action');
      // AI response should contain automation details
      const success = await this.channelManager.sendMessage(
        context.channelType,
        context.userId,
        `Automation created:\n${context.aiResponse}`
      );

      logger.info('SKILLS', 'Create automation action completed', { success });
      return {
        success,
        message: 'Automation created successfully',
      };
    } catch (error) {
      logger.error('SKILLS', 'Error in create automation action', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle recalling memories
   */
  private async handleRecallMemory(context: ActionContext): Promise<ActionResult> {
    try {
      logger.debug('SKILLS', 'Handling recall memory action');
      const memories = await this.memoryDb.getUserMemories(context.userId, 5);

      logger.debug('SKILLS', 'Retrieved memories', { count: memories.length });

      if (memories.length === 0) {
        logger.debug('SKILLS', 'No memories found');
        const success = await this.channelManager.sendMessage(
          context.channelType,
          context.userId,
          'No memories found'
        );
        return {
          success,
          message: 'No memories to recall',
        };
      }

      const memoryText = memories
        .map((m) => `• ${m.content} (importance: ${m.importance}/10)`)
        .join('\n');

      const success = await this.channelManager.sendMessage(
        context.channelType,
        context.userId,
        `Your memories:\n${memoryText}`
      );

      logger.info('SKILLS', 'Recall memory action completed', { success, memoryCount: memories.length });
      return {
        success,
        message: 'Memories recalled',
      };
    } catch (error) {
      logger.error('SKILLS', 'Error in recall memory action', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
