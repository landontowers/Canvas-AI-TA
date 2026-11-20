export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  crisisDetected: boolean;
  crisisMessage?: string;
  reason?: string;
  triggerSnippet?: string;
}

export interface ModerationPort {
  checkContent(content: string, userId?: string): Promise<ModerationResult>;
}
