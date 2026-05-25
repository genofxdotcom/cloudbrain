/**
 * Workflow Skills - Handle natural language workflow creation
 */

import { Env, ParsedIntent, ActionResult } from '../types';
import {
  WorkflowManager,
  analyzeTask,
  getRecommendation,
  suggestWorkflowDefinition,
  WorkflowAnalysis,
} from '../workflows';

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
 * Handle workflow creation request
 */
export async function createWorkflowAction(
  intent: ParsedIntent,
  env: Env,
  manager: WorkflowManager
): Promise<ActionResult> {
  try {
    logger.info('WORKFLOW_SKILL', 'Creating workflow from intent', { action: intent.action });

    // Analyze the task
    const analysis = analyzeTask({
      description: intent.rawText,
      intent,
      parameters: intent.parameters,
    });

    logger.debug('WORKFLOW_SKILL', 'Task analysis complete', { complexity: analysis.complexity });

    // Get recommendation
    const recommendation = getRecommendation(analysis);

    logger.info('WORKFLOW_SKILL', `Recommendation: Use ${recommendation.suggested}`, {
      confidence: recommendation.confidence,
    });

    // Generate workflow definition
    const workflowDef = suggestWorkflowDefinition(intent, analysis);

    // If workflow is recommended, deploy it
    if (recommendation.suggested === 'workflow') {
      logger.info('WORKFLOW_SKILL', 'Deploying workflow...');
      const deployment = await manager.deployWorkflow(workflowDef);

      if (!deployment) {
        return {
          success: true,
          message: `Workflow creation recommended but couldn't deploy due to API credentials.
          
Here's what I recommend:

**Workflow Definition: ${workflowDef.name}**
- Description: ${workflowDef.description}
- Estimated Steps: ${workflowDef.timeout}
- Retry Policy: ${workflowDef.retryPolicy?.maxRetries} retries with ${workflowDef.retryPolicy?.backoffMultiplier}x backoff

**To deploy:**
1. Add your Cloudflare API token to KV: \`CLOUDFLARE_API_TOKEN\`
2. Add your Account ID to KV: \`CLOUDFLARE_ACCOUNT_ID\`
3. Re-run this command to auto-deploy`,
          data: {
            analysis,
            recommendation,
            workflowDefinition: workflowDef,
          },
        };
      }

      return {
        success: true,
        message: `✅ Workflow deployed successfully!

**Workflow Name:** ${deployment.name}
**ID:** ${deployment.id}
**Status:** ${deployment.status}

This workflow will:
${analysis.reasoning}

You can now trigger it by sending natural language commands like: "${intent.action}"`,
        data: {
          deployment,
          analysis,
          recommendation,
        },
      };
    } else if (recommendation.suggested === 'worker') {
      // If worker is recommended, explain why
      return {
        success: true,
        message: `✅ Recommendation: Use a Worker instead of Workflow

**Analysis:**
- Complexity: ${analysis.complexity}/50
- Estimated Steps: ${analysis.estimatedSteps}

**Why a Worker is better:**
${recommendation.tradeoffs.worker.slice(0, 3).join('\n')}

**Cost Estimate:**
${analysis.estimatedCost.workerApproach}

Your simple task will execute faster with lower latency using a standard Worker.`,
        data: {
          analysis,
          recommendation,
        },
      };
    }

    return {
      success: false,
      message: 'Could not determine appropriate approach for this task',
    };
  } catch (error) {
    logger.error('WORKFLOW_SKILL', 'Error creating workflow', error);
    return {
      success: false,
      message: 'Failed to create workflow',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List deployed workflows
 */
export async function listWorkflowsAction(manager: WorkflowManager): Promise<ActionResult> {
  try {
    const workflows = await manager.listWorkflows();

    if (workflows.length === 0) {
      return {
        success: true,
        message: 'No workflows deployed yet. Create one by asking me to automate a task!',
      };
    }

    const list = workflows
      .map(
        (wf, idx) =>
          `${idx + 1}. **${wf.name}** (${wf.status})\n   ID: ${wf.id}\n   Created: ${new Date(wf.createdAt).toLocaleDateString()}`
      )
      .join('\n\n');

    return {
      success: true,
      message: `📋 **Deployed Workflows:**\n\n${list}`,
      data: { workflows },
    };
  } catch (error) {
    logger.error('WORKFLOW_SKILL', 'Error listing workflows', error);
    return {
      success: false,
      message: 'Failed to list workflows',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Trigger a workflow by name
 */
export async function triggerWorkflowAction(
  workflowName: string,
  input: Record<string, any>,
  manager: WorkflowManager
): Promise<ActionResult> {
  try {
    logger.info('WORKFLOW_SKILL', `Triggering workflow: ${workflowName}`, { input });

    const instance = await manager.triggerWorkflow(workflowName, input);

    if (!instance) {
      return {
        success: false,
        message: `Could not trigger workflow "${workflowName}". Check if it exists.`,
      };
    }

    return {
      success: true,
      message: `✅ Workflow triggered!

**Workflow:** ${workflowName}
**Instance ID:** ${instance.id}
**Status:** ${instance.status}

The workflow is now running. You can check its progress by asking "show workflow status"`,
      data: { instance },
    };
  } catch (error) {
    logger.error('WORKFLOW_SKILL', 'Error triggering workflow', error);
    return {
      success: false,
      message: 'Failed to trigger workflow',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get workflow status
 */
export async function getWorkflowStatusAction(
  workflowName: string,
  instanceId: string,
  manager: WorkflowManager
): Promise<ActionResult> {
  try {
    const instance = await manager.getInstanceStatus(workflowName, instanceId);

    if (!instance) {
      return {
        success: false,
        message: `Could not find workflow instance "${instanceId}"`,
      };
    }

    const stepsList = instance.steps
      ?.map((step) => `- Step ${step.stepId}: ${step.status}`)
      .join('\n') || 'No steps executed yet';

    return {
      success: true,
      message: `📊 **Workflow Instance Status:**

**Workflow:** ${workflowName}
**Instance ID:** ${instance.id}
**Status:** ${instance.status}
**Started:** ${new Date(instance.startedAt).toLocaleString()}

**Steps:**
${stepsList}

${instance.error ? `\n**Error:** ${instance.error}` : ''}`,
      data: { instance },
    };
  } catch (error) {
    logger.error('WORKFLOW_SKILL', 'Error getting workflow status', error);
    return {
      success: false,
      message: 'Failed to get workflow status',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflowAction(
  workflowName: string,
  manager: WorkflowManager
): Promise<ActionResult> {
  try {
    const success = await manager.deleteWorkflow(workflowName);

    if (!success) {
      return {
        success: false,
        message: `Could not delete workflow "${workflowName}"`,
      };
    }

    return {
      success: true,
      message: `✅ Workflow "${workflowName}" deleted successfully`,
    };
  } catch (error) {
    logger.error('WORKFLOW_SKILL', 'Error deleting workflow', error);
    return {
      success: false,
      message: 'Failed to delete workflow',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Detect if user is asking to create a workflow
 */
export function isWorkflowCreationRequest(text: string): boolean {
  const keywords = [
    'create workflow',
    'make automation',
    'create automation',
    'workflow for',
    'automate',
    'automation for',
    'setup workflow',
    'deploy workflow',
  ];

  return keywords.some((keyword) => text.toLowerCase().includes(keyword));
}

/**
 * Detect if user is asking for workflow management
 */
export function isWorkflowManagementRequest(text: string): string | null {
  const lower = text.toLowerCase();

  if (lower.includes('list') && lower.includes('workflow')) {
    return 'list';
  }
  if ((lower.includes('show') || lower.includes('check')) && lower.includes('status')) {
    return 'status';
  }
  if ((lower.includes('trigger') || lower.includes('run')) && lower.includes('workflow')) {
    return 'trigger';
  }
  if (lower.includes('delete') && lower.includes('workflow')) {
    return 'delete';
  }

  return null;
}
