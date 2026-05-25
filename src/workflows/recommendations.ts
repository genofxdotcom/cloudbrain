/**
 * Workflow Recommendation Engine
 * Analyzes workflow requirements and suggests optimal execution method
 */

import { WorkflowCreationRequest, WorkflowSuggestion } from './types';

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

/**
 * Analyze workflow complexity
 */
function analyzeComplexity(workflow: WorkflowCreationRequest): 'simple' | 'moderate' | 'complex' {
  let complexity = 0;

  // Step count
  if (workflow.steps.length > 10) complexity += 3;
  else if (workflow.steps.length > 5) complexity += 2;
  else complexity += 1;

  // Step types
  const hasAsyncSteps = workflow.steps.some(s => s.type === 'api_call');
  const hasConditionals = workflow.steps.some(s => s.type === 'condition');
  const hasSchedules = workflow.trigger.type === 'schedule';

  if (hasAsyncSteps) complexity += 2;
  if (hasConditionals) complexity += 1;
  if (hasSchedules) complexity += 1;

  // Dependencies and error handling
  const hasComplexConfig = workflow.steps.some(s => Object.keys(s.config || {}).length > 5);
  if (hasComplexConfig) complexity += 1;

  if (complexity <= 2) return 'simple';
  if (complexity <= 4) return 'moderate';
  return 'complex';
}

/**
 * Estimate workflow execution time
 */
function estimateExecutionTime(workflow: WorkflowCreationRequest): string {
  let baseTime = 100; // ms
  let timePerStep = 50; // ms per step
  let totalTime = baseTime + workflow.steps.length * timePerStep;

  // Add extra time for async operations
  const asyncSteps = workflow.steps.filter(s => s.type === 'api_call').length;
  totalTime += asyncSteps * 300;

  if (totalTime < 500) return '<500ms';
  if (totalTime < 1000) return '<1s';
  if (totalTime < 5000) return '<5s';
  return `<${Math.ceil(totalTime / 1000)}s`;
}

/**
 * Estimate scalability
 */
function estimateScalability(workflow: WorkflowCreationRequest): string {
  const stepCount = workflow.steps.length;
  const hasAsync = workflow.steps.some(s => s.type === 'api_call');
  const isScheduled = workflow.trigger.type === 'schedule';

  if (stepCount <= 3 && !hasAsync) {
    return 'Excellent - Can handle 1000s of executions/sec';
  }

  if (stepCount <= 5 || (hasAsync && isScheduled)) {
    return 'Good - Can handle 100s of executions/sec';
  }

  if (stepCount <= 10) {
    return 'Moderate - Can handle 10s-100s of executions/sec';
  }

  return 'Limited - Best for <10 executions/sec, consider batching';
}

/**
 * Main recommendation engine
 */
export async function getWorkflowRecommendation(workflow: WorkflowCreationRequest): Promise<WorkflowSuggestion> {
  const complexity = analyzeComplexity(workflow);
  const executionTime = estimateExecutionTime(workflow);
  const scalability = estimateScalability(workflow);

  logger.debug('WORKFLOW', 'Analyzing workflow', {
    name: workflow.name,
    steps: workflow.steps.length,
    complexity,
  });

  // Decision logic
  let recommendation: 'workflow' | 'worker' | 'hybrid' = 'worker';
  let reasoning = '';
  let pros: string[] = [];
  let cons: string[] = [];

  const stepCount = workflow.steps.length;
  const hasSchedules = workflow.trigger.type === 'schedule';
  const hasApiCalls = workflow.steps.some(s => s.type === 'api_call');
  const hasConditionals = workflow.steps.some(s => s.type === 'condition');

  // ✅ RECOMMEND WORKFLOW if:
  // - Complex multi-step processes (>5 steps)
  // - Long-running operations (>30s)
  // - Scheduled/recurring workflows
  // - Complex branching logic
  // - State management needed
  // - Error recovery/retries needed

  if (
    (stepCount > 7 && hasSchedules) ||
    (stepCount > 10) ||
    (complexity === 'complex' && hasConditionals) ||
    (hasApiCalls && stepCount > 8)
  ) {
    recommendation = 'workflow';
    reasoning = 'This workflow is complex enough to benefit from Cloudflare Workflows\' native orchestration, error handling, and state management.';

    pros = [
      '✅ Built-in error handling and retries',
      '✅ State persistence across steps',
      '✅ Native support for complex branching',
      '✅ Automatic timeout and recovery',
      '✅ Better monitoring and debugging',
      '✅ Scalable for high-frequency executions',
    ];

    cons = [
      '❌ Higher latency per execution',
      '❌ More resource overhead per workflow',
      '❌ Less direct control over execution',
    ];
  }
  // ✅ RECOMMEND WORKER if:
  // - Simple workflows (<5 steps)
  // - Real-time responses needed
  // - Minimal state management
  // - Direct user interaction
  // - Cost-sensitive operations
  else if (stepCount <= 5 && complexity === 'simple') {
    recommendation = 'worker';
    reasoning = 'This simple workflow is best handled directly in a Worker for lowest latency and cost.';

    pros = [
      '✅ Lowest latency (<100ms)',
      '✅ Direct real-time execution',
      '✅ Minimal overhead',
      '✅ Best for user-facing operations',
      '✅ Lower cost per execution',
      '✅ Full control over execution flow',
    ];

    cons = [
      '❌ 30-second timeout limit',
      '❌ Must handle retries manually',
      '❌ No built-in state persistence',
      '❌ Less suitable for long-running operations',
    ];
  }
  // 🤝 RECOMMEND HYBRID if:
  // - Medium complexity workflows
  // - Mix of real-time and async operations
  // - Moderate execution frequency
  else {
    recommendation = 'hybrid';
    reasoning = 'This workflow benefits from a hybrid approach: trigger from Worker, orchestrate via Workflow for complex parts.';

    pros = [
      '✅ Best of both worlds',
      '✅ Fast user-facing operations',
      '✅ Reliable complex logic',
      '✅ Flexible scaling',
      '✅ Good balance of cost and capability',
    ];

    cons = [
      '❌ More complex to implement',
      '❌ Needs careful architecture',
      '❌ Integration complexity',
    ];
  }

  logger.info('WORKFLOW', 'Recommendation generated', {
    recommendation,
    complexity,
    estimatedTime: executionTime,
  });

  return {
    recommendation,
    reasoning,
    pros,
    cons,
    estimatedComplexity: complexity,
    executionTime,
    scalability,
  };
}

/**
 * Get quick recommendation without full analysis
 */
export function quickRecommendation(stepCount: number, hasSchedule: boolean, hasApiCalls: boolean): string {
  if (stepCount > 8 || (hasSchedule && stepCount > 5)) {
    return '🔄 **Recommended: Cloudflare Workflows** - Better for complex, long-running operations with state management';
  }

  if (stepCount <= 3) {
    return '⚡ **Recommended: Worker** - Optimal for simple, real-time operations with minimal latency';
  }

  return '🤝 **Recommended: Hybrid** - Use Worker trigger, Workflow for orchestration if needed';
}
