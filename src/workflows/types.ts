/**
 * Cloudflare Workflows type definitions
 * 
 * Workflows allow you to build durable, multi-step applications on Cloudflare Workers
 * that automatically retry and persist state.
 */

export interface WorkflowDefinition {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  retryPolicy?: RetryPolicy;
  timeout?: number; // in seconds
}

export type WorkflowTrigger = 'webhook' | 'scheduled' | 'manual' | 'event';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'decision' | 'parallel' | 'http' | 'ai';
  config: Record<string, any>;
  onSuccess?: string; // next step ID
  onFailure?: string; // fallback step ID
  retries?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
}

export interface WorkflowAnalysis {
  complexity: number; // 1-50 scale
  estimatedSteps: number;
  requiresAI: boolean;
  requiresStateManagement: boolean;
  recommendedApproach: 'worker' | 'workflow' | 'hybrid';
  reasoning: string;
  estimatedCost: {
    workerApproach: string;
    workflowApproach: string;
  };
}

export interface WorkflowDeployment {
  id: string;
  name: string;
  status: 'pending' | 'deployed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
  definition: WorkflowDefinition;
  scriptName: string; // Cloudflare Worker name
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  status: 'queued' | 'running' | 'paused' | 'complete' | 'errored' | 'terminated';
  startedAt: string;
  completedAt?: string;
  steps: WorkflowStepExecution[];
  error?: string;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'retrying';
  startedAt: string;
  completedAt?: string;
  output?: any;
  error?: string;
  retryCount: number;
}

export interface WorkflowRecommendation {
  suggested: 'workflow' | 'worker';
  confidence: number; // 0-100
  reasoning: string[];
  tradeoffs: {
    workflow: string[];
    worker: string[];
  };
}
