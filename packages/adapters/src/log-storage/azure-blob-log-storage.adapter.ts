import { LogEntry, LogStoragePort } from '@virtual-ta/core';
import crypto from 'node:crypto';

export interface AzureBlobLogStorageOptions {
  /**
   * Standard Azure Storage Account connection string.
   * e.g. "DefaultEndpointsProtocol=https;AccountName=myacc;AccountKey=...;EndpointSuffix=core.windows.net"
   */
  connectionString?: string;

  /**
   * Direct Azure Blob Container URL with optional SAS token.
   * e.g. "https://myacc.blob.core.windows.net/telemetry-logs?sp=racwl&st=...&se=...&spr=https&sv=...&sr=c&sig=..."
   */
  containerUrl?: string;

  /**
   * Destination container name when using connection string. Default: "telemetry-logs".
   */
  containerName?: string;

  /**
   * Blob path prefix. Default: "logs".
   */
  blobPrefix?: string;

  /**
   * Number of items to buffer before automatically triggering a flush. Default: 50.
   */
  batchSize?: number;

  /**
   * Milliseconds between periodic background flushes. Default: 15000 (15s). Set to 0 to disable.
   */
  flushIntervalMs?: number;

  /**
   * Optional custom fetch function (useful for tests and mocking).
   */
  fetchFn?: typeof fetch;

  /**
   * Optional logging callback.
   */
  logger?: (msg: string) => void;
}

interface ParsedConnectionString {
  accountName: string;
  accountKey: string;
  endpointSuffix: string;
  protocol: string;
}

export class AzureBlobLogStorageAdapter implements LogStoragePort {
  private buffer: string[] = [];
  private connectionString?: string;
  private parsedConnStr?: ParsedConnectionString;
  private containerUrl?: string;
  private containerName: string;
  private blobPrefix: string;
  private batchSize: number;
  private fetchFn: typeof fetch;
  private logger?: (msg: string) => void;
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;

  constructor(options: AzureBlobLogStorageOptions = {}) {
    this.connectionString =
      options.connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.containerUrl =
      options.containerUrl || process.env.AZURE_STORAGE_LOG_CONTAINER_URL;
    this.containerName =
      options.containerName ||
      process.env.AZURE_STORAGE_LOG_CONTAINER ||
      'telemetry-logs';
    this.blobPrefix = options.blobPrefix || 'logs';
    this.batchSize = options.batchSize ?? 50;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.logger = options.logger;

    if (this.connectionString) {
      this.parsedConnStr = this.parseConnectionString(this.connectionString);
    }

    const intervalMs = options.flushIntervalMs ?? 15_000;
    if (intervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, intervalMs);
      this.flushTimer.unref?.();
    }
  }

  private parseConnectionString(connStr: string): ParsedConnectionString | undefined {
    const accountNameMatch = connStr.match(/AccountName=([^;]+)/);
    const accountKeyMatch = connStr.match(/AccountKey=([^;]+)/);
    const suffixMatch = connStr.match(/EndpointSuffix=([^;]+)/);
    const protocolMatch = connStr.match(/DefaultEndpointsProtocol=([^;]+)/);

    if (accountNameMatch && accountKeyMatch) {
      return {
        accountName: accountNameMatch[1],
        accountKey: accountKeyMatch[1],
        endpointSuffix: suffixMatch ? suffixMatch[1] : 'core.windows.net',
        protocol: protocolMatch ? protocolMatch[1] : 'https',
      };
    }
    return undefined;
  }

  async write(entry: string | LogEntry): Promise<void> {
    const line = typeof entry === 'string' ? entry : JSON.stringify(entry);
    this.buffer.push(line);

    if (this.buffer.length >= this.batchSize && !this.isFlushing) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    const payload = batch.join('\n') + '\n';

    try {
      await this.uploadBatch(payload);
      this.logger?.(`Successfully uploaded batch of ${batch.length} logs to Azure Storage.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.(`Failed to upload log batch to Azure Storage: ${msg}`);
      // Re-queue items at head of buffer if buffer isn't excessively large
      if (this.buffer.length < 500) {
        this.buffer.unshift(...batch);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async uploadBatch(payload: string): Promise<void> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString().replace(/[:.]/g, '-');
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const blobName = `${this.blobPrefix}/${dateStr}/telemetry-${timeStr}-${randomSuffix}.jsonl`;

    const payloadBuffer = Buffer.from(payload, 'utf8');

    if (this.containerUrl) {
      // Approach A: SAS URL or Direct Container URL
      let targetUrl: string;
      const questionIndex = this.containerUrl.indexOf('?');
      if (questionIndex !== -1) {
        const baseUrl = this.containerUrl.slice(0, questionIndex).replace(/\/+$/, '');
        const sasToken = this.containerUrl.slice(questionIndex);
        targetUrl = `${baseUrl}/${blobName}${sasToken}`;
      } else {
        targetUrl = `${this.containerUrl.replace(/\/+$/, '')}/${blobName}`;
      }

      const response = await this.fetchFn(targetUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-version': '2023-11-03',
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Length': String(payloadBuffer.length),
        },
        body: payloadBuffer,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Azure Blob Storage PUT failed with HTTP ${response.status}: ${text}`);
      }
      return;
    }

    if (this.parsedConnStr) {
      // Approach B: Connection string with SharedKey authentication
      const { accountName, accountKey, endpointSuffix, protocol } = this.parsedConnStr;
      const targetUrl = `${protocol}://${accountName}.blob.${endpointSuffix}/${this.containerName}/${blobName}`;
      const dateHeader = new Date().toUTCString();

      // Azure Blob Storage SharedKey CanonicalizedHeaders (must be lexicographically ordered, lowercase key)
      const canonicalizedHeaders = [
        `x-ms-blob-type:BlockBlob`,
        `x-ms-date:${dateHeader}`,
        `x-ms-version:2023-11-03`,
      ].join('\n');

      const canonicalizedResource = `/${accountName}/${this.containerName}/${blobName}`;

      const stringToSign = [
        'PUT',
        '', // Content-Encoding
        '', // Content-Language
        String(payloadBuffer.length), // Content-Length
        '', // Content-MD5
        'application/x-ndjson; charset=utf-8', // Content-Type
        '', // Date
        '', // If-Modified-Since
        '', // If-Match
        '', // If-None-Match
        '', // If-Unmodified-Since
        '', // Range
        canonicalizedHeaders,
        canonicalizedResource,
      ].join('\n');

      const signature = crypto
        .createHmac('sha256', Buffer.from(accountKey, 'base64'))
        .update(stringToSign, 'utf8')
        .digest('base64');

      const response = await this.fetchFn(targetUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-date': dateHeader,
          'x-ms-version': '2023-11-03',
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Length': String(payloadBuffer.length),
          Authorization: `SharedKey ${accountName}:${signature}`,
        },
        body: payloadBuffer,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Azure Blob Storage PUT failed with HTTP ${response.status}: ${text}`);
      }
      return;
    }

    throw new Error('Azure Blob Storage adapter requires either connectionString or containerUrl.');
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }
}
