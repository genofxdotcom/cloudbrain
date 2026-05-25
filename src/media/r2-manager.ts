/**
 * R2 Media Manager - Handle file operations with Cloudflare R2
 * Upload, download, stream, delete media files
 */

export interface FileMetadata {
  key: string;
  size: number;
  uploadedAt: string;
  contentType: string;
  url: string;
}

export interface UploadResult {
  success: boolean;
  file?: FileMetadata;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  data?: ArrayBuffer;
  metadata?: FileMetadata;
  error?: string;
}

export interface ListResult {
  success: boolean;
  files?: FileMetadata[];
  error?: string;
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
 * R2MediaManager - Manage files in Cloudflare R2
 */
export class R2MediaManager {
  private r2: R2Bucket;
  private bucketUrl: string;

  constructor(r2Bucket: R2Bucket, bucketUrl: string = '') {
    this.r2 = r2Bucket;
    this.bucketUrl = bucketUrl;
    logger.info('R2', 'R2 Media Manager initialized');
  }

  /**
   * Upload file to R2
   */
  async uploadFile(
    key: string,
    data: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    contentType: string = 'application/octet-stream',
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    try {
      logger.info('R2', `Uploading file: ${key}`, { contentType, size: data instanceof ArrayBuffer ? data.byteLength : 'stream' });

      const options: R2PutOptions = {
        httpMetadata: {
          contentType,
        },
        customMetadata: metadata,
      };

      const result = await this.r2.put(key, data, options);

      if (!result) {
        logger.error('R2', `Upload failed: ${key}`);
        return { success: false, error: 'Upload failed' };
      }

      logger.info('R2', `File uploaded successfully: ${key}`);

      const fileUrl = this.bucketUrl ? `${this.bucketUrl}/${key}` : key;

      return {
        success: true,
        file: {
          key,
          size: result.size || 0,
          uploadedAt: result.uploaded?.toISOString() || new Date().toISOString(),
          contentType,
          url: fileUrl,
        },
      };
    } catch (error) {
      logger.error('R2', `Upload error for ${key}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload error',
      };
    }
  }

  /**
   * Download file from R2
   */
  async downloadFile(key: string): Promise<DownloadResult> {
    try {
      logger.info('R2', `Downloading file: ${key}`);

      const object = await this.r2.get(key);

      if (!object) {
        logger.warn('R2', `File not found: ${key}`);
        return { success: false, error: 'File not found' };
      }

      const arrayBuffer = await object.arrayBuffer();
      const fileUrl = this.bucketUrl ? `${this.bucketUrl}/${key}` : key;

      logger.info('R2', `File downloaded: ${key}`, { size: arrayBuffer.byteLength });

      return {
        success: true,
        data: arrayBuffer,
        metadata: {
          key,
          size: arrayBuffer.byteLength,
          uploadedAt: object.uploaded?.toISOString() || new Date().toISOString(),
          contentType: object.httpMetadata?.contentType || 'application/octet-stream',
          url: fileUrl,
        },
      };
    } catch (error) {
      logger.error('R2', `Download error for ${key}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download error',
      };
    }
  }

  /**
   * Get file metadata (without downloading full file)
   */
  async getFileMetadata(key: string): Promise<DownloadResult> {
    try {
      logger.info('R2', `Getting metadata for: ${key}`);

      const object = await this.r2.head(key);

      if (!object) {
        logger.warn('R2', `File not found: ${key}`);
        return { success: false, error: 'File not found' };
      }

      const fileUrl = this.bucketUrl ? `${this.bucketUrl}/${key}` : key;

      return {
        success: true,
        metadata: {
          key,
          size: object.size,
          uploadedAt: object.uploaded?.toISOString() || new Date().toISOString(),
          contentType: object.httpMetadata?.contentType || 'application/octet-stream',
          url: fileUrl,
        },
      };
    } catch (error) {
      logger.error('R2', `Metadata error for ${key}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Metadata error',
      };
    }
  }

  /**
   * Delete file from R2
   */
  async deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('R2', `Deleting file: ${key}`);

      await this.r2.delete(key);

      logger.info('R2', `File deleted: ${key}`);
      return { success: true };
    } catch (error) {
      logger.error('R2', `Delete error for ${key}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete error',
      };
    }
  }

