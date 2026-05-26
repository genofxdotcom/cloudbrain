/**
 * Comprehensive Cloudflare API Management Module
 * Handles all CRUD operations across Cloudflare services using stored credentials
 * Works exactly like Wrangler - can create, read, update, delete any resource
 */

export interface CloudflareCredentials {
  apiToken: string;
  accountId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface OperationLog {
  timestamp: Date;
  operation: string;
  resourceType: string;
  status: 'success' | 'failed' | 'pending';
  details: any;
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
 * CloudflareAPIManager - Main API interface
 * Handles all Cloudflare API operations without magic - direct API calls
 */
export class CloudflareAPIManager {
  private apiToken: string;
  private accountId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';
  private operationLog: OperationLog[] = [];

  constructor(credentials: CloudflareCredentials) {
    this.apiToken = credentials.apiToken;
    this.accountId = credentials.accountId;
    logger.info('CF_API', 'Cloudflare API Manager initialized');
  }

  /**
   * Make authenticated API request to Cloudflare
   */
  private async makeRequest<T>(
    methodOrPath: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string,
    pathOrBody?: string | any,
    bodyOrUndefined?: any
  ): Promise<ApiResponse<T>> {
    // Support both: makeRequest('/path') and makeRequest('GET', '/path', body)
    let method: string;
    let path: string;
    let body: any;

    if (methodOrPath.startsWith('/')) {
      // Called as makeRequest('/path') - default GET
      method = 'GET';
      path = methodOrPath;
      body = undefined;
    } else {
      method = methodOrPath;
      path = pathOrBody as string;
      body = bodyOrUndefined;
    }
    try {
      const url = `${this.baseUrl}${path}`;
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      logger.debug('CF_API', `${method} ${path}`);
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        logger.error('CF_API', `API error on ${method} ${path}`, data);
        return {
          success: false,
          error: data.errors?.[0]?.message || 'API request failed',
          statusCode: response.status,
        };
      }

      logger.debug('CF_API', `${method} ${path} successful`);
      return {
        success: true,
        data: data.result,
        statusCode: response.status,
      };
    } catch (error) {
      logger.error('CF_API', `Request failed for ${method} ${path}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Log operation for audit trail
   */
  private logOperation(operation: string, resourceType: string, status: 'success' | 'failed' | 'pending', details: any) {
    const log: OperationLog = {
      timestamp: new Date(),
      operation,
      resourceType,
      status,
      details,
    };
    this.operationLog.push(log);
    logger.info('AUDIT', `${operation} ${resourceType}: ${status}`, details);
  }

  // ========== ZONES / DOMAINS ==========

  /**
   * List all zones (domains)
   */
  async listZones() {
    logger.info('CF_API', 'Listing zones');
    const result = await this.makeRequest(`/zones`);
    if (result.success) {
      this.logOperation('LIST', 'ZONES', 'success', { count: result.data?.length });
    }
    return result;
  }

  /**
   * Get specific zone by name
   */
  async getZoneByName(zoneName: string) {
    logger.info('CF_API', `Getting zone: ${zoneName}`);
    const result = await this.makeRequest(`/zones?name=${zoneName}`);
    if (result.success && Array.isArray(result.data) && result.data.length > 0) {
      this.logOperation('GET', 'ZONE', 'success', { zoneName });
      return { success: true, data: result.data[0] };
    }
    this.logOperation('GET', 'ZONE', 'failed', { zoneName });
    return { success: false, error: 'Zone not found', data: null };
  }

  /**
   * Create new zone (domain)
   */
  async createZone(zoneName: string, plan: string = 'free') {
    logger.info('CF_API', `Creating zone: ${zoneName}`);
    const result = await this.makeRequest('POST', '/zones', {
      name: zoneName,
      account: { id: this.accountId },
      plan: { id: plan },
    });
    if (result.success) {
      this.logOperation('CREATE', 'ZONE', 'success', { zoneName });
    } else {
      this.logOperation('CREATE', 'ZONE', 'failed', { zoneName, error: result.error });
    }
    return result;
  }

  /**
   * Delete zone
   */
  async deleteZone(zoneId: string) {
    logger.info('CF_API', `Deleting zone: ${zoneId}`);
    const result = await this.makeRequest('DELETE', `/zones/${zoneId}`);
    if (result.success) {
      this.logOperation('DELETE', 'ZONE', 'success', { zoneId });
    } else {
      this.logOperation('DELETE', 'ZONE', 'failed', { zoneId, error: result.error });
    }
    return result;
  }

  // ========== DNS RECORDS ==========

  /**
   * List DNS records for a zone
   */
  async listDnsRecords(zoneId: string, filter?: { type?: string; name?: string }) {
    logger.info('CF_API', `Listing DNS records for zone: ${zoneId}`);
    let path = `/zones/${zoneId}/dns_records`;
    if (filter) {
      const params = new URLSearchParams();
      if (filter.type) params.append('type', filter.type);
      if (filter.name) params.append('name', filter.name);
      path += `?${params.toString()}`;
    }
    const result = await this.makeRequest(path);
    if (result.success) {
      this.logOperation('LIST', 'DNS_RECORDS', 'success', { zoneId, count: result.data?.length });
    }
    return result;
  }

  /**
   * Create DNS record
   */
  async createDnsRecord(
    zoneId: string,
    record: {
      type: string;
      name: string;
      content: string;
      ttl?: number;
      proxied?: boolean;
    }
  ) {
    logger.info('CF_API', `Creating DNS record: ${record.name}`);
    const result = await this.makeRequest('POST', `/zones/${zoneId}/dns_records`, record);
    if (result.success) {
      this.logOperation('CREATE', 'DNS_RECORD', 'success', { recordName: record.name, type: record.type });
    } else {
      this.logOperation('CREATE', 'DNS_RECORD', 'failed', { recordName: record.name, error: result.error });
    }
    return result;
  }

  /**
   * Update DNS record
   */
  async updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: Partial<{
      type: string;
      name: string;
      content: string;
      ttl: number;
      proxied: boolean;
    }>
  ) {
    logger.info('CF_API', `Updating DNS record: ${recordId}`);
    const result = await this.makeRequest('PUT', `/zones/${zoneId}/dns_records/${recordId}`, record);
    if (result.success) {
      this.logOperation('UPDATE', 'DNS_RECORD', 'success', { recordId });
    } else {
      this.logOperation('UPDATE', 'DNS_RECORD', 'failed', { recordId, error: result.error });
    }
    return result;
  }

  /**
   * Delete DNS record
   */
  async deleteDnsRecord(zoneId: string, recordId: string) {
    logger.info('CF_API', `Deleting DNS record: ${recordId}`);
    const result = await this.makeRequest('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
    if (result.success) {
      this.logOperation('DELETE', 'DNS_RECORD', 'success', { recordId });
    } else {
      this.logOperation('DELETE', 'DNS_RECORD', 'failed', { recordId, error: result.error });
    }
    return result;
  }

  // ========== WORKERS ==========

  /**
   * List Workers scripts
   */
  async listWorkers() {
    logger.info('CF_API', 'Listing Workers scripts');
    const result = await this.makeRequest(`/accounts/${this.accountId}/workers/scripts`);
    if (result.success) {
      this.logOperation('LIST', 'WORKERS', 'success', { count: result.data?.length });
    }
    return result;
  }

  /**
   * Get Worker script
   */
  async getWorker(scriptName: string) {
    logger.info('CF_API', `Getting Worker: ${scriptName}`);
    const result = await this.makeRequest(
      'GET',
      `/accounts/${this.accountId}/workers/scripts/${scriptName}`
    );
    if (result.success) {
      this.logOperation('GET', 'WORKER', 'success', { scriptName });
    }
    return result;
  }

  /**
   * Create/Deploy Worker script
   */
  async deployWorker(scriptName: string, code: string, metadata?: any) {
    logger.info('CF_API', `Deploying Worker: ${scriptName}`);
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.accountId}/workers/scripts/${scriptName}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/javascript',
          },
          body: code,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        logger.error('CF_API', `Failed to deploy Worker ${scriptName}`, error);
        this.logOperation('DEPLOY', 'WORKER', 'failed', { scriptName, error: error.errors?.[0]?.message });
        return { success: false, error: error.errors?.[0]?.message || 'Deployment failed' };
      }

      const data = await response.json();
      logger.info('CF_API', `Worker deployed: ${scriptName}`);
      this.logOperation('DEPLOY', 'WORKER', 'success', { scriptName });
      return { success: true, data: data.result };
    } catch (error) {
      logger.error('CF_API', `Worker deployment error: ${scriptName}`, error);
      this.logOperation('DEPLOY', 'WORKER', 'failed', { scriptName, error: error instanceof Error ? error.message : 'Unknown error' });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Delete Worker script
   */
  async deleteWorker(scriptName: string) {
    logger.info('CF_API', `Deleting Worker: ${scriptName}`);
    const result = await this.makeRequest(
      'DELETE',
      `/accounts/${this.accountId}/workers/scripts/${scriptName}`
    );
    if (result.success) {
      this.logOperation('DELETE', 'WORKER', 'success', { scriptName });
    } else {
      this.logOperation('DELETE', 'WORKER', 'failed', { scriptName, error: result.error });
    }
    return result;
  }

  // ========== WORKERS KV ==========

  /**
   * List KV namespaces
   */
  async listKVNamespaces() {
    logger.info('CF_API', 'Listing KV namespaces');
    const result = await this.makeRequest(`/accounts/${this.accountId}/storage/kv/namespaces`);
    if (result.success) {
      this.logOperation('LIST', 'KV_NAMESPACES', 'success', { count: result.data?.length });
    }
    return result;
  }

  /**
   * Create KV namespace
   */
  async createKVNamespace(title: string) {
    logger.info('CF_API', `Creating KV namespace: ${title}`);
    const result = await this.makeRequest('POST', `/accounts/${this.accountId}/storage/kv/namespaces`, {
      title,
    });
    if (result.success) {
      this.logOperation('CREATE', 'KV_NAMESPACE', 'success', { title });
    } else {
      this.logOperation('CREATE', 'KV_NAMESPACE', 'failed', { title, error: result.error });
    }
    return result;
  }

  /**
   * Delete KV namespace
   */
  async deleteKVNamespace(namespaceId: string) {
    logger.info('CF_API', `Deleting KV namespace: ${namespaceId}`);
    const result = await this.makeRequest(
      'DELETE',
      `/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}`
    );
    if (result.success) {
      this.logOperation('DELETE', 'KV_NAMESPACE', 'success', { namespaceId });
    } else {
      this.logOperation('DELETE', 'KV_NAMESPACE', 'failed', { namespaceId, error: result.error });
    }
    return result;
  }

  // ========== D1 DATABASE ==========

  /**
   * List D1 databases
   */
  async listD1Databases() {
    logger.info('CF_API', 'Listing D1 databases');
    const result = await this.makeRequest(`/accounts/${this.accountId}/d1/database`);
    if (result.success) {
      this.logOperation('LIST', 'D1_DATABASES', 'success', { count: result.data?.length });
    }
    return result;
  }

  /**
   * Create D1 database
   */
  async createD1Database(name: string) {
    logger.info('CF_API', `Creating D1 database: ${name}`);
    const result = await this.makeRequest('POST', `/accounts/${this.accountId}/d1/database`, {
      name,
    });
    if (result.success) {
      this.logOperation('CREATE', 'D1_DATABASE', 'success', { name });
    } else {
      this.logOperation('CREATE', 'D1_DATABASE', 'failed', { name, error: result.error });
    }
    return result;
  }

  /**
   * Execute SQL query on D1 database
   */
  async executeD1Query(databaseId: string, query: string) {
    logger.info('CF_API', `Executing query on D1 database: ${databaseId}`);
    const result = await this.makeRequest('POST', `/accounts/${this.accountId}/d1/database/${databaseId}/query`, {
      sql: query,
    });
    if (result.success) {
      this.logOperation('QUERY', 'D1_DATABASE', 'success', { databaseId });
    } else {
      this.logOperation('QUERY', 'D1_DATABASE', 'failed', { databaseId, error: result.error });
    }
    return result;
  }

  /**
   * Delete D1 database
   */
  async deleteD1Database(databaseId: string) {
    logger.info('CF_API', `Deleting D1 database: ${databaseId}`);
    const result = await this.makeRequest(
      'DELETE',
      `/accounts/${this.accountId}/d1/database/${databaseId}`
    );
    if (result.success) {
      this.logOperation('DELETE', 'D1_DATABASE', 'success', { databaseId });
    } else {
      this.logOperation('DELETE', 'D1_DATABASE', 'failed', { databaseId, error: result.error });
    }
    return result;
  }

  // ========== R2 STORAGE ==========

  /**
   * List R2 buckets
   */
  async listR2Buckets() {
    logger.info('CF_API', 'Listing R2 buckets');
    const result = await this.makeRequest(`/accounts/${this.accountId}/r2/buckets`);
    if (result.success) {
      this.logOperation('LIST', 'R2_BUCKETS', 'success', { count: result.data?.length });
    }
    return result;
  }

  /**
   * Create R2 bucket
   */
  async createR2Bucket(bucketName: string) {
    logger.info('CF_API', `Creating R2 bucket: ${bucketName}`);
    const result = await this.makeRequest('POST', `/accounts/${this.accountId}/r2/buckets`, {
      name: bucketName,
    });
    if (result.success) {
      this.logOperation('CREATE', 'R2_BUCKET', 'success', { bucketName });
    } else {
      this.logOperation('CREATE', 'R2_BUCKET', 'failed', { bucketName, error: result.error });
    }
    return result;
  }

  /**
   * Delete R2 bucket
   */
  async deleteR2Bucket(bucketName: string) {
    logger.info('CF_API', `Deleting R2 bucket: ${bucketName}`);
    const result = await this.makeRequest(
      'DELETE',
      `/accounts/${this.accountId}/r2/buckets/${bucketName}`
    );
    if (result.success) {
      this.logOperation('DELETE', 'R2_BUCKET', 'success', { bucketName });
    } else {
      this.logOperation('DELETE', 'R2_BUCKET', 'failed', { bucketName, error: result.error });
    }
    return result;
  }

  // ========== WORKERS ANALYTICS ==========

  /**
   * Get Worker analytics
   */
  async getWorkerAnalytics(scriptName: string, minutesRange: number = 60) {
    logger.info('CF_API', `Getting Worker analytics: ${scriptName}`);
    const since = Math.floor((Date.now() - minutesRange * 60000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    
    const result = await this.makeRequest(
      'GET',
      `/accounts/${this.accountId}/workers/scripts/${scriptName}/analytics?since=${since}&until=${until}`
    );
    if (result.success) {
      this.logOperation('GET', 'WORKER_ANALYTICS', 'success', { scriptName });
    }
    return result;
  }

  // ========== FIREWALL / RULES ==========

  /**
   * List firewall rules for a zone
   */
  async listFirewallRules(zoneId: string) {
    logger.info('CF_API', `Listing firewall rules for zone: ${zoneId}`);
    const result = await this.makeRequest(`/zones/${zoneId}/firewall/rules`);
    if (result.success) {
      this.logOperation('LIST', 'FIREWALL_RULES', 'success', { zoneId, count: result.data?.length });
    }
    return result;
  }

  /**
   * Create firewall rule
   */
  async createFirewallRule(zoneId: string, rule: {
    filter: { expression: string };
    action: string;
    description?: string;
  }) {
    logger.info('CF_API', `Creating firewall rule for zone: ${zoneId}`);
    const result = await this.makeRequest('POST', `/zones/${zoneId}/firewall/rules`, rule);
    if (result.success) {
      this.logOperation('CREATE', 'FIREWALL_RULE', 'success', { zoneId });
    } else {
      this.logOperation('CREATE', 'FIREWALL_RULE', 'failed', { zoneId, error: result.error });
    }
    return result;
  }

  /**
   * Delete firewall rule
   */
  async deleteFirewallRule(zoneId: string, ruleId: string) {
    logger.info('CF_API', `Deleting firewall rule: ${ruleId}`);
    const result = await this.makeRequest(
      'DELETE',
      `/zones/${zoneId}/firewall/rules/${ruleId}`
    );
    if (result.success) {
      this.logOperation('DELETE', 'FIREWALL_RULE', 'success', { ruleId });
    } else {
      this.logOperation('DELETE', 'FIREWALL_RULE', 'failed', { ruleId, error: result.error });
    }
    return result;
  }

  // ========== AUDIT LOG & HISTORY ==========

  /**
   * Get operation audit log
   */
  getOperationLog(): OperationLog[] {
    return this.operationLog;
  }

  /**
   * Get operation history summary
   */
  getOperationSummary(): string {
    const grouped = this.operationLog.reduce((acc, log) => {
      const key = `${log.operation}_${log.resourceType}`;
      if (!acc[key]) {
        acc[key] = { success: 0, failed: 0, pending: 0 };
      }
      acc[key][log.status]++;
      return acc;
    }, {} as Record<string, any>);

    return Object.entries(grouped)
      .map(([key, counts]) => `${key}: ${counts.success} success, ${counts.failed} failed, ${counts.pending} pending`)
      .join('\n');
  }

  /**
   * Clear operation log
   */
  clearOperationLog() {
    this.operationLog = [];
  }
}
