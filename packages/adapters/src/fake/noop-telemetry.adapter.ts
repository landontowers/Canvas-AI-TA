import { TelemetryPort } from '@ai-tutor/core';

export class NoopTelemetryAdapter implements TelemetryPort {
  recordEvent(_name: string, _properties?: Record<string, string | number | boolean>): void {
    // No-op in development and demo
  }

  recordMetric(_name: string, _value: number, _tags?: Record<string, string>): void {
    // No-op in development and demo
  }
}
