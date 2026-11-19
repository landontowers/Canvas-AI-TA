import { z } from 'zod';

export const CourseSettingValueSchema = z.enum(['full', 'logistics_only']);
export type CourseSettingValue = z.infer<typeof CourseSettingValueSchema>;

export const CourseSettingsSchema = z.object({
  id: z.string().uuid().optional(),
  courseId: z.string(),
  setting: CourseSettingValueSchema.default('full'),
  updatedAt: z.date().optional(),
});

export type CourseSettings = z.infer<typeof CourseSettingsSchema>;

export const CourseSchema = z.object({
  id: z.string(),
  collegeId: z.string(),
  externalCanvasId: z.string(),
  name: z.string(),
  courseCode: z.string(),
  createdAt: z.date().optional(),
});

export type Course = z.infer<typeof CourseSchema>;
