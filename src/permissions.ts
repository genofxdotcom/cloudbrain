/**
 * Approval / permission system.
 *
 * Risk policy: destructive, sensitive, and externally-visible actions require
 * an explicit approval. Decisions are persisted so "always allow" is scoped
 * and revocable. Every approval request states:
 *   what the agent wants to do, what resource changes, the consequence,
 *   and which connected account would be used.
 */

import type { RiskLevel } from '@cloudbrain/shared';
import { randomId } from './auth.js';
import type { Env } from './env.js';

const RISK_ORDER: RiskLevel[] = ['read', 'safe', 'write', 'external', 'destructive', 'sensitive'];

export function requiresApproval(risk: RiskLevel): boolean {
  return risk === 'destructive' || risk === 'sensitive' || risk === 'external';
}

export function riskRank(risk: RiskLevel): number {
  return RISK_ORDER.indexOf(risk);
}

export interface ApprovalDecisionResult {
  approved: boolean;
  decision: 'approved_once' | 'always_allowed' | 'denied' | 'pending';
  approvalId: string;
}

/**
 * Persist an approval request and wait for the user's decision.
 * The decision arrives via the approvals API (UI) — the orchestrator polls
 * the row for a bounded time.
 */
export async function requestApproval(
  db: D1Database,
  params: {
    userId: string;
    taskId: string | null;
    toolId: string;
    summary: string;
    resource?: string;
    consequence?: string;
    accountLabel?: string;
  }
): Promise<{ approvalId: string; existingAlwaysAllowed: boolean }> {
  // Check for a standing "always allow" policy for this tool.
  const standing = await db
    .prepare(
      `SELECT id FROM approvals
       WHERE user_id = ? AND tool_id = ? AND decision = 'always_allowed' LIMIT 1`
    )
    .bind(params.userId, params.toolId)
    .first<{ id: string }>();
  if (standing) return { approvalId: standing.id, existingAlwaysAllowed: true };

  const id = randomId('apr');
  await db
    .prepare(
      `INSERT INTO approvals (id, task_id, user_id, tool_id, summary, resource, consequence, account_label, decision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
    .bind(
      id,
      params.taskId,
      params.userId,
      params.toolId,
      params.summary,
      params.resource ?? null,
      params.consequence ?? null,
      params.accountLabel ?? null
    )
    .run();
  return { approvalId: id, existingAlwaysAllowed: false };
}

/** Poll a pending approval until decided or timeout. */
export async function waitForDecision(
  db: D1Database,
  approvalId: string,
  timeoutMs = 120_000
): Promise<ApprovalDecisionResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await db
      .prepare(`SELECT decision FROM approvals WHERE id = ?`)
      .bind(approvalId)
      .first<{ decision: string }>();
    if (row) {
      if (row.decision === 'approved_once') {
        // Consume the one-shot decision.
        await db
          .prepare(`UPDATE approvals SET decision = 'denied', decided_at = datetime('now') WHERE id = ? AND decision = 'approved_once'`)
          .bind(approvalId)
          .run();
        return { approved: true, decision: 'approved_once', approvalId };
      }
      if (row.decision === 'always_allowed') {
        return { approved: true, decision: 'always_allowed', approvalId };
      }
      if (row.decision === 'denied') {
        return { approved: false, decision: 'denied', approvalId };
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { approved: false, decision: 'pending', approvalId };
}
