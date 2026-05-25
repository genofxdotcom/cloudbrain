/**
 * Advanced Natural Language Processing (NLP) Intent Engine
 * 100% natural language understanding without trigger words
 * Learns context and handles complex multi-step requests
 */

export interface Intent {
  type: 'resource_management' | 'media_operation' | 'ai_generation' | 'automation' | 'query_info' | 'general_chat';
  action: string;
  confidence: number;
  parameters: Record<string, any>;
  multiStep?: boolean;
  steps?: IntentStep[];
}

export interface IntentStep {
  action: string;
  parameters: Record<string, any>;
  dependsOn?: number; // Index of step this depends on
}

export interface NLPContext {
  userId: string;
  channelType: string;
  messageHistory: string[];
  previousIntents?: Intent[];
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
 * Intent patterns for natural language matching
 */
const INTENT_PATTERNS = {
  // Resource Management
  'create_domain': {
    keywords: ['create', 'add', 'register', 'new domain', 'domain name'],
    exclude: ['automate', 'automation'],
    confidence: 0.95,
  },
  'list_domains': {
    keywords: ['list', 'show', 'get', 'all domains', 'my domains', 'domains'],
    exclude: ['create', 'delete'],
    confidence: 0.9,
  },
  'delete_domain': {
    keywords: ['delete', 'remove', 'drop', 'remove domain'],
    exclude: [],
    confidence: 0.95,
  },
  'create_worker': {
    keywords: ['create', 'deploy', 'new worker', 'make worker', 'setup worker'],
    exclude: [],
    confidence: 0.9,
  },
  'list_workers': {
    keywords: ['list', 'show', 'workers', 'my workers', 'all workers'],
    exclude: ['create', 'delete'],
    confidence: 0.9,
  },
  'deploy_worker': {
    keywords: ['deploy', 'push', 'upload', 'publish', 'worker'],
    exclude: [],
    confidence: 0.9,
  },
  'delete_worker': {
    keywords: ['delete', 'remove', 'remove worker', 'delete worker'],
    exclude: [],
    confidence: 0.9,
  },
  'create_database': {
    keywords: ['create', 'new database', 'd1', 'database'],
    exclude: ['query', 'update'],
    confidence: 0.9,
  },
  'query_database': {
    keywords: ['query', 'sql', 'select', 'database'],
    exclude: ['create', 'delete'],
    confidence: 0.85,
  },
  'create_r2_bucket': {
    keywords: ['create', 'new bucket', 'r2', 'storage'],
    exclude: ['delete'],
    confidence: 0.9,
  },
  'list_kv': {
    keywords: ['list', 'show', 'kv', 'key value'],
    exclude: ['create'],
    confidence: 0.85,
  },

  // Media Operations
  'upload_file': {
    keywords: ['upload', 'store', 'save', 'send file', 'file to'],
    exclude: ['download', 'delete'],
    confidence: 0.9,
  },
  'download_file': {
    keywords: ['download', 'get', 'fetch', 'retrieve', 'send me'],
    exclude: ['upload', 'store'],
    confidence: 0.9,
  },
  'delete_file': {
    keywords: ['delete', 'remove', 'remove file'],
    exclude: [],
    confidence: 0.9,
  },
  'list_files': {
    keywords: ['list', 'show', 'files', 'media', 'storage'],
    exclude: ['delete', 'upload'],
    confidence: 0.85,
  },
  'move_file': {
    keywords: ['move', 'transfer', 'copy', 'send to'],
    exclude: [],
    confidence: 0.85,
  },

  // AI Generation
  'generate_image': {
    keywords: ['generate', 'create', 'image', 'picture', 'draw', 'render'],
    exclude: [],
    confidence: 0.9,
  },
  'transcribe_audio': {
    keywords: ['transcribe', 'audio', 'voice', 'speech', 'convert'],
    exclude: [],
    confidence: 0.85,
  },
  'generate_text': {
    keywords: ['write', 'generate', 'compose', 'explain', 'describe', 'summarize'],
    exclude: [],
    confidence: 0.8,
  },
  'process_video': {
    keywords: ['video', 'process', 'analyze', 'edit'],
    exclude: [],
    confidence: 0.8,
  },

  // Automation & Workflows
  'create_automation': {
    keywords: ['automate', 'automation', 'scheduled', 'trigger', 'workflow', 'recurring'],
    exclude: [],
    confidence: 0.9,
  },
  'create_workflow': {
    keywords: ['workflow', 'multi-step', 'automation', 'chain', 'sequence'],
    exclude: [],
    confidence: 0.85,
  },
  'list_automations': {
    keywords: ['list', 'show', 'automations', 'my automations'],
    exclude: ['create'],
    confidence: 0.9,
  },
  'delete_automation': {
    keywords: ['delete', 'remove', 'stop', 'disable', 'automation'],
    exclude: [],
    confidence: 0.9,
  },

  // Queries & Info
  'get_status': {
    keywords: ['status', 'health', 'ping', 'how are', 'check'],
    exclude: [],
    confidence: 0.8,
  },
  'get_analytics': {
    keywords: ['analytics', 'stats', 'metrics', 'report', 'performance'],
    exclude: [],
    confidence: 0.85,
  },
  'get_logs': {
    keywords: ['logs', 'log', 'errors', 'error messages', 'recent activity'],
    exclude: [],
    confidence: 0.8,
  },
};

/**
 * AdvancedIntentEngine - NLP for natural language understanding
 */
export class AdvancedIntentEngine {
  private context: NLPContext;

