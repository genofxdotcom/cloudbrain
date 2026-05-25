/**
 * Workflow Manager
 * Handles creation, execution, and management of workflows
 */

import { Workflow, WorkflowCreationRequest, WorkflowExecution, WorkflowStep } from './types';
import { getWorkflowRecommendation, quickRecommendation } from './recommendations';

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [${tag}] ${message}`, error || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

export class WorkflowManager {
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private kv: any;
  private db: any;

  constructor(kv: any, db: any) {
    this.kv = kv;
    this.db = db;
    logger.info('WORKFLOW', 'WorkflowManager initialized');
  }

  /**
   * Create a new workflow with recommendation
   */
  async createWorkflow(request: WorkflowCreationRequest): Promise<{
    workflow: Workflow;
    recommendation: any;
    confirmationCode: string;
  }> {
    logger.info('WORKFLOW', 'Creating workflow', { name: request.name, steps: request.steps.length });

    // Generate IDs and timestamps
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const now = Date.now();

    // Create workflow object
    const workflow: Workflow = {
      id: workflowId,
      name: request.name,
      description: request.description,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      trigger: request.trigger,
      steps: request.steps.map(step => ({
        ...step,
        id: `step_${step.name.replace(/\s+/g, '_').toLowerCase()}_${Math.random().toString(36).substring(7)}`,
      })),
      metadata: {
        author: 'ai_agent',
        tags: ['auto_created'],
        executionCount: 0,
        errorCount: 0,
      },
    };

    // Store workflow
    this.workflows.set(workflowId, workflow);

    // Get recommendation
    const recommendation = await getWorkflowRecommendation(request);

    // Store in KV for persistence
    try {
      await this.kv.put(`workflow:${workflowId}`, JSON.stringify(workflow), {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      });
      logger.info('WORKFLOW', 'Workflow stored in KV', { workflowId });
    } catch (error) {
      logger.error('WORKFLOW', 'Failed to store workflow in KV', error);
    }

    logger.info('WORKFLOW', 'Workflow created successfully', {
      workflowId,
      recommendation: recommendation.recommendation,
      confirmationCode,
    });

    return {
      workflow,
      recommendation,
      confirmationCode,
    };
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId: string, context: Record<string, any> = {}): Promise<WorkflowExecution> {
    logger.info('WORKFLOW', 'Executing workflow', { workflowId });

    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      logger.error('WORKFLOW', 'Workflow not found', { workflowId });
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow ${workflow.name} is disabled`);
    }

    // Create execution record
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      startTime: Date.now(),
      status: 'running',
      stepResults: new Map(),
    };

    this.executions.set(executionId, execution);

    try {
      // Execute steps sequentially
      let currentContext = { ...context };

      for (const step of workflow.steps) {
        logger.debug('WORKFLOW', `Executing step: ${step.name}`, { stepId: step.id });

        try {
          const result = await this.executeStep(step, currentContext);
          execution.stepResults.set(step.id, result);
          currentContext = { ...currentContext, ...result };
          logger.debug('WORKFLOW', `Step completed: ${step.name}`, { result });
        } catch (stepError) {
          logger.error('WORKFLOW', `Step failed: ${step.name}`, stepError);
          execution.status = 'failed';
          execution.error = `Step '${step.name}' failed: ${stepError instanceof Error ? stepError.message : String(stepError)}`;
          execution.endTime = Date.now();
          throw stepError;
        }
      }

      // Mark as successful
      execution.status = 'success';
      execution.result = Object.fromEntries(execution.stepResults);
      execution.endTime = Date.now();

      // Update workflow metadata
      if (workflow.metadata) {
        workflow.metadata.executionCount = (workflow.metadata.executionCount || 0) + 1;
        workflow.metadata.lastExecuted = Date.now();
      }

      logger.info('WORKFLOW', 'Workflow executed successfully', {
        workflowId,
        executionId,
        duration: execution.endTime - execution.startTime,
      });
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error instanceof Error ? error.message : String(error);

      if (workflow.metadata) {
        workflow.metadata.errorCount = (workflow.metadata.errorCount || 0) + 1;
      }

      logger.error('WORKFLOW', 'Workflow execution failed', { workflowId, error });
    }

    return execution;
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: WorkflowStep, context: Record<string, any>): Promise<Record<string, any>> {
    switch (step.type) {
      case 'action':
        return await this.executeAction(step, context);
      case 'api_call':
        return await this.executeApiCall(step, context);
      case 'condition':
        return await this.executeCondition(step, context);
      case 'trigger':
        return context;
      case 'schedule':
        return context;
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute action step
   */
  private async executeAction(step: WorkflowStep, context: Record<string, any>): Promise<Record<string, any>> {
    const action = step.config.action;

    switch (action) {
      case 'send_message':
        return { messageId: `msg_${Date.now()}`, status: 'sent' };

      case 'store_data':
        return { dataId: `data_${Date.now()}`, status: 'stored' };

      case 'retrieve_data':
        return { data: step.config.query, status: 'retrieved' };

      case 'delete_data':
        return { deletedId: step.config.targetId, status: 'deleted' };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Execute API call step
   */
  private async executeApiCall(step: WorkflowStep, context: Record<string, any>): Promise<Record<string, any>> {
    const { url, method = 'GET', headers = {}, body } = step.config;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return { apiResponse: data, status: 'success' };
    } catch (error) {
      throw new Error(`API call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute condition step
   */
  private async executeCondition(step: WorkflowStep, context: Record<string, any>): Promise<Record<string, any>> {
    const { field, operator, value } = step.config;
    const fieldValue = context[field];

    let result = false;

    switch (operator) {
      case 'equals':
        result = fieldValue === value;
        break;
      case 'not_equals':
        result = fieldValue !== value;
        break;
      case 'greater_than':
        result = fieldValue > value;
        break;
      case 'less_than':
        result = fieldValue < value;
        break;
      case 'contains':
        result = String(fieldValue).includes(String(value));
        break;
      case 'starts_with':
        result = String(fieldValue).startsWith(String(value));
        break;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }

    return { condition: step.config, result, message: result ? 'Condition met' : 'Condition not met' };
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    // Try memory first
    let workflow = this.workflows.get(workflowId);

    // Try KV if not in memory
    if (!workflow) {
      try {
        const data = await this.kv.get(`workflow:${workflowId}`);
        if (data) {
          workflow = JSON.parse(data);
          this.workflows.set(workflowId, workflow);
        }
      } catch (error) {
        logger.error('WORKFLOW', 'Failed to fetch workflow from KV', error);
      }
    }

    return workflow || null;
  }

  /**
   * List all workflows
   */
  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Disable a workflow
   */
  async disableWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.enabled = false;
      workflow.updatedAt = Date.now();
      await this.kv.put(`workflow:${workflowId}`, JSON.stringify(workflow));
      logger.info('WORKFLOW', 'Workflow disabled', { workflowId });
    }
  }

  /**
   * Enable a workflow
   */
  async enableWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.enabled = true;
      workflow.updatedAt = Date.now();
      await this.kv.put(`workflow:${workflowId}`, JSON.stringify(workflow));
      logger.info('WORKFLOW', 'Workflow enabled', { workflowId });
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    this.workflows.delete(workflowId);
    try {
      await this.kv.delete(`workflow:${workflowId}`);
      logger.info('WORKFLOW', 'Workflow deleted', { workflowId });
    } catch (error) {
      logger.error('WORKFLOW', 'Failed to delete workflow from KV', error);
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(workflowId: string, limit: number = 10): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.workflowId === workflowId)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }
}
