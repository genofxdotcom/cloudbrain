/**
 * Workflow Analysis and Recommendation Engine
 * 
 * Analyzes task complexity and recommends whether to use:
 * - Cloudflare Workflows (for complex, multi-step, stateful tasks)
 * - Cloudflare Workers (for simple, single-step tasks)
 * - Hybrid (combines both)
 */

import { WorkflowAnalysis, WorkflowRecommendation } from './types';
import { ParsedIntent } from '../types';

interface TaskCharacteristics {
  description: string;
  intent: ParsedIntent;
  parameters: Record<string, any>;
}

/**
 * Analyze task and recommend approach
 */
export function analyzeTask(task: TaskCharacteristics): WorkflowAnalysis {
  let recommendedApproach: 'worker' | 'workflow' | 'hybrid' = 'worker';
  let reasoning = '';

  const complexity = calculateComplexity(task);
  const estimatedSteps = estimateSteps(task);
  const requiresAI = detectAIRequirement(task);
  const requiresStateManagement = detectStateManagement(task);

  // Determine recommended approach based on complexity
  if (complexity <= 15) {
    recommendedApproach = 'worker';
    reasoning =
      'Task is simple enough for a single Worker. Lower latency and immediate response.';
  } else if (complexity <= 35) {
    recommendedApproach = 'hybrid';
    reasoning =
      'Task has moderate complexity. Worker handles immediate response, Workflow manages background processing.';
  } else {
    recommendedApproach = 'workflow';
    reasoning =
      'Task is complex with multiple steps and state management needs. Workflow provides durability, retries, and state persistence.';
  }

  const analysis: WorkflowAnalysis = {
    complexity,
    estimatedSteps,
    requiresAI,
    requiresStateManagement,
    recommendedApproach,
    reasoning,
    estimatedCost: {
      workerApproach: estimateCost('worker', complexity, estimatedSteps),
      workflowApproach: estimateCost('workflow', complexity, estimatedSteps),
    },
  };

  return analysis;
}

/**
 * Get detailed recommendation
 */
export function getRecommendation(analysis: WorkflowAnalysis): WorkflowRecommendation {
  const suggested = analysis.recommendedApproach === 'hybrid'
    ? 'workflow' // Prefer workflow for hybrid since it's more capable
    : analysis.recommendedApproach;

  const confidence = Math.min(100, 60 + (analysis.complexity / 50) * 40);

  const reasoning: string[] = [];
  reasoning.push(`Complexity Score: ${analysis.complexity}/50`);
  reasoning.push(`Estimated Steps: ${analysis.estimatedSteps}`);

  if (analysis.requiresAI) {
    reasoning.push('Requires AI processing - good fit for Workflows');
  }

  if (analysis.requiresStateManagement) {
    reasoning.push('Requires state persistence - Workflows provide built-in state management');
  }

  if (analysis.estimatedSteps > 1) {
    reasoning.push(`Multi-step task (${analysis.estimatedSteps} steps) - benefits from Workflow orchestration`);
  }

  const tradeoffs = {
    workflow: [
      '✓ Automatic retries and error handling',
      '✓ Built-in state persistence',
      '✓ Can handle long-running tasks',
      '✓ Better for complex logic',
      '✗ Slightly higher latency',
      '✗ Additional cost per step',
    ],
    worker: [
      '✓ Lower latency (immediate response)',
      '✓ Cheaper for simple tasks',
      '✓ Simpler to deploy',
      '✗ No automatic retries',
      '✗ No state persistence',
      '✗ 30-second timeout limit',
    ],
  };

  return {
    suggested,
    confidence,
    reasoning,
    tradeoffs,
  };
}

/**
 * Calculate task complexity (1-50 scale)
 */
function calculateComplexity(task: TaskCharacteristics): number {
  let complexity = 5; // Base complexity

  const description = task.description.toLowerCase();
  const intent = task.intent.action.toLowerCase();

  // Add complexity based on keywords
  const complexityKeywords: Record<string, number> = {
    'loop': 5,
    'repeat': 5,
    'daily': 3,
    'hourly': 3,
    'every': 3,
    'schedule': 5,
    'workflow': 8,
    'process': 5,
    'pipeline': 10,
    'chain': 8,
    'multiple': 6,
    'batch': 7,
    'parallel': 8,
    'concurrent': 8,
    'database': 4,
    'kv': 3,
    'storage': 3,
    'api': 4,
    'http': 3,
    'webhook': 3,
    'ai': 6,
    'analyze': 4,
    'review': 4,
    'aggregate': 6,
    'transform': 5,
    'validate': 4,
    'error': 3,
    'retry': 4,
    'fallback': 4,
  };

  for (const [keyword, score] of Object.entries(complexityKeywords)) {
    if (description.includes(keyword) || intent.includes(keyword)) {
      complexity += score;
    }
  }

  // Add complexity based on parameter count
  const paramCount = Object.keys(task.parameters).length;
  complexity += Math.min(paramCount, 5);

  // Cap at 50
  return Math.min(50, complexity);
}