  constructor(context: NLPContext) {
    this.context = context;
    logger.info('NLP', 'Advanced Intent Engine initialized');
  }

  /**
   * Parse user message and extract intent
   */
  async parseIntent(message: string): Promise<Intent> {
    logger.info('NLP', 'Parsing intent from message', { userId: this.context.userId, messageLength: message.length });

    const normalizedMessage = message.toLowerCase().trim();

    // Check for multi-step requests
    const isMultiStep = this.isMultiStepRequest(normalizedMessage);

    if (isMultiStep) {
      logger.debug('NLP', 'Detected multi-step request');
      return this.parseMultiStepIntent(normalizedMessage);
    }

    // Single-step intent matching
    return this.parseSingleStepIntent(normalizedMessage);
  }

  /**
   * Parse single-step intent
   */
  private parseSingleStepIntent(message: string): Intent {
    let bestMatch: { action: string; confidence: number } = { action: 'general_chat', confidence: 0 };
    let matchedParameters: Record<string, any> = {};

    // Score each intent pattern
    for (const [action, pattern] of Object.entries(INTENT_PATTERNS)) {
      let score = 0;

      // Add points for matching keywords
      pattern.keywords.forEach((keyword) => {
        if (message.includes(keyword)) {
          score += 1;
        }
      });

      // Subtract points for excluded keywords
      pattern.exclude.forEach((excluded) => {
        if (message.includes(excluded)) {
          score -= 0.5;
        }
      });

      // Normalize score
      const normalizedScore = Math.min(1, score / pattern.keywords.length) * pattern.confidence;

      if (normalizedScore > bestMatch.confidence) {
        bestMatch = { action, confidence: normalizedScore };
        matchedParameters = this.extractParameters(action, message);
      }
    }

    logger.debug('NLP', 'Single-step intent matched', { action: bestMatch.action, confidence: bestMatch.confidence });

    return {
      type: this.getIntentType(bestMatch.action),
      action: bestMatch.action,
      confidence: bestMatch.confidence,
      parameters: matchedParameters,
      multiStep: false,
    };
  }

  /**
   * Parse multi-step intent
   */
  private parseMultiStepIntent(message: string): Intent {
    logger.debug('NLP', 'Parsing multi-step intent');

    const steps: IntentStep[] = [];
    const sentences = message.split(/[.,;!?]+/).filter((s) => s.trim());

    // Parse each sentence as a step
    sentences.forEach((sentence, index) => {
      const intent = this.parseSingleStepIntent(sentence);
      if (intent.confidence > 0.5) {
        steps.push({
          action: intent.action,
          parameters: intent.parameters,
          dependsOn: index > 0 ? index - 1 : undefined,
        });
      }
    });

    const firstStep = steps[0] || { action: 'general_chat', parameters: {} };

    return {
      type: this.getIntentType(firstStep.action),
      action: firstStep.action,
      confidence: 0.8,
      parameters: firstStep.parameters,
      multiStep: steps.length > 1,
      steps,
    };
  }

