import { describe, it, expect } from 'vitest';
import {
  TutorEngine,
  createStandardToolRegistry,
  CrisisIncident,
} from '@ai-tutor/core';
import { PrivacyTelemetryAdapter } from '../telemetry/privacy-telemetry.adapter.js';
import { WebhookCrisisAlertAdapter } from '../crisis/webhook-crisis-alert.adapter.js';
import { FakeCrisisAlertAdapter } from '../crisis/fake-crisis-alert.adapter.js';
import { FakeLogStorageAdapter } from '../log-storage/fake-log-storage.adapter.js';
import { AzureBlobLogStorageAdapter } from '../log-storage/azure-blob-log-storage.adapter.js';
import { FakeModerationAdapter } from '../fake/fake-moderation.adapter.js';
import { InMemoryPersistenceAdapter } from '../fake/in-memory-persistence.adapter.js';
import { FakeLlmAdapter } from '../fake/fake-llm.adapter.js';
import { FakeLmsAdapter } from '../fake/fake-lms.adapter.js';
import { FakeIdentityAdapter } from '../fake/fake-identity.adapter.js';
import { InProcessCalculatorAdapter } from '../fake/in-process-calculator.adapter.js';
import { SDI_COLLEGE_CONFIG } from '../config/sdi.config.js';

