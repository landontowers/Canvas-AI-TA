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
  const hasStaffRole = canvasRoles.some((role) => {
    const lower = role.toLowerCase();
    return (
      lower.includes('teacher') ||
      lower.includes('instructor') ||
      lower.includes('teachingassistant') ||
      lower.includes('taenrollment') ||
      /(^|[^a-z0-9])ta([^a-z0-9]|$)/i.test(role)
    );
  });
  return hasStaffRole ? 'instructor' : 'student';
}
