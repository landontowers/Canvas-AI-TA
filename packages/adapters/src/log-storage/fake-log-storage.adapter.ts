import { LogEntry, LogStoragePort } from '@ai-tutor/core';

export class FakeLogStorageAdapter implements LogStoragePort {
  public entries: string[] = [];
  public flushCount = 0;
  public closed = false;

  async write(entry: string | LogEntry): Promise<void> {
    const line = typeof entry === 'string' ? entry : JSON.stringify(entry);
    this.entries.push(line);
  }

  async flush(): Promise<void> {
    this.flushCount++;
  }

  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
  }

  clear(): void {
    this.entries = [];
    this.flushCount = 0;
    this.closed = false;
  }
}
