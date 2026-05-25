/**
 * Workflows vs Workers Decision Engine
 * Recommends the best automation approach based on requirements
 */

export interface AutomationRequirements {
  complexity: 'simple' | 'moderate' | 'complex';
  steps: number;
  triggers: string[];
  actions: string[];
  schedule?: string;
  conditional?: boolean;
  externalApis?: number;
  dataProcessing?: 'minimal' | 'moderate' | 'heavy';
  dependencies?: string[];
}

export interface RecommendedApproach {
  recommended: 'workflow' | 'worker' | 'hybrid';
  confidence: number;
  reasoning: string[];
  tradeoffs: {
    workflow: string;
    worker: string;
  };
  implementationGuide: string;
  exampleCode?: string;
  estimatedCost?: number;
  estimatedLatency?: number; // in milliseconds
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
 * Workflow/Worker Decision Engine
 */
export class WorkflowDecisionEngine {
  /**
   * Analyze requirements and recommend approach
   */
  static analyzeRequirements(requirements: AutomationRequirements): RecommendedApproach {
    logger.info('DECISION', 'Analyzing automation requirements', { complexity: requirements.complexity, steps: requirements.steps });

    let workflowScore = 0;
    let workerScore = 0;
    const reasoning: string[] = [];

    // ===== WORKFLOW SCORING =====

    // Simple operations are great for Workflows
    if (requirements.complexity === 'simple') {
      workflowScore += 3;
      reasoning.push('Simple requirements are ideal for Workflows');
    }

    // Multi-step sequential processes
    if (requirements.steps > 2) {
      workflowScore += 2;
      reasoning.push('Multiple sequential steps suit Workflows design');
    }

    // Scheduled/recurring tasks
    if (requirements.schedule) {
      workflowScore += 3;
      reasoning.push('Scheduled triggers are native to Workflows');
    }

    // Simple triggers (webhook, schedule, etc.)
    if (requirements.triggers.length <= 2) {
      workflowScore += 1;
      reasoning.push('Single/simple triggers work well with Workflows');
    }

    // Conditional logic
    if (requirements.conditional) {
      workflowScore += 1;
      reasoning.push('Built-in conditional support in Workflows');
    }

    // Minimal external API calls
    if ((requirements.externalApis || 0) <= 3) {
      workflowScore += 1;
      reasoning.push('Limited external API calls are manageable in Workflows');
    }

    // ===== WORKER SCORING =====

    // Complex operations need Workers
    if (requirements.complexity === 'complex') {
      workerScore += 3;
      reasoning.push('Complex logic requires Workers flexibility');
    }

    // Heavy data processing
    if (requirements.dataProcessing === 'heavy') {
      workerScore += 2;
      reasoning.push('Heavy data processing better suited for Workers');
    }

    // Many external APIs
    if ((requirements.externalApis || 0) > 5) {
      workerScore += 2;
      reasoning.push('Multiple external API integrations benefit from Workers');
    }

    // Custom logic/transformations
    if (requirements.actions.some((a) => a.includes('custom') || a.includes('transform'))) {
      workerScore += 2;
      reasoning.push('Custom transformations require Workers programming');
    }

    // Real-time processing needs
    if (requirements.triggers.some((t) => t.includes('real-time') || t.includes('stream'))) {
      workerScore += 2;
      reasoning.push('Real-time processing requires Workers capability');
    }

    // ===== HYBRID SCORING =====

    const hybridScore = Math.abs(workflowScore - workerScore);
    if (hybridScore < 2) {
      reasoning.push('Close match suggests hybrid approach could work');
    }

    // ===== DETERMINE RECOMMENDATION =====

    let recommended: 'workflow' | 'worker' | 'hybrid';
    let confidence: number;

    if (workflowScore > workerScore + 2) {
      recommended = 'workflow';
      confidence = Math.min(0.95, 0.6 + workflowScore / 10);
    } else if (workerScore > workflowScore + 2) {
      recommended = 'worker';
      confidence = Math.min(0.95, 0.6 + workerScore / 10);
    } else {
      recommended = 'hybrid';
      confidence = 0.7;
    }

    logger.info('DECISION', `Recommendation: ${recommended}`, { confidence, workflowScore, workerScore });

    return {
      recommended,
      confidence,
      reasoning,
      tradeoffs: {
        workflow: this.getWorkflowTradeoffs(requirements),
        worker: this.getWorkerTradeoffs(requirements),
      },
      implementationGuide: this.getImplementationGuide(recommended, requirements),
      exampleCode: this.getExampleCode(recommended, requirements),
      estimatedCost: this.estimateCost(recommended, requirements),
      estimatedLatency: this.estimateLatency(recommended, requirements),
    };
  }

