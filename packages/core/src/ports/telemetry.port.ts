export interface TelemetryPort {
  recordEvent(name: string, properties?: Record<string, string | number | boolean>): void;
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
}
