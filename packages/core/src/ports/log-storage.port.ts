export interface LogEntry {
  timestamp?: string;
  type?: string;
  level?: string;
  message?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Port for persistent, durable log and telemetry storage (e.g. Azure Blob Storage).
 * Allows operational telemetry and audit logs to be exported to cloud storage.
 */
export interface LogStoragePort {
  /**
   * Writes a raw serialized log entry or structured LogEntry to the storage buffer.
   */
  write(entry: string | LogEntry): Promise<void>;

  /**
   * Flushes any buffered entries to the underlying storage sink.
   */
  flush(): Promise<void>;

  /**
   * Gracefully closes any timers or connections.
   */
  close?(): Promise<void>;
}
