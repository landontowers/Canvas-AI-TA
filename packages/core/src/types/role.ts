import { z } from 'zod';

export const CanvasRoleSchema = z.enum([
  'Learner',
  'StudentEnrollment',
  'Instructor',
  'TeacherEnrollment',
  'TeachingAssistant',
  'TaEnrollment',
  'Designer',
  'DesignerEnrollment',
  'Observer',
  'ObserverEnrollment',
]);

export type CanvasRole = z.infer<typeof CanvasRoleSchema>;

export const AssistantRoleSchema = z.enum(['student', 'instructor']);
export type AssistantRole = z.infer<typeof AssistantRoleSchema>;

/**
 * Fixed rule for resolving mixed roles (critique §3.14).
 * If the user has an Instructor or TA role in the course, they get the instructor Virtual TA.
 * Otherwise, they get the student Virtual TA.
 */
export function resolveAssistantRole(canvasRoles: string[]): AssistantRole {
  const staffKeywords = ['teacher', 'instructor', 'ta', 'teachingassistant'];
  const hasStaffRole = canvasRoles.some((role) =>
    staffKeywords.some((keyword) => role.toLowerCase().includes(keyword)),
  );
  return hasStaffRole ? 'instructor' : 'student';
}
