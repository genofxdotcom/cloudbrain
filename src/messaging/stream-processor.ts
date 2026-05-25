/**
 * Multi-Message Stream Processor
 * Real-time progress updates during long-running operations
 * Provides natural, conversational feedback without redundant messages
 */

export interface StreamMessage {
  id: string;
  type: 'status' | 'progress' | 'result' | 'error' | 'info' | 'warning';
  content: string;
  timestamp: Date;
  progressPercent?: number;
  duration?: number; // milliseconds
  metadata?: Record<string, any>;
}

export interface StreamContext {
  userId: string;
  channelType: 'telegram' | 'discord' | 'whatsapp';
  operationId: string;
  operationType: string;
  sendMessage: (content: string, type?: string) => Promise<boolean>;
  editMessage?: (messageId: string, content: string) => Promise<boolean>;
}

export interface OperationPhase {
  name: string;
  description: string;
  estimatedDuration?: number;
  substeps?: string[];
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

/**
 * Stream Processor - Handle multi-step operations with real-time updates
 */
export class StreamProcessor {
  private context: StreamContext;
  private messages: StreamMessage[] = [];
  private currentPhase = 0;
  private phases: OperationPhase[] = [];
  private startTime = Date.now();
  private lastMessageTime = Date.now();
  private messageDebounceMs = 1000; // Wait at least 1s between messages
  private suppressed: Set<string> = new Set(); // Track suppressed redundant messages

  constructor(context: StreamContext, phases?: OperationPhase[]) {
    this.context = context;
    this.phases = phases || [];
    logger.info('STREAM', `Stream processor initialized for operation: ${context.operationType}`);
  }

  /**
   * Send operation started message (only once)
   */
  async sendStart(message?: string): Promise<void> {
    const content =
      message ||
      `🚀 Starting ${this.context.operationType}...\n*Initializing components...*`;

    await this.queueMessage({
      type: 'status',
      content,
      progressPercent: 0,
    });

    logger.info('STREAM', 'Operation started', { operationType: this.context.operationType });
  }

  /**
   * Send progress update (smart - no duplicate messages)
   */
  async sendProgress(
    message: string,
    progressPercent?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Avoid redundant messages
    if (this.messages.length > 0) {
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg.content === message && lastMsg.type === 'progress') {
        logger.debug('STREAM', 'Skipped duplicate progress message');
        return;
      }
    }

    // Debounce rapid updates
    const now = Date.now();
    if (now - this.lastMessageTime < this.messageDebounceMs) {
      logger.debug('STREAM', 'Debounced progress message');
      return;
    }

    await this.queueMessage({
      type: 'progress',
      content: message,
      progressPercent,
      metadata,
    });

    this.lastMessageTime = now;
  }

  /**
   * Send phase transition
   */
  async sendPhaseTransition(phaseIndex: number): Promise<void> {
    if (phaseIndex >= this.phases.length) {
      logger.warn('STREAM', 'Invalid phase index', { phaseIndex, totalPhases: this.phases.length });
      return;
    }

    this.currentPhase = phaseIndex;
    const phase = this.phases[phaseIndex];

    const totalPhases = this.phases.length;
    const phasePercent = Math.round((phaseIndex / totalPhases) * 100);

    let content = `⚙️ **Phase ${phaseIndex + 1}/${totalPhases}: ${phase.name}**\n`;
    content += `${phase.description}\n`;

    if (phase.substeps && phase.substeps.length > 0) {
      content += '\n*Steps:*\n';
      phase.substeps.forEach((step, i) => {
        content += `  ${i + 1}. ${step}\n`;
      });
    }

    await this.queueMessage({
      type: 'status',
      content,
      progressPercent: phasePercent,
    });

    logger.info('STREAM', `Phase transition: ${phase.name}`, { phaseIndex, phasePercent });
  }

  /**
   * Send completion message (only once, with summary)
   */
  async sendCompletion(result?: any, message?: string): Promise<void> {
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    let content =
      message ||
      `✅ **${this.context.operationType} completed successfully!**\n*Duration: ${duration}s*`;

    if (result) {
      if (typeof result === 'string') {
        content += `\n\n📊 Result:\n${result}`;
      } else if (typeof result === 'object') {
        const summary = this.formatResultSummary(result);
        content += `\n\n📊 Summary:\n${summary}`;
      }
    }

    await this.queueMessage({
      type: 'result',
      content,
      progressPercent: 100,
      duration,
    });

    logger.info('STREAM', 'Operation completed', { operationType: this.context.operationType, duration });
  }

  /**
   * Send error message (clear, actionable)
   */
  async sendError(error: string | Error, recoveryTip?: string): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : error;
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    let content = `❌ **Error in ${this.context.operationType}**\n`;
    content += `${errorMsg}\n`;
    content += `*Duration: ${duration}s*`;

    if (recoveryTip) {
      content += `\n\n💡 Try this:\n${recoveryTip}`;
    }

    await this.queueMessage({
      type: 'error',
      content,
      duration,
    });

