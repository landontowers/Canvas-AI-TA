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

export const TutorRoleSchema = z.enum(['student', 'instructor']);
export type TutorRole = z.infer<typeof TutorRoleSchema>;

/**
 * Fixed rule for resolving mixed roles (critique §3.14).
 * If the user has an Instructor or TA role in the course, they get the instructor tutor.
 * Otherwise, they get the student tutor.
 */
export function resolveTutorRole(canvasRoles: string[]): TutorRole {
  const staffKeywords = ['teacher', 'instructor', 'ta', 'teachingassistant'];
  const hasStaffRole = canvasRoles.some((role) =>
    staffKeywords.some((keyword) => role.toLowerCase().includes(keyword)),
  );
  return hasStaffRole ? 'instructor' : 'student';
}
