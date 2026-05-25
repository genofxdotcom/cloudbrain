/**
 * Cloudflare Workflows Manager
 * 
 * Handles creation, deployment, and management of Cloudflare Workflows
 */

import {
  WorkflowDefinition,
  WorkflowDeployment,
  WorkflowInstance,
  WorkflowAnalysis,
} from './types';
import { Env } from '../types';

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

export class WorkflowManager {
  private accountId: string = '';
  private apiToken: string = '';
  private workflows: Map<string, WorkflowDeployment> = new Map();

  /**
   * Initialize the workflow manager
   * Requires Cloudflare API credentials
   */
  async initialize(env: Env, accountId?: string, apiToken?: string): Promise<void> {
    // Try to get from credentials if not provided
    this.accountId = accountId || (await this.getCredential(env, 'CLOUDFLARE_ACCOUNT_ID')) || '';
    this.apiToken = apiToken || (await this.getCredential(env, 'CLOUDFLARE_API_TOKEN')) || '';

    if (!this.accountId || !this.apiToken) {
      logger.warn(
        'WORKFLOW',
        'Cloudflare API credentials not fully configured. Workflow creation will be limited.'
      );
      return;
    }

    logger.info('WORKFLOW', 'Workflow manager initialized');
  }

  /**
   * Get credential from KV
   */
  private async getCredential(env: Env, key: string): Promise<string | null> {
    try {
      return await env.SECRETS.get(key);
    } catch {
      return null;
    }
  }

