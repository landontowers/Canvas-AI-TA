export type CrisisIncidentStatus = 'new' | 'acknowledged' | 'resolved';

export interface CrisisIncident {
  id: string;
  timestamp: Date;
  collegeId: string;
  courseId: string;
  studentId: string;
  category: string;
  triggerSnippet: string;
  responseRendered: string;
  status?: CrisisIncidentStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export interface CrisisAlertResult {
  success: boolean;
  dispatchId?: string;
  channel?: string;
  error?: string;
}

export interface CrisisAlertPort {
  readonly channelName: string;
  dispatchAlert(incident: CrisisIncident): Promise<CrisisAlertResult>;
}
