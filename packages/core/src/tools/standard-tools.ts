import { z } from 'zod';
import { CoreTool } from './tool.types.js';
import { ToolRegistry } from './tool-registry.js';

// --- Student Tools (critique §3.14, plan Phase 2) ---

export const getStudentGradesTool: CoreTool<Record<string, never>> = {
  name: 'get_student_grades',
  description: 'Lookup the student\'s own current grades, scores, and instructor feedback in the course.',
  parameters: z.object({}),
  requiredRole: 'student',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/analytics/users/:user_id/assignments'],
  async execute(_args, context) {
    return context.ports.lms.getStudentGrades(context.courseId, context.userId);
  },
};

export const getUpcomingAssignmentsTool: CoreTool<Record<string, never>> = {
  name: 'get_upcoming_assignments',
  description: 'List upcoming course assignments, including due dates, points possible, and submission status.',
  parameters: z.object({}),
  requiredRole: 'both',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/assignments'],
  async execute(_args, context) {
    return context.ports.lms.getUpcomingAssignments(context.courseId, context.userId);
  },
};

export const getAssignmentDetailsTool: CoreTool<{ assignmentId: string }> = {
  name: 'get_assignment_details',
  description: 'Retrieve the detailed instructions, description, requirements, and rubric for a specific assignment.',
  parameters: z.object({
    assignmentId: z.string().describe('The Canvas ID of the assignment to inspect.'),
  }),
  requiredRole: 'both',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/assignments/:id'],
  async execute(args, context) {
    return context.ports.lms.getAssignmentDetails(context.courseId, args.assignmentId, context.userId);
  },
};

export const getSyllabusTool: CoreTool<Record<string, never>> = {
  name: 'get_syllabus',
  description: 'Retrieve the official course syllabus, grading policies, and schedule in Markdown format.',
  parameters: z.object({}),
  requiredRole: 'both',
  requiredScopes: ['url:GET|/api/v1/courses/:id'],
  async execute(_args, context) {
    return context.ports.lms.getSyllabus(context.courseId, context.userId);
  },
};

export const getAnnouncementsTool: CoreTool<Record<string, never>> = {
  name: 'get_announcements',
  description: 'Retrieve recent course announcements published by the instructor.',
  parameters: z.object({}),
  requiredRole: 'both',
  requiredScopes: ['url:GET|/api/v1/announcements'],
  async execute(_args, context) {
    return context.ports.lms.getAnnouncements(context.courseId, context.userId);
  },
};

export const getCourseModulesTool: CoreTool<Record<string, never>> = {
  name: 'get_course_modules',
  description: 'List course modules and their items. Locked modules will be designated as locked.',
  parameters: z.object({}),
  requiredRole: 'student',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/modules'],
  async execute(_args, context) {
    return context.ports.lms.getCourseModules(context.courseId, context.userId);
  },
};

export const getCoursePageTool: CoreTool<{ pageUrl: string }> = {
  name: 'get_course_page',
  description: 'Retrieve the contents of a published course wiki page. Unpublished pages are inaccessible to students.',
  parameters: z.object({
    pageUrl: z.string().describe('The URL slug of the course page (e.g. "welcome-to-sdi").'),
  }),
  requiredRole: 'student',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/pages/:url'],
  async execute(args, context) {
    return context.ports.lms.getCoursePage(context.courseId, args.pageUrl, context.userId);
  },
};

export const calculateTool: CoreTool<{ expression: string }> = {
  name: 'calculate',
  description: 'Perform deterministic math calculations or unit conversions (e.g., "50 mm to inch", "(25 * 4) + 10").',
  parameters: z.object({
    expression: z.string().describe('The mathematical or unit expression to evaluate.'),
  }),
  requiredRole: 'both',
  requiredScopes: [],
  async execute(args, context) {
    return context.ports.calculator.evaluate(args.expression);
  },
};

export const dateMathTool: CoreTool<{
  baseDate: string;
  operation: 'add' | 'subtract';
  amount: number;
  unit: 'days' | 'weeks' | 'months' | 'years' | 'hours';
}> = {
  name: 'date_math',
  description: 'Perform date calculations (e.g., adding 7 days to an assignment due date).',
  parameters: z.object({
    baseDate: z.string().describe('ISO 8601 date string to calculate from.'),
    operation: z.enum(['add', 'subtract']),
    amount: z.number().positive(),
    unit: z.enum(['days', 'weeks', 'months', 'years', 'hours']),
  }),
  requiredRole: 'both',
  requiredScopes: [],
  async execute(args, context) {
    return context.ports.calculator.calculateDate(args);
  },
};

// --- Instructor Tools (critique §3.14, plan Phase 2) ---

export const getAssignmentsWithoutDueDatesTool: CoreTool<Record<string, never>> = {
  name: 'get_assignments_without_due_dates',
  description: 'Course structure lookup: Find all assignments in the course that do not currently have a due date set.',
  parameters: z.object({}),
  requiredRole: 'instructor',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/assignments'],
  async execute(_args, context) {
    const assignments = await context.ports.lms.getUpcomingAssignments(context.courseId, context.userId);
    return assignments.filter((a) => !a.dueAt);
  },
};

export const getSubmissionSummariesTool: CoreTool<{ assignmentId?: string }> = {
  name: 'get_submission_summaries',
  description: 'Retrieve submission status statistics across the course (counts of submitted, unsubmitted, and graded). Minimal student data is returned.',
  parameters: z.object({
    assignmentId: z.string().optional().describe('Optional assignment ID to filter submission statistics.'),
  }),
  requiredRole: 'instructor',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/assignments/:assignment_id/submissions'],
  async execute(args, context) {
    return context.ports.lms.getSubmissionSummaries(context.courseId, args.assignmentId);
  },
};

export const getGradebookSummaryTool: CoreTool<Record<string, never>> = {
  name: 'get_gradebook_summary',
  description: 'Retrieve course gradebook aggregate statistics, including class average score percent and median.',
  parameters: z.object({}),
  requiredRole: 'instructor',
  requiredScopes: ['url:GET|/api/v1/courses/:course_id/gradebook'],
  async execute(_args, context) {
    return context.ports.lms.getGradebookSummary(context.courseId);
  },
};

export function createStandardToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  // Student & shared tools
  registry.register(getStudentGradesTool);
  registry.register(getUpcomingAssignmentsTool);
  registry.register(getAssignmentDetailsTool);
  registry.register(getSyllabusTool);
  registry.register(getAnnouncementsTool);
  registry.register(getCourseModulesTool);
  registry.register(getCoursePageTool);
  registry.register(calculateTool);
  registry.register(dateMathTool);

  // Instructor tools
  registry.register(getAssignmentsWithoutDueDatesTool);
  registry.register(getSubmissionSummariesTool);
  registry.register(getGradebookSummaryTool);

  return registry;
}
