import { query } from '../db/connection';
import { ChannelManager } from '../channels/manager';
import { log } from '../utils/logger';

export type PermissionPolicy = 'ask' | 'always_approve' | 'always_deny';

export interface PermissionRequest {
  userId: string;
  channel: string;
  operation: string;
  description: string;
}

const DESTRUCTIVE_OPERATIONS = [
  'delete_worker', 'delete_kv', 'delete_database', 'delete_bucket',
  'delete_domain', 'delete_dns', 'delete_zone', 'drop_table',
  'delete_file', 'purge_cache', 'delete_cron',
];

/**
 * Permission Manager - handles approval flow for destructive operations
 */
export class PermissionManager {
  private channels: ChannelManager;
  private pendingApprovals: Map<string, { resolve: (approved: boolean) => void; timeout: NodeJS.Timeout }> = new Map();

  constructor(channels: ChannelManager) {
    this.channels = channels;
  }

  /**
   * Check if operation needs permission and handle approval flow
   */
  async checkPermission(req: PermissionRequest): Promise<boolean> {
    // Check if this is a destructive operation
    if (!this.isDestructive(req.operation)) {
      return true; // Non-destructive = always allowed
    }

    // Check saved policy
    const policy = await this.getPolicy(req.userId, req.operation);

    if (policy === 'always_approve') return true;
    if (policy === 'always_deny') return false;

    // Need to ask user
    return this.askForApproval(req);
  }

  /**
   * Ask user for permission via their channel
   */
  private async askForApproval(req: PermissionRequest): Promise<boolean> {
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const message = [
      `⚠️ Permission needed:`,
      ``,
      `${req.description}`,
      ``,
      `Reply with:`,
      `• "approve" - Execute this once`,
      `• "always" - Always approve this type`,
      `• "skip" - Don't execute`,
    ].join('\n');

    await this.channels.send(req.channel, req.userId, message);

    // Wait for response (timeout 60 seconds)
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(approvalId);
        this.channels.send(req.channel, req.userId, 'Permission request timed out. Skipping.');
        resolve(false);
      }, 60_000);

      this.pendingApprovals.set(approvalId, { resolve, timeout });

      // Store pending so message handler can resolve it
      this.storePending(req.userId, approvalId, req.operation);
    });
  }

  /**
   * Handle incoming approval response from user
   * Returns true if the message was an approval response (consumed)
   */
  async handleApprovalResponse(userId: string, text: string): Promise<boolean> {
    const pending = await this.getPending(userId);
    if (!pending) return false;

    const lower = text.toLowerCase().trim();
    const entry = this.pendingApprovals.get(pending.approvalId);

    if (!entry) {
      await this.clearPending(userId);
      return false;
    }

    clearTimeout(entry.timeout);
    this.pendingApprovals.delete(pending.approvalId);
    await this.clearPending(userId);

    if (lower === 'approve' || lower === 'yes' || lower === 'y') {
      entry.resolve(true);
      return true;
    }

    if (lower === 'always' || lower === 'always approve') {
      await this.setPolicy(userId, pending.operation, 'always_approve');
      entry.resolve(true);
      return true;
    }

    if (lower === 'skip' || lower === 'no' || lower === 'n' || lower === 'deny') {
      entry.resolve(false);
      return true;
    }

    // Not a valid response
    return false;
  }

  isDestructive(operation: string): boolean {
    return DESTRUCTIVE_OPERATIONS.some(op => operation.includes(op));
  }

  // DB helpers
  private async getPolicy(userId: string, operation: string): Promise<PermissionPolicy> {
    try {
      const rows = await query(
        'SELECT policy FROM permissions WHERE user_id = ? AND operation = ?',
        [userId, operation]
      );
      return rows.length > 0 ? rows[0].policy : 'ask';
    } catch {
      return 'ask';
    }
  }

  private async setPolicy(userId: string, operation: string, policy: PermissionPolicy): Promise<void> {
    await query(
      'INSERT INTO permissions (user_id, operation, policy) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE policy = ?',
      [userId, operation, policy, policy]
    );
    log.info('PERMS', `Policy set: ${userId} ${operation} = ${policy}`);
  }

  private async storePending(userId: string, approvalId: string, operation: string): Promise<void> {
    await query(
      'INSERT INTO system_config (`key`, `value`, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      [`pending_approval_${userId}`, JSON.stringify({ approvalId, operation }), 'Pending approval', JSON.stringify({ approvalId, operation })]
    );
  }

  private async getPending(userId: string): Promise<{ approvalId: string; operation: string } | null> {
    try {
      const rows = await query('SELECT `value` FROM system_config WHERE `key` = ?', [`pending_approval_${userId}`]);
      if (rows.length === 0) return null;
      return JSON.parse(rows[0].value);
    } catch {
      return null;
    }
  }

  private async clearPending(userId: string): Promise<void> {
    await query('DELETE FROM system_config WHERE `key` = ?', [`pending_approval_${userId}`]);
  }
}
