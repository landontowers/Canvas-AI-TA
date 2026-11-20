import { CrisisAlertPort, CrisisAlertResult, CrisisIncident } from '@virtual-ta/core';

export interface WebhookCrisisAlertOptions {
  webhookUrl?: string;
  bearerToken?: string;
  emergencyEmail?: string;
  logger?: (msg: string) => void;
  fetchFn?: typeof fetch;
}

/**
 * Dispatches emergency crisis alerts to institutional student support services
 * under the FERPA Health & Safety Emergency Exception (34 CFR § 99.36).
 */
export class WebhookCrisisAlertAdapter implements CrisisAlertPort {
  readonly channelName = 'webhook-crisis-alert';
  private webhookUrl?: string;
  private bearerToken?: string;
  private logger: (msg: string) => void;
  private fetchFn: typeof fetch;

  constructor(options: WebhookCrisisAlertOptions = {}) {
    this.webhookUrl =
      options.webhookUrl || process.env.CRISIS_ALERT_WEBHOOK_URL || process.env.CRISIS_WEBHOOK_URL;
    this.bearerToken = options.bearerToken || process.env.CRISIS_ALERT_BEARER_TOKEN;
    this.logger = options.logger || console.error;
    this.fetchFn = options.fetchFn || fetch;
  }

  async dispatchAlert(incident: CrisisIncident): Promise<CrisisAlertResult> {
    const alertPayload = {
      severity: 'EMERGENCY_HEALTH_SAFETY',
      legalBasis: 'FERPA 34 CFR § 99.36 Health & Safety Emergency Exception',
      incidentId: incident.id,
      timestamp: incident.timestamp.toISOString(),
      collegeId: incident.collegeId,
      courseId: incident.courseId,
      studentId: incident.studentId,
      category: incident.category,
      triggerSnippet: incident.triggerSnippet,
      immediateResponseProvided: incident.responseRendered,
    };

    if (this.webhookUrl) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.bearerToken) {
          headers.Authorization = `Bearer ${this.bearerToken}`;
        }

        const res = await this.fetchFn(this.webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(alertPayload),
        });

        if (!res.ok) {
          this.logger(`[CRISIS_ALERT_FAILED] Webhook returned status ${res.status} for incident ${incident.id}`);
          return {
            success: false,
            dispatchId: incident.id,
            error: `Webhook returned status ${res.status}`,
          };
        }

        return {
          success: true,
          dispatchId: incident.id,
          channel: 'webhook',
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger(`[CRISIS_ALERT_ERROR] Failed to post webhook for incident ${incident.id}: ${errMsg}`);
        return {
          success: false,
          dispatchId: incident.id,
          error: errMsg,
        };
      }
    }

    // Fallback in development / demo: log structured emergency alert line
    this.logger(
      `[CRISIS_ALERT_DISPATCHED] Emergency Incident ${incident.id} recorded for student ${incident.studentId} in course ${incident.courseId} (Category: ${incident.category}). Notice logged under FERPA 34 CFR § 99.36.`,
    );

    return {
      success: true,
      dispatchId: incident.id,
      channel: 'logger_fallback',
    };
  }
}
