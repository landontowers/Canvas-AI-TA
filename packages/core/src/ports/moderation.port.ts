export interface ModerationContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ModerationCheckOptions {
  userId?: string;
  courseId?: string;
  recentMessages?: ModerationContextMessage[];
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  crisisDetected: boolean;
  crisisMessage?: string;
  reason?: string;
  triggerSnippet?: string;
  stage?: 'lexical' | 'contextual' | 'none';
  confidence?: number;
}

export interface ModerationPort {
  checkContent(
    content: string,
    userIdOrOptions?: string | ModerationCheckOptions,
  ): Promise<ModerationResult>;
}
