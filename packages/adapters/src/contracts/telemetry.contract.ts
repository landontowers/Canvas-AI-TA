import { describe, it, expect } from 'vitest';
import { TelemetryPort } from '@ai-tutor/core';

export function runTelemetryContractTests(
  name: string,
  createAdapter: () => TelemetryPort | Promise<TelemetryPort>,
) {
  describe(`Telemetry Port Contract: ${name}`, () => {
    it('records events and metrics without throwing', async () => {
      const adapter = await createAdapter();
      expect(() =>
        adapter.recordEvent('test_event', { key: 'value', count: 1 }),
      ).not.toThrow();
      expect(() =>
        adapter.recordMetric('latency_ms', 145, { model: 'gemini-flash' }),
      ).not.toThrow();
    });
  });
}
