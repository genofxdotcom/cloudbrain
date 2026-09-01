/**
 * Scheduler — dynamic cron schedules on a static trigger.
 *
 * wrangler.jsonc declares exactly one cron trigger (`* * * * *`). Each fire,
 * this module:
 *   1. loads enabled schedules,
 *   2. fires those whose cron expression matches the current UTC minute
 *      (last_run_at guard prevents double-fires),
 *   3. runs the schedule prompt through the agent orchestrator,
 *   4. records a row in schedule_runs and updates last_run_at / next_run_at.
 *
 * Errors are captured per-schedule so one failing automation never blocks the
 * rest of the batch.
 */

import type { Env } from './env.js';
import { cronMatches, nextRunAfter } from './cron.js';
import { ModelGateway } from './models.js';
import { AgentOrchestrator } from './agent.js';
import { IntegrationProvider } from '@cloudbrain/integrations';
import { randomId } from './auth.js';

interface ScheduleRow {
  id: string;
  user_id: string;
  name: string;
  cron: string;
  timezone: string;
  prompt: string;
  mode: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

export async function runDueSchedules(env: Env): Promise<void> {
  let schedules: ScheduleRow[];
  try {
    const result = await env.DB.prepare(
      `SELECT id, user_id, name, cron, timezone, prompt, mode, last_run_at, next_run_at
       FROM schedules WHERE enabled = 1`
    ).all<ScheduleRow>();
    schedules = result.results ?? [];
  } catch {
    return; // DB not migrated yet — nothing to do
  }

  const now = new Date();
  const nowIso = now.toISOString();

  for (const schedule of schedules) {
    try {
      // UTC-minute match + guard against double fire within the same minute.
      if (!cronMatches(schedule.cron, now)) continue;
      if (schedule.last_run_at) {
        const last = new Date(schedule.last_run_at);
        if (!Number.isNaN(last.getTime()) && sameUtcMinute(last, now)) continue;
      }

      const runId = await startRun(env, schedule.id);
      const outcome = await executeSchedule(env, schedule);
      await finishRun(env, runId, outcome.error ?? null);
      await updateAfterRun(env, schedule, nowIso, outcome.error ?? null);
    } catch (err) {
      // Never let one schedule break the batch; record best-effort.
      await recordRunFailure(env, schedule.id, err).catch(() => undefined);
    }
  }
}

function sameUtcMinute(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate() &&
    a.getUTCHours() === b.getUTCHours() &&
    a.getUTCMinutes() === b.getUTCMinutes()
  );
}

async function startRun(env: Env, scheduleId: string): Promise<string> {
  const runId = randomId('run');
  await env.DB.prepare(
    `INSERT INTO schedule_runs (id, schedule_id, status) VALUES (?, ?, 'running')`
  )
    .bind(runId, scheduleId)
    .run()
    .catch(() => undefined);
  return runId;
}

interface RunOutcome {
  text?: string;
  error?: string;
}

async function executeSchedule(env: Env, schedule: ScheduleRow): Promise<RunOutcome> {
  try {
    const orchestrator = new AgentOrchestrator(
      env,
      new ModelGateway(env),
      new IntegrationProvider({ COMPOSIO_API_KEY: env.COMPOSIO_API_KEY })
    );
    const result = await orchestrator.run({
      userId: schedule.user_id,
      conversationId: randomId('sch'), // throwaway conversation; messages persist via publish
      mode: schedule.mode === 'quick' || schedule.mode === 'deep' ? schedule.mode : 'agent',
      model: 'workers-ai/llama-3.3-70b-instruct-fp8-fast',
      userMessage: schedule.prompt,
      projectId: null,
      history: [],
      memories: [],
      projectInstructions: null,
      connectedToolkits: [],
      publish: async () => undefined, // scheduled runs have no live WS client
    });
    return { text: result.text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function finishRun(env: Env, runId: string, error: string | null): Promise<void> {
  await env.DB.prepare(
    `UPDATE schedule_runs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?`
  )
    .bind(error ? 'failed' : 'succeeded', error, runId)
    .run()
    .catch(() => undefined);
}

async function updateAfterRun(env: Env, schedule: ScheduleRow, ranAt: string, error: string | null): Promise<void> {
  const next = nextRunAfter(schedule.cron, new Date(ranAt));
  await env.DB.prepare(
    `UPDATE schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?`
  )
    .bind(ranAt, next?.toISOString() ?? null, schedule.id)
    .run()
    .catch(() => undefined);
  void error; // already recorded on schedule_runs
}

async function recordRunFailure(env: Env, scheduleId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await env.DB.prepare(
    `INSERT INTO schedule_runs (id, schedule_id, status, error, finished_at)
     VALUES (?, ?, 'failed', ?, datetime('now'))`
  )
    .bind(randomId('run'), scheduleId, message.slice(0, 500))
    .run()
    .catch(() => undefined);
}