  /**
   * Get Workflow tradeoffs
   */
  private static getWorkflowTradeoffs(requirements: AutomationRequirements): string {
    const tradeoffs = [];

    if (requirements.complexity === 'complex') {
      tradeoffs.push('May require breaking complex logic into simpler steps');
    }

    if ((requirements.externalApis || 0) > 3) {
      tradeoffs.push('Limited support for many sequential external API calls');
    }

    if (requirements.dataProcessing === 'heavy') {
      tradeoffs.push('Less suitable for heavy data transformation');
    }

    if (!tradeoffs.length) {
      tradeoffs.push('Limited by no-code/low-code paradigm - cannot write custom business logic');
    }

    return tradeoffs.join(' | ');
  }

  /**
   * Get Worker tradeoffs
   */
  private static getWorkerTradeoffs(requirements: AutomationRequirements): string {
    const tradeoffs = [];

    if (requirements.complexity === 'simple') {
      tradeoffs.push('Overkill for simple automation - requires code');
    }

    if (requirements.schedule && !requirements.triggers.some((t) => t.includes('http'))) {
      tradeoffs.push('Scheduling requires additional setup or third-party services');
    }

    if (requirements.steps <= 2) {
      tradeoffs.push('Might be overcomplicated for just 1-2 steps');
    }

    if (!tradeoffs.length) {
      tradeoffs.push('Requires writing and maintaining code');
    }

    return tradeoffs.join(' | ');
  }

  /**
   * Get implementation guide
   */
  private static getImplementationGuide(approach: 'workflow' | 'worker' | 'hybrid', requirements: AutomationRequirements): string {
    let guide = '';

    if (approach === 'workflow') {
      guide = `
**WORKFLOW IMPLEMENTATION GUIDE:**

1. **Create Workflow in Cloudflare Dashboard**
   - Go to Workflows → Create New
   - Define your trigger: ${requirements.triggers.join(', ')}
   - Add steps: ${requirements.steps} steps recommended

2. **Configure Triggers**
   - Schedule: ${requirements.schedule || 'None specified'}
   - Event-based: ${requirements.triggers.length > 1 ? 'Yes' : 'No'}

3. **Add Steps**
   - Step 1: ${requirements.actions[0] || 'Trigger'}
   - Step 2+: ${requirements.actions.slice(1).join(', ')}

4. **Test & Deploy**
   - Run test execution
   - Monitor logs
   - Deploy to production

5. **Monitoring**
   - Check execution logs
   - Set up alerts for failures
   - Track performance metrics
      `;
    } else if (approach === 'worker') {
      guide = `
**WORKER IMPLEMENTATION GUIDE:**

1. **Initialize Worker Project**
   \`\`\`bash
   wrangler generate my-automation
   cd my-automation
   \`\`\`

2. **Write Handler Code**
   - Implement trigger handler
   - Add business logic: ${requirements.actions.join(', ')}
   - Handle external API calls: ${requirements.externalApis || 0} integrations

3. **Add Bindings (if needed)**
   - KV for state
   - D1 for database
   - Queues for async tasks

4. **Deploy**
   \`\`\`bash
   wrangler deploy
   \`\`\`

5. **Monitor & Update**
   - View real-time logs: \`wrangler tail\`
   - Update as needed
   - Version control your code
      `;
    } else {
      guide = `
**HYBRID IMPLEMENTATION GUIDE:**

1. **Use Workflow for Orchestration**
   - Define main workflow with triggers
   - Connect steps: ${requirements.steps} steps

2. **Use Workers for Complex Steps**
   - Create Worker for complex logic
   - Call Worker from Workflow step
   - Handle heavy processing: ${requirements.dataProcessing}

3. **Integration Points**
   - Trigger Workflow → Executes Worker Step → Returns Result
   - Workers handle: ${requirements.actions.filter((a) => a.includes('complex') || a.includes('custom')).join(', ')}
   - Workflow handles: orchestration and simple transforms

4. **Deploy Both**
   - Deploy Workflow in Dashboard
   - Deploy Worker: \`wrangler deploy\`

5. **Troubleshooting**
   - Check Workflow logs
   - Check Worker logs: \`wrangler tail\`
   - Verify integration points
      `;
    }

    return guide;
  }