    logger.error('STREAM', 'Operation error', { operationType: this.context.operationType, error: errorMsg });
  }

  /**
   * Send info message (additional context)
   */
  async sendInfo(message: string): Promise<void> {
    // Suppress duplicate info messages within short time
    const key = `info_${message}`;
    if (this.suppressed.has(key)) {
      logger.debug('STREAM', 'Suppressed duplicate info message');
      return;
    }

    this.suppressed.add(key);
    setTimeout(() => this.suppressed.delete(key), 5000); // Clear suppression after 5s

    await this.queueMessage({
      type: 'info',
      content: `ℹ️ ${message}`,
    });
  }

  /**
   * Send warning message
   */
  async sendWarning(message: string): Promise<void> {
    await this.queueMessage({
      type: 'warning',
      content: `⚠️ ${message}`,
    });
  }

  /**
   * Queue message for sending (handles debouncing and deduplication)
   */
  private async queueMessage(msg: Partial<StreamMessage>): Promise<void> {
    const streamMsg: StreamMessage = {
      id: Math.random().toString(36).substring(7),
      type: msg.type || 'info',
      content: msg.content || '',
      timestamp: new Date(),
      progressPercent: msg.progressPercent,
      duration: msg.duration,
      metadata: msg.metadata,
    };

    this.messages.push(streamMsg);

    // Format message based on channel
    const formattedContent = this.formatForChannel(streamMsg);

    try {
      const success = await this.context.sendMessage(formattedContent, streamMsg.type);
      if (!success) {
        logger.warn('STREAM', 'Failed to send message', { messageId: streamMsg.id });
      }
    } catch (error) {
      logger.error('STREAM', 'Error sending message', error);
    }
  }

  /**
   * Format message based on channel
   */
  private formatForChannel(msg: StreamMessage): string {
    let formatted = msg.content;

    // Add progress bar for progress messages
    if (msg.progressPercent !== undefined && msg.type === 'progress') {
      const progressBar = this.createProgressBar(msg.progressPercent);
      formatted += `\n${progressBar}`;
    }

    // Add duration for completion/error messages
    if (msg.duration !== undefined && (msg.type === 'result' || msg.type === 'error')) {
      formatted += `\n⏱️ Duration: ${msg.duration}s`;
    }

    // Add metadata context
    if (msg.metadata) {
      if (msg.metadata.itemCount !== undefined) {
        formatted += `\n📦 Items processed: ${msg.metadata.itemCount}`;
      }
      if (msg.metadata.status !== undefined) {
        formatted += `\n📍 Status: ${msg.metadata.status}`;
      }
    }

    return formatted;
  }

  /**
   * Create progress bar
   */
  private createProgressBar(percent: number): string {
    const width = 20;
    const filled = Math.round((percent / 100) * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    return `[${bar}] ${percent}%`;
  }

  /**
   * Format result for display
   */
  private formatResultSummary(result: any): string {
    const lines: string[] = [];

    Object.entries(result).forEach(([key, value]) => {
      const formattedKey = key
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      if (typeof value === 'object') {
        lines.push(`• ${formattedKey}: ${JSON.stringify(value).substring(0, 100)}...`);
      } else {
        lines.push(`• ${formattedKey}: ${value}`);
      }
    });

    return lines.join('\n');
  }

  /**
   * Get message history
   */
  getMessageHistory(): StreamMessage[] {
    return [...this.messages];
  }

  /**
   * Get operation summary
   */
  getSummary(): {
    operationId: string;
    operationType: string;
    messageCount: number;
    duration: number;
    lastMessage: StreamMessage | null;
  } {
    return {
      operationId: this.context.operationId,
      operationType: this.context.operationType,
      messageCount: this.messages.length,
      duration: Date.now() - this.startTime,
      lastMessage: this.messages[this.messages.length - 1] || null,
    };
  }

  /**
   * Clear message history
   */
  clear(): void {
    this.messages = [];
    this.suppressed.clear();
  }
}

/**
 * StreamBuilder - Fluent API for building stream operations
 */
export class StreamBuilder {
  private context: StreamContext;
  private phases: OperationPhase[] = [];
  private processor: StreamProcessor | null = null;

  constructor(context: StreamContext) {
    this.context = context;
  }

  /**
   * Add operation phase
   */
  addPhase(name: string, description: string, substeps?: string[], estimatedDuration?: number): this {
    this.phases.push({
      name,
      description,
      substeps,
      estimatedDuration,
    });
    return this;
  }

  /**
   * Build stream processor
   */
  build(): StreamProcessor {
    this.processor = new StreamProcessor(this.context, this.phases);
    return this.processor;
  }

  /**
   * Get phases
   */
  getPhases(): OperationPhase[] {
    return this.phases;
  }
}

/**
 * Helper function: Execute operation with streaming updates
 */
export async function executeWithStream<T>(
  context: StreamContext,
  phases: OperationPhase[],
  executor: (stream: StreamProcessor) => Promise<T>
): Promise<T> {
  const stream = new StreamProcessor(context, phases);

  try {
    await stream.sendStart();
    const result = await executor(stream);
    return result;
  } catch (error) {
    await stream.sendError(error instanceof Error ? error : 'Unknown error');
    throw error;
  }
}
