import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStandardToolRegistry,
  ToolRegistry,
  ToolExecutionContext,
  UnauthorizedToolError,
} from '@ai-tutor/core';
import { CanvasClient } from '../canvas/canvas-client.js';
import { CanvasRestAdapter } from '../canvas/canvas-rest.adapter.js';
import { InProcessCalculatorAdapter } from '../fake/in-process-calculator.adapter.js';
import { createSandboxFetch } from '../fixtures/sandbox-course.fixture.js';

describe('Tool System & Role Boundaries (Phase 2 Verification)', () => {
  let registry: ToolRegistry;
  let canvasAdapter: CanvasRestAdapter;
  let calculator: InProcessCalculatorAdapter;

  beforeEach(() => {
    registry = createStandardToolRegistry();
    const client = new CanvasClient({
      baseUrl: 'https://classroom.sdi.edu',
      accessToken: 'test-token',
      fetchFn: createSandboxFetch(),
      cacheTtlMs: 0,
    });
    canvasAdapter = new CanvasRestAdapter(client);
    calculator = new InProcessCalculatorAdapter();
  });

  const createStudentContext = (): ToolExecutionContext => ({
    userId: 'user-1001',
    canvasUserId: '1001',
    courseId: '101',
    role: 'student',
    ports: {
      lms: canvasAdapter,
      calculator,
    },
  });

  const createInstructorContext = (): ToolExecutionContext => ({
    userId: 'user-2001',
    canvasUserId: '2001',
    courseId: '101',
    role: 'instructor',
    ports: {
      lms: canvasAdapter,
      calculator,
    },
  });

  describe('Role-based Tool Visibility', () => {
    it('offers student tools and shared tools to a student session', () => {
      const studentTools = registry.getToolsForRole('student').map((t) => t.name);

      expect(studentTools).toContain('get_student_grades');
      expect(studentTools).toContain('get_upcoming_assignments');
      expect(studentTools).toContain('get_assignment_details');
      expect(studentTools).toContain('get_syllabus');
      expect(studentTools).toContain('get_announcements');
      expect(studentTools).toContain('get_course_modules');
      expect(studentTools).toContain('get_course_page');
      expect(studentTools).toContain('list_enrolled_courses');
      expect(studentTools).toContain('get_cross_course_deadlines');
      expect(studentTools).toContain('calculate');
      expect(studentTools).toContain('date_math');

      // Instructor tools MUST NOT be offered
      expect(studentTools).not.toContain('get_assignments_without_due_dates');
      expect(studentTools).not.toContain('get_submission_summaries');
      expect(studentTools).not.toContain('get_gradebook_summary');
    });

    it('offers instructor tools and shared tools to an instructor session', () => {
      const instructorTools = registry.getToolsForRole('instructor').map((t) => t.name);

      expect(instructorTools).toContain('get_assignments_without_due_dates');
      expect(instructorTools).toContain('get_submission_summaries');
      expect(instructorTools).toContain('get_gradebook_summary');
      expect(instructorTools).toContain('get_upcoming_assignments');
      expect(instructorTools).toContain('get_assignment_details');
      expect(instructorTools).toContain('get_syllabus');
      expect(instructorTools).toContain('get_announcements');
      expect(instructorTools).toContain('calculate');
      expect(instructorTools).toContain('date_math');

      // Student-only tools MUST NOT be offered
      expect(instructorTools).not.toContain('get_student_grades');
      expect(instructorTools).not.toContain('get_course_modules');
      expect(instructorTools).not.toContain('get_course_page');
      expect(instructorTools).not.toContain('list_enrolled_courses');
      expect(instructorTools).not.toContain('get_cross_course_deadlines');
    });
  });

  describe('Core Role Boundary Rejection (critique §3.14, §8)', () => {
    it('REJECTS an instructor tool called in a student session', async () => {
      const studentCtx = createStudentContext();

      await expect(
        registry.execute(
          { id: 'call_1', name: 'get_submission_summaries', args: {} },
          studentCtx,
        ),
      ).rejects.toThrow(UnauthorizedToolError);

      await expect(
        registry.execute(
          { id: 'call_2', name: 'get_gradebook_summary', args: {} },
          studentCtx,
        ),
      ).rejects.toThrow(UnauthorizedToolError);

      await expect(
        registry.execute(
          { id: 'call_3', name: 'get_assignments_without_due_dates', args: {} },
          studentCtx,
        ),
      ).rejects.toThrow(UnauthorizedToolError);
    });

    it('REJECTS a student-only tool called in an instructor session', async () => {
      const instructorCtx = createInstructorContext();

      await expect(
        registry.execute(
          { id: 'call_4', name: 'get_student_grades', args: {} },
          instructorCtx,
        ),
      ).rejects.toThrow(UnauthorizedToolError);
    });
  });

  describe('Tool Execution Accuracy', () => {
    it('passes canvasUserId (not internal userId) to LmsPort for masqueraded Canvas lookups', async () => {
      const recordedUserIds: Array<{ method: string; userId?: string }> = [];
      const spyLms = {
        getStudentGrades: async (_c: string, u: string) => {
          recordedUserIds.push({ method: 'getStudentGrades', userId: u });
          return [];
        },
        getUpcomingAssignments: async (_c: string, u: string) => {
          recordedUserIds.push({ method: 'getUpcomingAssignments', userId: u });
          return [];
        },
        getAssignmentDetails: async (_c: string, _a: string, u: string) => {
          recordedUserIds.push({ method: 'getAssignmentDetails', userId: u });
          return { id: 'a1', name: 'A1', dueAt: null, pointsPossible: 10, hasSubmitted: false, description: '' };
        },
        getSyllabus: async (_c: string, u: string) => {
          recordedUserIds.push({ method: 'getSyllabus', userId: u });
          return '';
        },
        getAnnouncements: async (_c: string, u: string) => {
          recordedUserIds.push({ method: 'getAnnouncements', userId: u });
          return [];
        },
        getCourseModules: async (_c: string, u: string) => {
          recordedUserIds.push({ method: 'getCourseModules', userId: u });
          return [];
        },
        getCoursePage: async (_c: string, _p: string, u: string) => {
          recordedUserIds.push({ method: 'getCoursePage', userId: u });
          return { url: 'u', title: 't', body: '', updatedAt: '', isPublished: true };
        },
        getEnrolledCourses: async (u: string) => {
          recordedUserIds.push({ method: 'getEnrolledCourses', userId: u });
          return [];
        },
        getCrossCourseUpcomingAssignments: async (u: string) => {
          recordedUserIds.push({ method: 'getCrossCourseUpcomingAssignments', userId: u });
          return [];
        },
        getSubmissionSummaries: async (_c: string, _a: string | undefined, u?: string) => {
          recordedUserIds.push({ method: 'getSubmissionSummaries', userId: u });
          return [];
        },
        getGradebookSummary: async (_c: string, u?: string) => {
          recordedUserIds.push({ method: 'getGradebookSummary', userId: u });
          return { courseId: '101', averageScorePercent: 0, medianScorePercent: 0, assignmentCount: 0 };
        },
      };

      const studentCtx: ToolExecutionContext = {
        userId: 'user-1001',
        canvasUserId: '1001',
        courseId: '101',
        role: 'student',
        ports: { lms: spyLms, calculator },
      };
      const instructorCtx: ToolExecutionContext = {
        userId: 'user-2001',
        canvasUserId: '2001',
        courseId: '101',
        role: 'instructor',
        ports: { lms: spyLms, calculator },
      };

      await registry.execute({ id: '1', name: 'get_student_grades', args: {} }, studentCtx);
      await registry.execute({ id: '2', name: 'get_syllabus', args: {} }, studentCtx);
      await registry.execute({ id: '3', name: 'list_enrolled_courses', args: {} }, studentCtx);
      await registry.execute({ id: '4', name: 'get_submission_summaries', args: {} }, instructorCtx);
      await registry.execute({ id: '5', name: 'get_gradebook_summary', args: {} }, instructorCtx);

      expect(recordedUserIds).toEqual([
        { method: 'getStudentGrades', userId: '1001' },
        { method: 'getSyllabus', userId: '1001' },
        { method: 'getEnrolledCourses', userId: '1001' },
        { method: 'getSubmissionSummaries', userId: '2001' },
        { method: 'getGradebookSummary', userId: '2001' },
      ]);
    });

    it('executes get_student_grades for student correctly', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        { id: 'call_grades', name: 'get_student_grades', args: {} },
        studentCtx,
      );

      expect(res.isError).toBe(false);
      const grades = res.result as Array<{ assignmentId: string; score: number }>;
      expect(grades[0].assignmentId).toBe('101');
      expect(grades[0].score).toBe(95);
    });

    it('executes list_enrolled_courses for student correctly (critique §2)', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        { id: 'call_courses', name: 'list_enrolled_courses', args: {} },
        studentCtx,
      );

      expect(res.isError).toBe(false);
      const courses = res.result as Array<{ id: string; name: string }>;
      expect(Array.isArray(courses)).toBe(true);
      expect(courses.length).toBeGreaterThan(0);
      expect(courses[0].id).toBe('101');
    });

    it('executes get_cross_course_deadlines across enrolled classes', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        { id: 'call_deadlines', name: 'get_cross_course_deadlines', args: {} },
        studentCtx,
      );

      expect(res.isError).toBe(false);
      const deadlines = res.result as Array<{ id: string; courseId: string; courseName: string }>;
      expect(Array.isArray(deadlines)).toBe(true);
      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines.some((d) => d.courseId === '101')).toBe(true);
      expect(deadlines.some((d) => d.courseId === '104')).toBe(true);
    });

    it('executes get_assignments_without_due_dates for instructor correctly', async () => {
      const instructorCtx = createInstructorContext();
      const res = await registry.execute(
        { id: 'call_nodue', name: 'get_assignments_without_due_dates', args: {} },
        instructorCtx,
      );

      expect(res.isError).toBe(false);
      const nodue = res.result as Array<{ id: string; dueAt: string | null }>;
      expect(nodue.length).toBe(1);
      expect(nodue[0].id).toBe('102');
      expect(nodue[0].dueAt).toBeNull();
    });

    it('executes get_submission_summaries for instructor correctly', async () => {
      const instructorCtx = createInstructorContext();
      const res = await registry.execute(
        { id: 'call_subs', name: 'get_submission_summaries', args: { assignmentId: '101' } },
        instructorCtx,
      );

      expect(res.isError).toBe(false);
      const summaries = res.result as Array<{ assignmentId: string; submittedCount: number }>;
      expect(summaries[0].assignmentId).toBe('101');
      expect(summaries[0].submittedCount).toBe(1);
    });

    it('executes calculate tool with unit conversions', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        { id: 'call_calc', name: 'calculate', args: { expression: '25 mm to inch' } },
        studentCtx,
      );

      expect(res.isError).toBe(false);
      expect((res.result as { result: string }).result).toContain('inch');
    });

    it('executes date_math tool correctly', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        {
          id: 'call_date',
          name: 'date_math',
          args: {
            baseDate: '2026-11-19T00:00:00.000Z',
            operation: 'add',
            amount: 7,
            unit: 'days',
          },
        },
        studentCtx,
      );

      expect(res.isError).toBe(false);
      expect((res.result as { resultDate: string }).resultDate).toBe('2026-11-26T00:00:00.000Z');
    });
  });

  describe('Canvas Visibility Enforcement via Tools', () => {
    it('fails when student attempts to access unpublished page via get_course_page', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        { id: 'call_page', name: 'get_course_page', args: { pageUrl: 'draft-exam-review' } },
        studentCtx,
      );

      expect(res.isError).toBe(true);
      expect(String(res.result)).toContain('Page is not published or visible');
    });

    it('marks locked module as isLocked via get_course_modules', async () => {
      const studentCtx = createStudentContext();
      const res = await registry.execute(
        { id: 'call_mods', name: 'get_course_modules', args: {} },
        studentCtx,
      );

      expect(res.isError).toBe(false);
      const modules = res.result as Array<{ id: string; isLocked: boolean }>;
      const lockedMod = modules.find((m) => m.id === '2');
      expect(lockedMod?.isLocked).toBe(true);
    });
  });
});