/**
 * Estimate number of steps needed
 */
function estimateSteps(task: TaskCharacteristics): number {
  const description = task.description.toLowerCase();
  let steps = 1;

  // Keywords that indicate multiple steps
  const multiStepKeywords = ['then', 'after', 'next', 'followed', 'pipeline', 'chain', 'and then'];
  for (const keyword of multiStepKeywords) {
    const matches = description.match(new RegExp(keyword, 'g')) || [];
    steps += matches.length;
  }

  // Count commas as potential step separators
  const commaCount = (description.match(/,/g) || []).length;
  steps += Math.floor(commaCount / 2);

  return Math.max(1, Math.min(steps, 10));
}

/**
 * Detect if task requires AI
 */
function detectAIRequirement(task: TaskCharacteristics): boolean {
  const keywords = ['analyze', 'review', 'ai', 'ml', 'model', 'classification', 'sentiment', 'summarize'];
  const description = task.description.toLowerCase();
  return keywords.some(keyword => description.includes(keyword));
}

/**
 * Detect if task requires state management
 */
function detectStateManagement(task: TaskCharacteristics): boolean {
  const keywords = ['state', 'persist', 'save', 'store', 'database', 'memory', 'context', 'history'];
  const description = task.description.toLowerCase();
  return keywords.some(keyword => description.includes(keyword));
}

/**
 * Estimate cost
 */
function estimateCost(approach: 'worker' | 'workflow', complexity: number, steps: number): string {
  if (approach === 'worker') {
    const baseCost = 0.5; // $0.50 per 1M requests
    const estimate = (complexity / 50) * baseCost * (steps / 1);
    return `~$${estimate.toFixed(3)}/1M requests (lower latency)`;
  } else {
    // Workflow costs vary based on steps
    const costPerStep = 0.15; // estimated
    const total = costPerStep * steps;
    return `~$${total.toFixed(2)}/1M requests (includes retries & state)`;
  }
}

/**
 * Generate workflow definition suggestion from parsed intent
 */
export function suggestWorkflowDefinition(intent: ParsedIntent, analysis: WorkflowAnalysis) {
  return {
    name: generateWorkflowName(intent.action),
    description: `Workflow for: ${intent.action}`,
    trigger: 'webhook' as const,
    steps: generateSuggestedSteps(intent, analysis.estimatedSteps),
    retryPolicy: {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000,
    },
    timeout: Math.max(30, analysis.estimatedSteps * 10),
  };
}

/**
 * Generate workflow name from intent
 */
function generateWorkflowName(action: string): string {
  return `wf-${action.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
}

/**
 * Generate suggested workflow steps
 */
function generateSuggestedSteps(intent: ParsedIntent, stepCount: number) {
  const steps: any[] = [];

  // Always start with validation
  steps.push({
    id: 'validate',
    name: 'Validate Input',
    type: 'action' as const,
    config: { validate: true },
    onSuccess: stepCount > 1 ? 'process-1' : 'complete',
    onFailure: 'error-handler',
  });

  // Add processing steps
  for (let i = 1; i <= Math.min(stepCount - 1, 5); i++) {
    const stepType: 'action' | 'ai' = intent.action.toLowerCase().includes('ai') ? 'ai' : 'action';
    steps.push({
      id: `process-${i}`,
      name: `Process Step ${i}`,
      type: stepType,
      config: {
        action: intent.action,
        params: intent.parameters,
      },
      onSuccess: i < stepCount ? `process-${i + 1}` : 'complete',
      onFailure: 'error-handler',
    });
  }

  // Add completion step
  steps.push({
    id: 'complete',
    name: 'Complete',
    type: 'action' as const,
    config: { status: 'completed' },
  });

  // Add error handler
  steps.push({
    id: 'error-handler',
    name: 'Handle Error',
    type: 'action' as const,
    config: { notifyUser: true },
  });

  return steps;
}