  /**
   * Get example code
   */
  private static getExampleCode(approach: 'workflow' | 'worker' | 'hybrid', requirements: AutomationRequirements): string {
    if (approach === 'workflow') {
      return `
// Workflow YAML Definition
name: my-workflow
description: Automated process
triggers:
  - type: ${requirements.triggers[0] || 'http'}
    path: /webhook

steps:
  ${requirements.actions.map((action, i) => `- name: step_${i}\n    type: ${action}`).join('\n  ')}

on_failure:
  - type: notify
    channel: telegram
`;
    } else if (approach === 'worker') {
      return `
// Worker Script (TypeScript)
export default {
  async fetch(request: Request, env: Env) {
    try {
      // Step 1: ${requirements.actions[0] || 'Process'}
      const input = await request.json();
      
      // Step 2+: ${requirements.actions.slice(1).join(', ')}
      const result = await processData(input);
      
      // Return result
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }
};

async function processData(input: any) {
  // Your custom logic here
  return input;
}
`;
    } else {
      return `
// Hybrid: Workflow + Worker
// Workflow calls Worker for complex step

// Worker: src/worker.ts
export async function handleComplexStep(data: any) {
  // Complex business logic
  return transform(data);
}

// Workflow YAML
steps:
  - name: pre_process
    type: transform
  
  - name: complex_operation
    type: call_worker
    worker: my-worker
    endpoint: /complex-step
  
  - name: post_process
    type: transform
`;
    }
  }

  /**
   * Estimate cost (very rough estimates)
   */
  private static estimateCost(approach: 'workflow' | 'worker' | 'hybrid', requirements: AutomationRequirements): number {
    // Cost per execution in USD
    if (approach === 'workflow') {
      // Workflows: $0.02 per execution + $0.50 per million steps
      return 0.02 + (requirements.steps * 1000 * 0.5) / 1000000;
    } else if (approach === 'worker') {
      // Workers: $0.50 per million requests
      return 0.5 / 1000000;
    } else {
      // Hybrid: Cost of both
      return (0.02 + requirements.steps * 0.5 / 1000000) + 0.5 / 1000000;
    }
  }

  /**
   * Estimate latency
   */
  private static estimateLatency(approach: 'workflow' | 'worker' | 'hybrid', requirements: AutomationRequirements): number {
    // Latency in milliseconds
    if (approach === 'workflow') {
      // Workflows add latency per step + external calls
      return 100 + requirements.steps * 50 + (requirements.externalApis || 0) * 500;
    } else if (approach === 'worker') {
      // Workers are faster
      return 50 + (requirements.externalApis || 0) * 500;
    } else {
      // Hybrid: workflow orchestration + worker execution
      return 150 + requirements.steps * 30 + (requirements.externalApis || 0) * 500;
    }
  }

  /**
   * Get quick recommendation based on description
   */
  static recommendFromDescription(description: string): 'workflow' | 'worker' | 'hybrid' {
    const lower = description.toLowerCase();

    // Workflow indicators
    if (
      lower.includes('scheduled') ||
      lower.includes('recurring') ||
      lower.includes('daily') ||
      lower.includes('hourly') ||
      lower.includes('simple') ||
      lower.includes('webhook') ||
      lower.includes('if-then')
    ) {
      return 'workflow';
    }

    // Worker indicators
    if (
      lower.includes('complex') ||
      lower.includes('real-time') ||
      lower.includes('custom') ||
      lower.includes('algorithm') ||
      lower.includes('transform') ||
      lower.includes('stream')
    ) {
      return 'worker';
    }

    // Default to hybrid for moderate complexity
    return 'hybrid';
  }

  /**
   * Format recommendation for display
   */
  static formatRecommendation(rec: RecommendedApproach): string {
    let display = `🎯 **Recommendation: ${rec.recommended.toUpperCase()}** (${Math.round(rec.confidence * 100)}% confidence)\n\n`;

    display += '**Why this approach:**\n';
    rec.reasoning.forEach((r) => {
      display += `• ${r}\n`;
    });

    display += '\n**Workflow Considerations:**\n';
    display += `⚠️ ${rec.tradeoffs.workflow}\n`;

    display += '\n**Worker Considerations:**\n';
    display += `⚠️ ${rec.tradeoffs.worker}\n`;

    display += `\n**Estimated Cost:** $${rec.estimatedCost?.toFixed(6)} per execution\n`;
    display += `**Estimated Latency:** ${rec.estimatedLatency}ms\n`;

    return display;
  }
}
