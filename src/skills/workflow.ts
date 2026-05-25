/**
 * Workflow Skills
 * Natural language commands for creating and managing workflows
 */

import { WorkflowManager, WorkflowCreationRequest, Workflow } from '../workflows';
import { quickRecommendation } from '../workflows/recommendations';

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

export class WorkflowSkills {
  private workflowManager: WorkflowManager;

  constructor(workflowManager: WorkflowManager) {
    this.workflowManager = workflowManager;
  }

  /**
   * Parse natural language to create workflow
   */
  async parseWorkflowRequest(text: string): Promise<{
    isWorkflowRequest: boolean;
    workflow?: WorkflowCreationRequest;
    suggestion?: string;
  }> {
    const lowerText = text.toLowerCase();

    // Check if it's a workflow request
    const workflowKeywords = ['create workflow', 'make workflow', 'workflow', 'automate', 'schedule', 'create automation'];
    const isWorkflow = workflowKeywords.some(kw => lowerText.includes(kw));

    if (!isWorkflow) {
      return { isWorkflowRequest: false };
    }

    logger.debug('WORKFLOW_SKILL', 'Parsing workflow request', { text });

    // Extract workflow name
    const nameMatch = text.match(/(?:create|make)\s+(?:a\s+)?(?:workflow|automation)\s+(?:called|named)?\s+["`]?([^"`]+)["`]?/i);
    const name = nameMatch ? nameMatch[1].trim().split(/[,\.]|\s+(?:that|to|for)/)[0] : 'Untitled Workflow';

    // Extract description (enhanced)
    const descMatch = text.match(/(?:that|to|for|do)\s+([^.!?]+)(?:[.!?]|$)/i);
    const description = descMatch ? descMatch[1].trim() : text;

    // Detect trigger type
    let triggerType: 'message' | 'schedule' | 'webhook' | 'manual' = 'manual';
    if (lowerText.includes('every') || lowerText.includes('scheduled') || lowerText.includes('cron')) {
      triggerType = 'schedule';
    } else if (lowerText.includes('when message') || lowerText.includes('on message')) {
      triggerType = 'message';
    } else if (lowerText.includes('webhook')) {
      triggerType = 'webhook';
    }

    // Extract channels if mentioned
    const channels: string[] = [];
    if (lowerText.includes('telegram')) channels.push('telegram');
    if (lowerText.includes('discord')) channels.push('discord');
    if (lowerText.includes('whatsapp')) channels.push('whatsapp');

    // Parse steps from text (simple pattern matching)
    const steps = this.parseSteps(text);

    // Get recommendation
    const recommendation = quickRecommendation(
      steps.length,
      triggerType === 'schedule',
      steps.some(s => s.type === 'api_call')
    );

    const workflow: WorkflowCreationRequest = {
      name,
      description,
      trigger: {
        type: triggerType,
        channels: channels.length > 0 ? channels : undefined,
      },
      steps,
    };

    logger.info('WORKFLOW_SKILL', 'Workflow request parsed', {
      name,
      steps: steps.length,
      trigger: triggerType,
    });

    return {
      isWorkflowRequest: true,
      workflow,
      suggestion: recommendation,
    };
  }

  /**
   * Parse steps from natural language
   */
  private parseSteps(text: string): any[] {
    const steps = [];
    const stepPatterns = [
      { pattern: /send (?:a )?message/i, type: 'action', action: 'send_message' },
      { pattern: /store (?:the )?data/i, type: 'action', action: 'store_data' },
      { pattern: /retrieve (?:the )?data/i, type: 'action', action: 'retrieve_data' },
      { pattern: /call (?:an )?api|make (?:a )?request/i, type: 'api_call' },
      { pattern: /if|check|condition|when/i, type: 'condition' },
      { pattern: /wait|delay|pause/i, type: 'trigger' },
    ];

    for (const { pattern, type, action } of stepPatterns) {
      if (pattern.test(text)) {
        steps.push({
          name: pattern.source.slice(0, 20),
          type,
          description: text.slice(0, 50),
          config: action ? { action } : {},
        });
      }
    }

    // If no steps detected, create a default one
    if (steps.length === 0) {
      steps.push({
        name: 'execute',
        type: 'action',
        description: text,
        config: { action: 'send_message' },
      });
    }

    return steps;
  }

  /**
   * Create workflow from natural language
   */
  async createFromNaturalLanguage(text: string): Promise<{
    success: boolean;
    workflow?: Workflow;
    recommendation?: any;
    confirmationCode?: string;
    message?: string;
  }> {
    try {
      const { isWorkflowRequest, workflow, suggestion } = await this.parseWorkflowRequest(text);

      if (!isWorkflowRequest || !workflow) {
        return {
          success: false,
          message: 'Could not parse workflow request. Try: "create workflow called X that does Y"',
        };
      }

      logger.info('WORKFLOW_SKILL', 'Creating workflow from natural language', { name: workflow.name });

      const { workflow: created, recommendation, confirmationCode } = await this.workflowManager.createWorkflow(
        workflow
      );

      return {
        success: true,
        workflow: created,
        recommendation,
        confirmationCode,
        message: `✅ Workflow "${created.name}" created! ${suggestion}`,
      };
    } catch (error) {
      logger.info('WORKFLOW_SKILL', 'Error creating workflow', { error });
      return {
        success: false,
        message: `Error creating workflow: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * List all workflows
   */
  listWorkflows(): {
    success: boolean;
    workflows?: Workflow[];
    message: string;
  } {
    try {
      const workflows = this.workflowManager.listWorkflows();

      if (workflows.length === 0) {
        return {
          success: true,
          workflows: [],
          message: '📭 No workflows created yet. Try: "create workflow called X"',
        };
      }

      return {
        success: true,
        workflows,
        message: `📋 Found ${workflows.length} workflow(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error listing workflows: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(
    identifier: string
  ): Promise<{
    success: boolean;
    result?: any;
    message: string;
  }> {
    try {
      // Try to find workflow by ID or name
      let workflowId = identifier;
      let workflow = await this.workflowManager.getWorkflow(identifier);

      if (!workflow) {
        // Try by name
        const workflows = this.workflowManager.listWorkflows();
        const byName = workflows.find(w => w.name.toLowerCase() === identifier.toLowerCase());

        if (!byName) {
          return {
            success: false,
            message: `Workflow "${identifier}" not found`,
          };
        }

        workflowId = byName.id;
      }

      logger.info('WORKFLOW_SKILL', 'Executing workflow', { workflowId });

      const execution = await this.workflowManager.executeWorkflow(workflowId);

      const statusEmoji = execution.status === 'success' ? '✅' : '❌';
      return {
        success: execution.status === 'success',
        result: execution.result,
        message: `${statusEmoji} Workflow execution ${execution.status}${
          execution.error ? `: ${execution.error}` : ''
        }. Took ${execution.endTime! - execution.startTime}ms`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error executing workflow: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
