import { TelemetryPort } from '@ai-tutor/core';
import crypto from 'node:crypto';

export interface PrivacyTelemetryOptions {
  secretSalt?: string;
  sink?: (line: string) => void;
  enableStdout?: boolean;
}

/**
 * Privacy-preserving structured operational telemetry adapter.
 * Hashing student IDs via HMAC-SHA256 (FERPA de-identification) and scrubbing raw text.
 */
export class PrivacyTelemetryAdapter implements TelemetryPort {
  private secretSalt: string;
  private sink: (line: string) => void;
  private disallowedTextKeys = new Set([
    'message',
    'prompt',
    'content',
    'body',
    'email',
    'name',
    'password',
    'token',
    'secret',
  ]);

  constructor(options: PrivacyTelemetryOptions = {}) {
    this.secretSalt = options.secretSalt || process.env.TELEMETRY_SALT || 'sdi-telemetry-salt-v0';
    this.sink =
      options.sink ||
      (options.enableStdout !== false
        ? (line: string) => {
            process.stdout.write(line + '\n');
          }
        : () => {});
  }

  /**
   * Hashes a student Canvas ID into a cryptographically consistent pseudonym (FERPA de-identification).
   */
  pseudonymize(rawId: string): string {
    if (!rawId) return 'anon_unknown';
    const hmac = crypto.createHmac('sha256', this.secretSalt);
    hmac.update(rawId);
    return `anon_${hmac.digest('hex').substring(0, 16)}`;
  }

  recordEvent(name: string, properties?: Record<string, string | number | boolean | undefined>): void {
    const sanitizedProps: Record<string, string | number | boolean> = {};

    if (properties) {
      for (const [key, val] of Object.entries(properties)) {
        if (val === undefined) continue;

        // Automatically hash student identifiers
        if (key === 'userId' || key === 'studentId' || key === 'canvasUserId') {
          sanitizedProps.pseudonymId = this.pseudonymize(String(val));
          continue;
        }

        // Prevent accidental free-text leakage
        if (this.disallowedTextKeys.has(key.toLowerCase())) {
          continue;
        }

        sanitizedProps[key] = val;
      }
    }

    const payload = {
      type: 'event',
      name,
      timestamp: new Date().toISOString(),
      properties: sanitizedProps,
    };

    this.sink(JSON.stringify(payload));
  }

  recordMetric(name: string, value: number, tags?: Record<string, string | undefined>): void {
    const sanitizedTags: Record<string, string> = {};
    if (tags) {
      for (const [k, v] of Object.entries(tags)) {
        if (v === undefined) continue;
        if (k === 'userId' || k === 'studentId') {
          sanitizedTags.pseudonymId = this.pseudonymize(v);
        } else if (!this.disallowedTextKeys.has(k.toLowerCase())) {
          sanitizedTags[k] = v;
        }
      }
    }

    const payload = {
      type: 'metric',
      name,
      value,
      timestamp: new Date().toISOString(),
      tags: sanitizedTags,
    };

    this.sink(JSON.stringify(payload));
  }
}