  /**
   * Create and deploy a workflow
   */
  async deployWorkflow(definition: WorkflowDefinition): Promise<WorkflowDeployment | null> {
    if (!this.accountId || !this.apiToken) {
      logger.error('WORKFLOW', 'Cannot deploy workflow: API credentials not configured');
      return null;
    }

    try {
      logger.info('WORKFLOW', `Deploying workflow: ${definition.name}`);

      // Generate workflow script
      const script = this.generateWorkflowScript(definition);

      // Create/update workflow via Cloudflare API
      const workflowName = definition.name.replace(/\s+/g, '-').toLowerCase();
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workflows/${workflowName}`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: workflowName,
          description: definition.description,
          script: script,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.errors?.[0]?.message || 'Failed to deploy workflow');
      }

      const result = await response.json();

      const deployment: WorkflowDeployment = {
        id: result.result?.id || workflowName,
        name: definition.name,
        status: 'deployed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        definition,
        scriptName: workflowName,
      };

      this.workflows.set(workflowName, deployment);
      logger.info('WORKFLOW', `Workflow deployed successfully: ${workflowName}`, {
        id: deployment.id,
      });

      return deployment;
    } catch (error) {
      logger.error('WORKFLOW', `Failed to deploy workflow: ${definition.name}`, error);
      return null;
    }
  }

  /**
   * List all deployed workflows
   */
  async listWorkflows(): Promise<WorkflowDeployment[]> {
    if (!this.accountId || !this.apiToken) {
      logger.warn('WORKFLOW', 'Cannot list workflows: API credentials not configured');
      return Array.from(this.workflows.values());
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workflows`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to list workflows');
      }

      const result = await response.json();
      logger.debug('WORKFLOW', `Found ${result.result?.length || 0} workflows`);

      return result.result?.map((wf: any) => ({
        id: wf.id,
        name: wf.name,
        status: 'deployed',
        createdAt: wf.created_on,
        updatedAt: wf.modified_on,
        definition: {
          name: wf.name,
          description: 'Deployed workflow',
          trigger: 'webhook',
          steps: [],
        },
        scriptName: wf.script_name,
      })) || [];
    } catch (error) {
      logger.error('WORKFLOW', 'Error listing workflows', error);
      return Array.from(this.workflows.values());
    }
  }

  /**
   * Get workflow details
   */
  async getWorkflow(name: string): Promise<WorkflowDeployment | null> {
    const cached = this.workflows.get(name);
    if (cached) return cached;

    if (!this.accountId || !this.apiToken) {
      return null;
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workflows/${name}`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      const workflow = result.result;

      return {
        id: workflow.id,
        name: workflow.name,
        status: 'deployed',
        createdAt: workflow.created_on,
        updatedAt: workflow.modified_on,
        definition: {
          name: workflow.name,
          description: 'Deployed workflow',
          trigger: 'webhook',
          steps: [],
        },
        scriptName: workflow.script_name,
      };
    } catch (error) {
      logger.debug('WORKFLOW', `Error getting workflow: ${name}`, error);
      return null;
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(name: string): Promise<boolean> {
    if (!this.accountId || !this.apiToken) {
      logger.warn('WORKFLOW', 'Cannot delete workflow: API credentials not configured');
      return false;
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workflows/${name}`;

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete workflow');
      }

      this.workflows.delete(name);
      logger.info('WORKFLOW', `Workflow deleted: ${name}`);
      return true;
    } catch (error) {
      logger.error('WORKFLOW', `Failed to delete workflow: ${name}`, error);
      return false;
    }
  }

  /**
   * Trigger a workflow instance
   */
  async triggerWorkflow(name: string, input: Record<string, any>): Promise<WorkflowInstance | null> {
    if (!this.accountId || !this.apiToken) {
      logger.warn('WORKFLOW', 'Cannot trigger workflow: API credentials not configured');
      return null;
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workflows/${name}/instances`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger workflow');
      }

      const result = await response.json();
      const instance = result.result;

      logger.info('WORKFLOW', `Workflow triggered: ${name}`, { instanceId: instance.id });

      return {
        id: instance.id,
        workflowId: name,
        status: instance.status,
        startedAt: instance.created_on,
        steps: [],
      };
    } catch (error) {
      logger.error('WORKFLOW', `Failed to trigger workflow: ${name}`, error);
      return null;
    }
  }

  /**
   * Get workflow instance status
   */
  async getInstanceStatus(
    workflowName: string,
    instanceId: string
  ): Promise<WorkflowInstance | null> {
    if (!this.accountId || !this.apiToken) {
      return null;
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workflows/${workflowName}/instances/${instanceId}`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      const instance = result.result;

      return {
        id: instance.id,
        workflowId: workflowName,
        status: instance.status,
        startedAt: instance.created_on,
        completedAt: instance.completed_on,
        steps: instance.steps || [],
        error: instance.error,
      };
    } catch (error) {
      logger.debug('WORKFLOW', `Error getting instance status`, error);
      return null;
    }
  }

  /**
   * Generate workflow script (TypeScript/JavaScript)
   */
  private generateWorkflowScript(definition: WorkflowDefinition): string {
    const stepsCode = definition.steps
      .map((step) => {
        const stepType = step.type || 'action';
        return `
  // Step: ${step.name}
  const ${step.id} = await workflow.step.${stepType}('${step.id}', async () => {
    // Execute step logic
    console.log('[${step.id}] Executing: ${step.name}');
    
    // Your step logic here
    return { success: true, stepId: '${step.id}' };
  });
`;
      })
      .join('\n');

    return `
/**
 * Workflow: ${definition.name}
 * Description: ${definition.description}
 * 
 * Auto-generated by CloudBrain Workflow Manager
 */

import { Workflow } from 'cloudflare:workflows';

type Params = {
  input: Record<string, any>;
};

export const myWorkflow = new Workflow();

export default {
  async init(state, env, ctx) {
    // Initialize workflow with input
    const { input } = await ctx.waitForWebhookRequest();
    
    return { input };
  },
  
  async onSuccess(success, { params }) {
    console.log('[onSuccess] Workflow completed successfully');
  },
  
  async onFailure(failure, { params }) {
    console.log('[onFailure] Workflow failed:', failure.error);
  },
};

// Workflow steps
${stepsCode}
`;
  }

  /**
   * Check if workflow manager is ready
   */
  isReady(): boolean {
    return !!this.accountId && !!this.apiToken;
  }
}
