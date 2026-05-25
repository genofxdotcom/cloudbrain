/**
 * Workflow Types and Interfaces
 * Defines all workflow-related data structures
 */

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'trigger' | 'condition' | 'api_call' | 'schedule';
  description: string;
  config: Record<string, any>;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
}

export interface WorkflowTrigger {
  type: 'message' | 'schedule' | 'webhook' | 'manual';
  conditions?: Record<string, any>;
  channels?: string[]; // telegram, discord, whatsapp
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  metadata?: {
    author?: string;
    tags?: string[];
    executionCount?: number;
    lastExecuted?: number;
    errorCount?: number;
  };
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  result?: any;
  error?: string;
  stepResults: Map<string, any>;
}

export interface WorkflowSuggestion {
  recommendation: 'workflow' | 'worker' | 'hybrid';
  reasoning: string;
  pros: string[];
  cons: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  executionTime?: string;
  scalability?: string;
}

export interface WorkflowCreationRequest {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  useNativeWorkflow?: boolean; // Use Cloudflare Workflows if true
}