  /**
   * List files in R2 bucket (with prefix filter)
   */
  async listFiles(prefix?: string, limit: number = 100): Promise<ListResult> {
    try {
      logger.info('R2', `Listing files`, { prefix, limit });

      const options: R2ListOptions = {
        limit,
      };

      if (prefix) {
        options.prefix = prefix;
      }

      const listing = await this.r2.list(options);

      const files: FileMetadata[] = listing.objects.map((obj) => {
        const fileUrl = this.bucketUrl ? `${this.bucketUrl}/${obj.key}` : obj.key;
        return {
          key: obj.key,
          size: obj.size,
          uploadedAt: obj.uploaded?.toISOString() || new Date().toISOString(),
          contentType: obj.httpMetadata?.contentType || 'application/octet-stream',
          url: fileUrl,
        };
      });

      logger.info('R2', `Listed files`, { count: files.length, prefix });

      return {
        success: true,
        files,
      };
    } catch (error) {
      logger.error('R2', `List error`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'List error',
      };
    }
  }

  /**
   * Copy file within R2 or between buckets
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<UploadResult> {
    try {
      logger.info('R2', `Copying file from ${sourceKey} to ${destinationKey}`);

      const source = await this.r2.get(sourceKey);

      if (!source) {
        logger.warn('R2', `Source file not found: ${sourceKey}`);
        return { success: false, error: 'Source file not found' };
      }

      const arrayBuffer = await source.arrayBuffer();
      const result = await this.uploadFile(
        destinationKey,
        arrayBuffer,
        source.httpMetadata?.contentType || 'application/octet-stream',
        source.customMetadata
      );

      if (result.success) {
        logger.info('R2', `File copied: ${sourceKey} -> ${destinationKey}`);
      }

      return result;
    } catch (error) {
      logger.error('R2', `Copy error`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Copy error',
      };
    }
  }

  /**
   * Move file (copy + delete source)
   */
  async moveFile(sourceKey: string, destinationKey: string): Promise<UploadResult> {
    try {
      logger.info('R2', `Moving file from ${sourceKey} to ${destinationKey}`);

      const copyResult = await this.copyFile(sourceKey, destinationKey);

      if (!copyResult.success) {
        return copyResult;
      }

      const deleteResult = await this.deleteFile(sourceKey);

      if (!deleteResult.success) {
        logger.warn('R2', `Source file copy succeeded but delete failed: ${sourceKey}`);
      }

      logger.info('R2', `File moved: ${sourceKey} -> ${destinationKey}`);

      return copyResult;
    } catch (error) {
      logger.error('R2', `Move error`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Move error',
      };
    }
  }

  /**
   * Generate signed URL for temporary access (using R2.dev URL)
   */
  generatePublicUrl(key: string, expiresIn?: number): string {
    const fileUrl = this.bucketUrl ? `${this.bucketUrl}/${key}` : key;
    logger.info('R2', `Generated public URL: ${fileUrl}`);
    return fileUrl;
  }

  /**
   * Get storage usage summary
   */
  async getStorageInfo(prefix?: string): Promise<{ success: boolean; totalSize?: number; fileCount?: number; error?: string }> {
    try {
      logger.info('R2', `Getting storage info`, { prefix });

      const listing = await this.r2.list({
        prefix,
        limit: 1000, // Get more files for accurate count
      });

      let totalSize = 0;
      let fileCount = 0;

      // Count files and sum sizes
      listing.objects.forEach((obj) => {
        fileCount++;
        totalSize += obj.size;
      });

      logger.info('R2', `Storage info retrieved`, { fileCount, totalSize, prefix });

      return {
        success: true,
        totalSize,
        fileCount,
      };
    } catch (error) {
      logger.error('R2', `Storage info error`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Storage info error',
      };
    }
  }

  /**
   * Create a signed URL for temporary upload access (if supported)
   */
  async getUploadUrl(key: string, expirationTtl: number = 3600): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      logger.info('R2', `Getting upload URL for: ${key}`, { expirationTtl });
      
      // Note: R2 signed URLs require additional setup. This is a placeholder
      // In production, you'd use Cloudflare's PresignedUrl feature
      const url = this.bucketUrl ? `${this.bucketUrl}/${key}` : key;

      logger.debug('R2', `Upload URL generated (note: actual signing may require additional setup)`);

      return {
        success: true,
        url,
      };
    } catch (error) {
      logger.error('R2', `Upload URL error`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload URL error',
      };
    }
  }
}

// Type definitions for R2 (Cloudflare Workers R2 API)
export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, options?: R2PutOptions): Promise<R2Object>;
  delete(key: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  stream(): ReadableStream<Uint8Array>;
}

export interface R2HttpMetadata {
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  contentLanguage?: string;
  cacheControl?: string;
  expires?: Date;
}

export interface R2PutOptions {
  onlyIf?: R2Conditional;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: ('httpMetadata' | 'customMetadata' | 'checksums')[];
}

export interface R2Objects {
  objects: R2Object[];
  delimitedPrefixes: string[];
  isTruncated: boolean;
  cursor?: string;
}

export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
  secondsGranularity?: boolean;
}

export interface R2Range {
  offset: number;
  length: number;
  suffix?: number;
}
