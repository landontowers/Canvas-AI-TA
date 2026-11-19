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
 * If the course setting is 'logistics_only' and the question is classified as 'course_material',
 * access to course content is denied and the tutor responds with a refusal directing the student to the instructor.
 */
export function evaluateStudentPolicy(
  classification: QuestionClassification,
  courseSetting: CourseSettingValue,
): PolicyDecision {
  if (courseSetting === 'logistics_only' && classification === 'course_material') {
    return {
      allowed: false,
      classification,
      refusalMessage:
        'Your instructor has configured this tutor for course logistics only. For questions regarding the course subject matter and assignments, please reach out directly to your instructor.',
    };
  }

  return {
    allowed: true,
    classification,
  };
}
