import { z } from 'zod';
import { CourseSettingValue } from '../types/course.js';

export const QuestionClassificationSchema = z.enum(['logistics', 'course_material']);
export type QuestionClassification = z.infer<typeof QuestionClassificationSchema>;

export const ClassifierResultSchema = z.object({
  classification: QuestionClassificationSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});
export type ClassifierResult = z.infer<typeof ClassifierResultSchema>;

export interface PolicyDecision {
  allowed: boolean;
  classification: QuestionClassification;
  refusalMessage?: string;
}

/**
 * Server-enforced policy decision (critique §3.4).
 * Enforces 'off' (disabled), 'logistics_only', and active exam/quiz blackout windows.
 */
export function evaluateStudentPolicy(
  classification: QuestionClassification,
  courseSetting: CourseSettingValue,
  isBlackout = false,
): PolicyDecision {
  if (courseSetting === 'off') {
    return {
      allowed: false,
      classification,
      refusalMessage:
        'Your instructor has disabled the Student Virtual TA for this course. Please reach out directly to your instructor or visit office hours.',
    };
  }

  if (isBlackout && classification === 'course_material') {
    return {
      allowed: false,
      classification,
      refusalMessage:
        'Your instructor has paused course-material assistance during an active exam or quiz window. I can still answer logistics questions about deadlines and policies.',
    };
  }

  if (courseSetting === 'logistics_only' && classification === 'course_material') {
    return {
      allowed: false,
      classification,
      refusalMessage:
        'Your instructor has configured this Virtual TA for course logistics only. For questions regarding the course subject matter and assignments, please reach out directly to your instructor.',
    };
  }

  return {
    allowed: true,
    classification,
  };
}
