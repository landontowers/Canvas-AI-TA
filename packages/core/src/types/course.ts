import { z } from 'zod';

export const CourseSettingValueSchema = z.enum(['full', 'logistics_only', 'off']);
export type CourseSettingValue = z.infer<typeof CourseSettingValueSchema>;

export const CourseSettingsSchema = z.object({
  id: z.string().uuid().optional(),
  courseId: z.string(),
  setting: CourseSettingValueSchema.default('full'),
  blackoutStart: z.date().optional(),
  blackoutEnd: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type CourseSettings = z.infer<typeof CourseSettingsSchema>;

export function isBlackoutActive(settings: CourseSettings, now: Date = new Date()): boolean {
  if (!settings.blackoutStart || !settings.blackoutEnd) return false;
  const nowMs = now.getTime();
  return nowMs >= settings.blackoutStart.getTime() && nowMs <= settings.blackoutEnd.getTime();
}

export const CourseSchema = z.object({
  id: z.string(),
  collegeId: z.string(),
  externalCanvasId: z.string(),
  name: z.string(),
  courseCode: z.string(),
  createdAt: z.date().optional(),
});

export type Course = z.infer<typeof CourseSchema>;
