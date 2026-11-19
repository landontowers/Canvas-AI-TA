import { z } from 'zod';

/**
 * Runtime Zod schemas for Canvas API responses (critique §3.2).
 * Strictly validates Canvas API responses and safely handles unexpected nulls and missing fields.
 */

export const CanvasRubricRatingSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  points: z.number().nullable().optional(),
});

export const CanvasRubricCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  points: z.number(),
  ratings: z.array(CanvasRubricRatingSchema).optional(),
});

export const CanvasAssignmentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string(),
  description: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  points_possible: z.number().nullable().optional(),
  has_submitted_submissions: z.boolean().optional(),
  rubric: z.array(CanvasRubricCriterionSchema).optional(),
});
export type CanvasAssignment = z.infer<typeof CanvasAssignmentSchema>;

export const CanvasSubmissionCommentSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  author_name: z.string().optional(),
  comment: z.string(),
  created_at: z.string().optional(),
});

export const CanvasSubmissionSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  assignment_id: z.union([z.number(), z.string()]).transform(String),
  user_id: z.union([z.number(), z.string()]).transform(String),
  score: z.number().nullable().optional(),
  grade: z.string().nullable().optional(),
  submitted_at: z.string().nullable().optional(),
  workflow_state: z.string().optional(),
  submission_comments: z.array(CanvasSubmissionCommentSchema).optional(),
  assignment: CanvasAssignmentSchema.optional(),
});
export type CanvasSubmission = z.infer<typeof CanvasSubmissionSchema>;

export const CanvasCourseSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string(),
  course_code: z.string().optional(),
  syllabus_body: z.string().nullable().optional(),
});
export type CanvasCourse = z.infer<typeof CanvasCourseSchema>;

export const CanvasModuleItemSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  title: z.string(),
  type: z.string(),
  html_url: z.string().optional(),
  page_url: z.string().optional(),
});

export const CanvasModuleSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string(),
  state: z.string().optional(),
  unlock_at: z.string().nullable().optional(),
  items: z.array(CanvasModuleItemSchema).optional(),
});
export type CanvasModule = z.infer<typeof CanvasModuleSchema>;

export const CanvasPageSchema = z.object({
  url: z.string(),
  title: z.string(),
  body: z.string().nullable().optional(),
  published: z.boolean().nullable().optional(),
  updated_at: z.string().optional(),
});
export type CanvasPage = z.infer<typeof CanvasPageSchema>;

export const CanvasAnnouncementSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  title: z.string(),
  message: z.string(),
  posted_at: z.string(),
});
export type CanvasAnnouncement = z.infer<typeof CanvasAnnouncementSchema>;

export const CanvasEnrollmentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  user_id: z.union([z.number(), z.string()]).transform(String),
  course_id: z.union([z.number(), z.string()]).transform(String),
  type: z.string(),
  role: z.string().optional(),
  enrollment_state: z.string().optional(),
});
export type CanvasEnrollment = z.infer<typeof CanvasEnrollmentSchema>;