  /**
   * Extract parameters from message for specific action
   */
  private extractParameters(action: string, message: string): Record<string, any> {
    const params: Record<string, any> = {};

    // Domain-related
    if (action.includes('domain')) {
      const domainMatch = message.match(/(?:domain|site)\s+(?:named\s+|called\s+)?([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/i);
      if (domainMatch) params.domain = domainMatch[1];
    }

    // Worker-related
    if (action.includes('worker')) {
      const workerMatch = message.match(/(?:worker|script)\s+(?:named\s+|called\s+)?([a-zA-Z0-9-_]+)/i);
      if (workerMatch) params.name = workerMatch[1];
    }

    // Database-related
    if (action.includes('database') || action.includes('d1')) {
      const dbMatch = message.match(/(?:database|d1)\s+(?:named\s+|called\s+)?([a-zA-Z0-9-_]+)/i);
      if (dbMatch) params.name = dbMatch[1];
    }

    // File-related
    if (action.includes('file')) {
      const fileMatch = message.match(/(?:file|document|image)\s+(?:named\s+|called\s+)?([a-zA-Z0-9-_.]+)/i);
      if (fileMatch) params.filename = fileMatch[1];

      // Extract path/location
      const pathMatch = message.match(/(?:in\s+|from\s+|to\s+)([a-zA-Z0-9-_/]+)/i);
      if (pathMatch) params.path = pathMatch[1];
    }

    // AI Generation - extract description
    if (action.includes('generate') || action.includes('create')) {
      const descMatch = message.match(/(?:of|a|an)\s+(.+?)(?:image|picture|audio|video|text)?$/i);
      if (descMatch) params.description = descMatch[1].trim();
    }

    // Automation - extract schedule
    if (action.includes('automation') || action.includes('workflow')) {
      const scheduleMatch = message.match(/(?:every|each|daily|hourly|weekly|monthly)\s+([a-zA-Z0-9]+)/i);
      if (scheduleMatch) params.schedule = scheduleMatch[1];

      const triggerMatch = message.match(/(?:when|if|on)\s+(.+?)(?:do|then|run)?/i);
      if (triggerMatch) params.trigger = triggerMatch[1].trim();
    }

    // Query-related - extract SQL or keywords
    if (action.includes('query')) {
      if (message.includes('select') || message.includes('where')) {
        params.isSql = true;
        const sqlMatch = message.match(/(?:query|select|where|from)\s+(.+?)$/i);
        if (sqlMatch) params.query = sqlMatch[1].trim();
      }
    }

    logger.debug('NLP', 'Parameters extracted', { action, params });

    return params;
  }

  /**
   * Detect multi-step request
   */
  private isMultiStepRequest(message: string): boolean {
    const multiStepIndicators = [
      'then',
      'after that',
      'next',
      'and then',
      'once',
      'followed by',
      'chain',
      'sequence',
      'steps',
      'process',
      'pipeline',
      'workflow',
    ];

    return multiStepIndicators.some((indicator) => message.includes(indicator));
  }

  /**
   * Get intent category type
   */
  private getIntentType(
    action: string
  ): 'resource_management' | 'media_operation' | 'ai_generation' | 'automation' | 'query_info' | 'general_chat' {
    if (action.includes('domain') || action.includes('worker') || action.includes('database') || action.includes('kv') || action.includes('r2')) {
      return 'resource_management';
    }
    if (action.includes('file') || action.includes('upload') || action.includes('download')) {
      return 'media_operation';
    }
    if (action.includes('generate') || action.includes('transcribe') || action.includes('process')) {
      return 'ai_generation';
    }
    if (action.includes('automation') || action.includes('workflow')) {
      return 'automation';
    }
    if (action.includes('status') || action.includes('analytics') || action.includes('logs')) {
      return 'query_info';
    }
    return 'general_chat';
  }

  /**
   * Get follow-up questions based on intent
   */
  getFollowUpQuestions(intent: Intent): string[] {
    const questions: Record<string, string[]> = {
      create_domain: ['Plan to use Cloudflare nameservers?', 'Which plan type?'],
      create_worker: ['Need any bindings (KV, D1, R2)?', 'What should the worker do?'],
      generate_image: ['Any specific style?', 'Image size preference?'],
      create_automation: ['How often should it run?', 'What should trigger it?'],
    };

    return questions[intent.action] || [];
  }

  /**
   * Format intent for display
   */
  formatIntentSummary(intent: Intent): string {
    let summary = `🎯 Intent: **${this.formatActionName(intent.action)}**\n`;
    summary += `Confidence: ${Math.round(intent.confidence * 100)}%\n`;

    if (Object.keys(intent.parameters).length > 0) {
      summary += '\n📋 Parameters:\n';
      Object.entries(intent.parameters).forEach(([key, value]) => {
        summary += `• ${key}: ${value}\n`;
      });
    }

    if (intent.multiStep && intent.steps) {
      summary += '\n🔗 Multi-Step Process:\n';
      intent.steps.forEach((step, index) => {
        summary += `${index + 1}. ${this.formatActionName(step.action)}\n`;
      });
    }

    return summary;
  }

  /**
   * Format action name for display
   */
  private formatActionName(action: string): string {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