describe('Privacy-Preserving Telemetry & Crisis Escalation System', () => {
  describe('PrivacyTelemetryAdapter', () => {
    it('pseudonymizes student identifiers with HMAC-SHA256 and scrubs free-text fields', () => {
      const capturedLines: string[] = [];
      const telemetry = new PrivacyTelemetryAdapter({
        secretSalt: 'test-salt-secret',
        sink: (line) => capturedLines.push(line),
      });

      telemetry.recordEvent('turn_completed', {
        userId: '1001',
        courseId: 'sdi-ftt101',
        durationMs: 450,
        // Free-text fields that must be scrubbed:
        message: 'This is my private message with PII',
        prompt: 'Solve question 2 for me',
        email: 'alex@sdi.edu',
      });

      expect(capturedLines.length).toBe(1);
      const parsed = JSON.parse(capturedLines[0]);

      expect(parsed.name).toBe('turn_completed');
      expect(parsed.properties.courseId).toBe('sdi-ftt101');
      expect(parsed.properties.durationMs).toBe(450);

      // Verify pseudonymization
      expect(parsed.properties.pseudonymId).toBeDefined();
      expect(parsed.properties.pseudonymId).toMatch(/^anon_[a-f0-9]{16}$/);
      expect(parsed.properties.userId).toBeUndefined();

      // Verify privacy filter scrubbed raw text
      expect(parsed.properties.message).toBeUndefined();
      expect(parsed.properties.prompt).toBeUndefined();
      expect(parsed.properties.email).toBeUndefined();
    });

    it('consistently produces the same pseudonym for the same student under the same salt', () => {
      const telemetry = new PrivacyTelemetryAdapter({ secretSalt: 'consistent-salt' });
      const p1 = telemetry.pseudonymize('1001');
      const p2 = telemetry.pseudonymize('1001');
      const p3 = telemetry.pseudonymize('2001');

      expect(p1).toBe(p2);
      expect(p1).not.toBe(p3);
    });

    it('records operational metrics with de-identified tags', () => {
      const capturedLines: string[] = [];
      const telemetry = new PrivacyTelemetryAdapter({
        secretSalt: 'test-salt-secret',
        sink: (line) => capturedLines.push(line),
      });

      telemetry.recordMetric('turn_latency_ms', 320, {
        userId: '1001',
        courseId: 'sdi-ftt101',
      });

      expect(capturedLines.length).toBe(1);
      const parsed = JSON.parse(capturedLines[0]);
      expect(parsed.type).toBe('metric');
      expect(parsed.value).toBe(320);
      expect(parsed.tags.pseudonymId).toMatch(/^anon_[a-f0-9]{16}$/);
      expect(parsed.tags.userId).toBeUndefined();
    });
  });

  describe('WebhookCrisisAlertAdapter & FERPA § 99.36 Escalation', () => {
    it('dispatches structured alert under FERPA Health & Safety Emergency Exception via fallback logger', async () => {
      const logLines: string[] = [];
      const alertAdapter = new WebhookCrisisAlertAdapter({
        logger: (msg) => logLines.push(msg),
      });

      const incident: CrisisIncident = {
        id: 'inc-12345',
        timestamp: new Date(),
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        studentId: '1001',
        category: 'self-harm',
        triggerSnippet: 'suicide',
        responseRendered: 'Emergency 988 resources provided.',
      };

      const result = await alertAdapter.dispatchAlert(incident);
      expect(result.success).toBe(true);
      expect(result.channel).toBe('logger_fallback');
      expect(logLines.length).toBe(1);
      expect(logLines[0]).toContain('inc-12345');
      expect(logLines[0]).toContain('FERPA 34 CFR § 99.36');
    });

    it('posts to external webhook when configured', async () => {
      let postedBody: string | null = null;
      const fakeFetch: typeof fetch = async (_url, init) => {
        postedBody = init?.body as string;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      const alertAdapter = new WebhookCrisisAlertAdapter({
        webhookUrl: 'https://emergency.sdi.edu/api/crisis-alert',
        fetchFn: fakeFetch,
      });

      const incident: CrisisIncident = {
        id: 'inc-999',
        timestamp: new Date(),
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        studentId: '1001',
        category: 'self-harm',
        triggerSnippet: 'suicide',
        responseRendered: 'Emergency 988 resources provided.',
      };

      const result = await alertAdapter.dispatchAlert(incident);
      expect(result.success).toBe(true);
      expect(result.channel).toBe('webhook');
      expect(postedBody).not.toBeNull();
      const parsed = JSON.parse(postedBody!);
      expect(parsed.incidentId).toBe('inc-999');
      expect(parsed.severity).toBe('EMERGENCY_HEALTH_SAFETY');
      expect(parsed.legalBasis).toContain('FERPA 34 CFR § 99.36');
    });

    it('sends Authorization Bearer token and handles webhook failures gracefully', async () => {
      let authHeader: string | undefined;
      const authFetch: typeof fetch = async (_url, init) => {
        authHeader = (init?.headers as Record<string, string>)?.Authorization;
        return new Response('Server Error', { status: 502 });
      };

      const logs: string[] = [];
      const adapter = new WebhookCrisisAlertAdapter({
        webhookUrl: 'https://emergency.sdi.edu/api/crisis-alert',
        bearerToken: 'secret-crisis-token',
        fetchFn: authFetch,
        logger: (m) => logs.push(m),
      });

      const incident: CrisisIncident = {
        id: 'inc-502',
        timestamp: new Date(),
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        studentId: '1001',
        category: 'self-harm',
        triggerSnippet: 'distress',
        responseRendered: '988 info',
      };

      const res = await adapter.dispatchAlert(incident);
      expect(authHeader).toBe('Bearer secret-crisis-token');
      expect(res.success).toBe(false);
      expect(res.error).toContain('502');
      expect(logs.some((l) => l.includes('502'))).toBe(true);

      const netFailAdapter = new WebhookCrisisAlertAdapter({
        webhookUrl: 'https://emergency.sdi.edu/api/crisis-alert',
        fetchFn: async () => {
          throw new Error('ECONNREFUSED');
        },
        logger: (m) => logs.push(m),
      });
      const netRes = await netFailAdapter.dispatchAlert(incident);
      expect(netRes.success).toBe(false);
      expect(netRes.error).toContain('ECONNREFUSED');
    });

    it('rejects missing or default telemetry salt when NODE_ENV=production', () => {
      const prevNodeEnv = process.env.NODE_ENV;
      const prevSalt = process.env.TELEMETRY_SALT;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.TELEMETRY_SALT;

        expect(() => new PrivacyTelemetryAdapter()).toThrow('TELEMETRY_SALT must be explicitly configured');
        expect(
          () => new PrivacyTelemetryAdapter({ secretSalt: 'demo-telemetry-salt-change-in-production' }),
        ).toThrow('TELEMETRY_SALT must be explicitly configured');

        const valid = new PrivacyTelemetryAdapter({ secretSalt: 'unique-production-hmac-key-2026' });
        expect(valid.pseudonymize('1001')).toMatch(/^anon_/);
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
        if (prevSalt !== undefined) process.env.TELEMETRY_SALT = prevSalt;
        else delete process.env.TELEMETRY_SALT;
      }
    });
  });

  describe('TutorEngine Crisis Integration', () => {
    it('halts tutoring, records crisis incident, dispatches alert, and streams 988 resources on crisis signals', async () => {
      const persistence = new InMemoryPersistenceAdapter();
      const fakeCrisisAlert = new FakeCrisisAlertAdapter();
      const moderation = new FakeModerationAdapter();
      const capturedTelemetry: string[] = [];
      const telemetry = new PrivacyTelemetryAdapter({
        sink: (l) => capturedTelemetry.push(l),
      });

      await persistence.upsertCollege({
        id: SDI_COLLEGE_CONFIG.id,
        name: SDI_COLLEGE_CONFIG.name,
        domain: SDI_COLLEGE_CONFIG.domain,
        createdAt: new Date(),
      });

      const engine = new TutorEngine({
        llm: new FakeLlmAdapter(),
        lms: new FakeLmsAdapter(),
        identity: new FakeIdentityAdapter(),
        persistence,
        calculator: new InProcessCalculatorAdapter(),
        moderation,
        telemetry,
        toolRegistry: createStandardToolRegistry(),
        collegeConfig: SDI_COLLEGE_CONFIG,
        crisisAlert: fakeCrisisAlert,
      });

      const events = [];
      for await (const event of engine.executeTurn({
        personaId: 'demo_student',
        courseId: 'sdi-ftt101',
        message: 'I am in severe distress and want to commit suicide',
      })) {
        events.push(event);
      }

      // 1. Verify crisis response streamed to student
      const textEvents = events.filter((e) => e.type === 'text-delta');
      const fullText = textEvents.map((e) => (e as { delta: string }).delta).join('');
      expect(fullText).toContain('988');
      expect(fullText).toContain('SDI Student Support');

      // 2. Verify crisis alert was dispatched to institutional contact
      expect(fakeCrisisAlert.dispatched.length).toBe(1);
      const dispatched = fakeCrisisAlert.dispatched[0];
      expect(dispatched.category).toContain('self-harm');
      expect(dispatched.triggerSnippet).toBe('suicide');

      // 3. Verify isolated incident was recorded in persistence
      const storedIncidents = await persistence.listCrisisIncidents(SDI_COLLEGE_CONFIG.id);
      expect(storedIncidents.length).toBe(1);
      expect(storedIncidents[0].triggerSnippet).toBe('suicide');
      expect(storedIncidents[0].studentId).toBe('user-1001');

      // 4. Verify telemetry recorded de-identified crisis event
      const crisisTelemetry = capturedTelemetry.find((l) => l.includes('crisis_detected'));
      expect(crisisTelemetry).toBeDefined();
      const parsed = JSON.parse(crisisTelemetry!);
      expect(parsed.properties.pseudonymId).toMatch(/^anon_[a-f0-9]{16}$/);
      expect(parsed.properties.userId).toBeUndefined();
    });
  });

  describe('Azure Log Storage & Telemetry Export (Optional Cloud Storage)', () => {
    it('FakeLogStorageAdapter collects entries and records flush events', async () => {
      const fakeStorage = new FakeLogStorageAdapter();
      await fakeStorage.write({ type: 'event', name: 'test_event' });
      await fakeStorage.write('{"type":"raw_line"}');

      expect(fakeStorage.entries.length).toBe(2);
      expect(fakeStorage.flushCount).toBe(0);

      await fakeStorage.flush();
      expect(fakeStorage.flushCount).toBe(1);

      await fakeStorage.close();
      expect(fakeStorage.closed).toBe(true);
      expect(fakeStorage.flushCount).toBe(2);
    });

    it('PrivacyTelemetryAdapter forwards scrubbed entries to configured LogStoragePort', async () => {
      const fakeStorage = new FakeLogStorageAdapter();
      const telemetry = new PrivacyTelemetryAdapter({
        secretSalt: 'test-salt',
        logStorage: fakeStorage,
        enableStdout: false,
      });

      telemetry.recordEvent('login_completed', {
        userId: '1001',
        courseId: 'sdi-ftt101',
        password: 'should_be_scrubbed',
      });

      expect(fakeStorage.entries.length).toBe(1);
      const parsed = JSON.parse(fakeStorage.entries[0]);
      expect(parsed.name).toBe('login_completed');
      expect(parsed.properties.pseudonymId).toMatch(/^anon_[a-f0-9]{16}$/);
      expect(parsed.properties.password).toBeUndefined();
    });

    it('AzureBlobLogStorageAdapter uploads batches via SAS URL with BlockBlob headers', async () => {
      const requests: { url: string; method?: string; headers?: Record<string, string>; body?: string }[] = [];

      const mockFetch: typeof fetch = async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method,
          headers: init?.headers as Record<string, string>,
          body: init?.body ? String(init.body) : undefined,
        });
        return new Response('', { status: 201 });
      };

      const storage = new AzureBlobLogStorageAdapter({
        containerUrl: 'https://testaccount.blob.core.windows.net/telemetry-logs?sv=2023-11-03&sig=fake_sas',
        batchSize: 2,
        flushIntervalMs: 0,
        fetchFn: mockFetch,
      });

      await storage.write({ type: 'event', name: 'event_1' });
      expect(requests.length).toBe(0); // Under batch size

      await storage.write({ type: 'event', name: 'event_2' });
      // Reached batchSize 2 -> automatic flush
      expect(requests.length).toBe(1);
      expect(requests[0].method).toBe('PUT');
      expect(requests[0].url).toContain('https://testaccount.blob.core.windows.net/telemetry-logs/logs/');
      expect(requests[0].url).toContain('.jsonl?sv=2023-11-03&sig=fake_sas');
      expect(requests[0].headers?.['x-ms-blob-type']).toBe('BlockBlob');
      expect(requests[0].headers?.['x-ms-version']).toBe('2023-11-03');
      expect(requests[0].body).toContain('event_1');
      expect(requests[0].body).toContain('event_2');

      await storage.close();
    });

    it('AzureBlobLogStorageAdapter signs SharedKey authorization with connection string', async () => {
      const requests: { url: string; headers?: Record<string, string>; body?: string }[] = [];

      const mockFetch: typeof fetch = async (input, init) => {
        requests.push({
          url: String(input),
          headers: init?.headers as Record<string, string>,
          body: init?.body ? String(init.body) : undefined,
        });
        return new Response('', { status: 201 });
      };

      const connStr =
        'DefaultEndpointsProtocol=https;AccountName=teststorageaccount;AccountKey=dGVzdF9rZXlfYmFzZTY0;EndpointSuffix=core.windows.net';

      const storage = new AzureBlobLogStorageAdapter({
        connectionString: connStr,
        containerName: 'audit-logs',
        batchSize: 10,
        flushIntervalMs: 0,
        fetchFn: mockFetch,
      });

      await storage.write('{"type":"audit_event","action":"clear_data"}');
      await storage.flush();

      expect(requests.length).toBe(1);
      expect(requests[0].url).toContain('https://teststorageaccount.blob.core.windows.net/audit-logs/logs/');
      expect(requests[0].headers?.['x-ms-blob-type']).toBe('BlockBlob');
      expect(requests[0].headers?.['Authorization']).toMatch(/^SharedKey teststorageaccount:[A-Za-z0-9+/=]+$/);

      await storage.close();
    });
  });
});
