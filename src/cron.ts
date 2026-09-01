/**
 * Cron utilities for dynamic schedules.
 *
 * Cloudflare Cron Triggers are static (declared in wrangler.jsonc), so
 * CloudBrain uses ONE static trigger — `* * * * *` (every minute) — and fans
 * out to user-defined schedules stored in D1. `cronMatches` decides, for each
 * stored schedule, whether the current minute fires it; `nextRunAfter`
 * computes the next fire time for display.
 *
 * Supported syntax: 5-field cron with `*`, numbers, ranges (a-b), steps
 * (`*​/n`, a-b/n) and lists (a,b,c). No named months/weekdays.
 */

export interface CronField {
  values: Set<number>;
  wildcard: boolean;
}

const FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

export function parseCron(expr: string): CronField[] | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields: CronField[] = [];
  for (let i = 0; i < 5; i++) {
    const parsed = parseField(parts[i]!, FIELD_RANGES[i]![0], FIELD_RANGES[i]![1]);
    if (!parsed) return null;
    fields.push(parsed);
  }
  return fields;
}

function parseField(part: string, min: number, max: number): CronField | null {
  const values = new Set<number>();
  let sawExplicit = false;
  for (const piece of part.split(',')) {
    const stepMatch = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(piece);
    if (!stepMatch) return null;
    const isStar = stepMatch[1] === '*';
    const from = isStar ? min : Number(stepMatch[2]);
    let to = isStar ? max : stepMatch[3] !== undefined ? Number(stepMatch[3]) : Number(stepMatch[2]);
    const step = stepMatch[4] !== undefined ? Number(stepMatch[4]) : 1;
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step < 1) return null;
    if (from < min || to > max || from > to) return null;
    if (!isStar) sawExplicit = true;
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return { values, wildcard: !sawExplicit && values.size === max - min + 1 };
}

/** Does the given UTC timestamp match the cron expression? (minute resolution) */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = parseCron(expr);
  if (!fields) return false;
  const minute = fields[0]!;
  const hour = fields[1]!;
  const dom = fields[2]!;
  const month = fields[3]!;
  const dow = fields[4]!;
  return (
    minute.values.has(date.getUTCMinutes()) &&
    hour.values.has(date.getUTCHours()) &&
    month.values.has(date.getUTCMonth() + 1) &&
    dom.values.has(date.getUTCDate()) &&
    dow.values.has(date.getUTCDay())
  );
}

/** Next UTC minute ≥ `after` at which the expression fires (bounded scan). */
export function nextRunAfter(expr: string, after: Date): Date | null {
  if (!parseCron(expr)) return null;
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const limit = 366 * 24 * 60; // scan at most one year of minutes
  for (let i = 0; i < limit; i++) {
    if (cronMatches(expr, candidate)) return new Date(candidate.getTime());
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

export function isValidCron(expr: string): boolean {
  return parseCron(expr) !== null;
}
