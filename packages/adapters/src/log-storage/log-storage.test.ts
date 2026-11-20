import { describe, it, expect, vi, afterEach } from 'vitest';
import { FakeLogStorageAdapter } from './fake-log-storage.adapter.js';
import { AzureBlobLogStorageAdapter } from './azure-blob-log-storage.adapter.js';

describe('Log Storage Adapters Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('FakeLogStorageAdapter', () => {
    it('buffers records and returns stored entries', async () => {
      const adapter = new FakeLogStorageAdapter();

      await adapter.write({
        id: 'turn-1',
        collegeId: 'sdi',
        category: 'tutor_turn',
        timestamp: new Date().toISOString(),
        payload: { role: 'student', prompt: 'test' },
      });

      expect(adapter.entries).toHaveLength(1);
      const parsed = JSON.parse(adapter.entries[0]);
      expect(parsed.id).toBe('turn-1');

      await adapter.flush();
      expect(adapter.flushCount).toBe(1);

      await adapter.close();
      expect(adapter.closed).toBe(true);
    });
  });

  describe('AzureBlobLogStorageAdapter', () => {
    it('handles unconfigured state gracefully by logging warning', async () => {
      const logMessages: string[] = [];
      const adapter = new AzureBlobLogStorageAdapter({
        logger: (msg) => logMessages.push(msg),
      });

      await adapter.write({
        id: 'turn-2',
        collegeId: 'sdi',
        category: 'tutor_turn',
        timestamp: new Date().toISOString(),
        payload: { test: true },
      });

      await adapter.flush();
      expect(logMessages.some((m) => m.includes('Azure Blob Storage adapter requires either connectionString or containerUrl'))).toBe(true);

      await adapter.close();
    });

    it('uploads log batches to Azure Blob Storage via Container SAS URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(''),
      });
      globalThis.fetch = mockFetch;

      const adapter = new AzureBlobLogStorageAdapter({
        containerUrl: 'https://mysdiaccount.blob.core.windows.net/audit-logs?sp=racwd&sig=mock-sig-123',
        batchSize: 2,
      });

      // Write 2 records to trigger immediate batch flush
      await adapter.write({
        id: 'log-1',
        collegeId: 'sdi',
        category: 'tutor_turn',
        timestamp: '2026-11-20T12:00:00.000Z',
        payload: { action: 'turn' },
      });
      await adapter.write({
        id: 'log-2',
        collegeId: 'sdi',
        category: 'tool_execution',
        timestamp: '2026-11-20T12:00:01.000Z',
        payload: { tool: 'calculator' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, req] = mockFetch.mock.calls[0];
      expect(url).toContain('https://mysdiaccount.blob.core.windows.net/audit-logs/logs/');
      expect(url).toContain('.jsonl?sp=racwd&sig=mock-sig-123');
      expect(req.method).toBe('PUT');
      expect(req.headers['x-ms-blob-type']).toBe('BlockBlob');
      expect(req.headers['Content-Type']).toContain('application/x-ndjson');

      await adapter.close();
    });

    it('signs and uploads requests via Account Connection String', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(''),
      });
      globalThis.fetch = mockFetch;

      const base64Key = Buffer.from('mock-64-byte-secret-key-for-hmac-sha256-signature-testing-12345').toString('base64');
      const connStr = `DefaultEndpointsProtocol=https;AccountName=teststorage;AccountKey=${base64Key};EndpointSuffix=core.windows.net`;

      const adapter = new AzureBlobLogStorageAdapter({
        connectionString: connStr,
        containerName: 'secure-logs',
        batchSize: 1,
      });

      await adapter.write({
        id: 'log-3',
        collegeId: 'sdi',
        category: 'emergency_escalation',
        timestamp: '2026-11-20T12:00:00.000Z',
        payload: { type: '988_referral' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, req] = mockFetch.mock.calls[0];
      expect(url).toContain('https://teststorage.blob.core.windows.net/secure-logs/logs/');
      expect(req.headers['Authorization']).toMatch(/^SharedKey teststorage:/);

      await adapter.close();
    });

    it('logs error when Azure responds with HTTP failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('AuthenticationFailed'),
      });
      globalThis.fetch = mockFetch;

      const logMessages: string[] = [];
      const adapter = new AzureBlobLogStorageAdapter({
        containerUrl: 'https://mysdiaccount.blob.core.windows.net/audit-logs?sp=racwd&sig=bad-sig',
        batchSize: 1,
        logger: (msg) => logMessages.push(msg),
      });

      await adapter.write({
        id: 'log-err',
        collegeId: 'sdi',
        category: 'tutor_turn',
        timestamp: '2026-11-20T12:00:00.000Z',
        payload: {},
      });

      expect(logMessages.some((m) => m.includes('Azure Blob Storage PUT failed with HTTP 403'))).toBe(true);

      await adapter.close();
    });
  });
});
