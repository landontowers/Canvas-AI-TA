import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasClient } from './canvas-client.js';
import { CanvasRestAdapter } from './canvas-rest.adapter.js';
import { createSandboxFetch } from '../fixtures/sandbox-course.fixture.js';

describe('CanvasRestAdapter (Sandbox Course Fixtures)', () => {
  let client: CanvasClient;
  let adapter: CanvasRestAdapter;

  beforeEach(() => {
    client = new CanvasClient({
      baseUrl: 'https://classroom.sdi.edu',
      accessToken: 'test-token',
      fetchFn: createSandboxFetch(),
      cacheTtlMs: 0, // disable cache for tests
    });
    adapter = new CanvasRestAdapter(client);
  });

  it('retrieves student grades with scores and instructor feedback', async () => {
    const grades = await adapter.getStudentGrades('101', '1001');

    expect(grades.length).toBeGreaterThan(0);
    const lab1 = grades.find((g) => g.assignmentId === '101');
    expect(lab1).toBeDefined();
    expect(lab1?.score).toBe(95);
    expect(lab1?.possiblePoints).toBe(100);
    expect(lab1?.grade).toBe('A');
    expect(lab1?.feedback).toContain('Excellent work adhering to safety protocols.');
  });

  it('safely handles assignments without due dates without crashing (critique §3.2)', async () => {
    const assignments = await adapter.getUpcomingAssignments('101', '1001');
    expect(assignments.length).toBe(3);

    const lab2 = assignments.find((a) => a.id === '102');
    expect(lab2).toBeDefined();
    expect(lab2?.dueAt).toBeNull();
    expect(lab2?.pointsPossible).toBe(50);
  });

  it('converts assignment description HTML to Markdown', async () => {
    const detail = await adapter.getAssignmentDetails('101', '101', '1001');

    expect(detail.description).toBe('### Lab Safety Assessment\n\nIdentify all necessary safety gear and shop inspection steps before tool calibration.');
    expect(detail.rubric?.length).toBe(2);
  });

  it('retrieves syllabus converted to Markdown', async () => {
    const syllabus = await adapter.getSyllabus('101', '1001');

    expect(syllabus).toContain('# FTT-101 Syllabus');
    expect(syllabus).toContain('Late assignments are subject to a 10% penalty');
  });

  it('retrieves announcements converted to Markdown', async () => {
    const announcements = await adapter.getAnnouncements('101', '1001');

    expect(announcements.length).toBe(1);
    expect(announcements[0].title).toBe('Welcome to Week 2');
    expect(announcements[0].message).toContain('Please review the blueprint specifications before Friday.');
  });

  it('marks locked modules appropriately (visibility test)', async () => {
    const modules = await adapter.getCourseModules('101', '1001');

    const mod1 = modules.find((m) => m.id === '1');
    expect(mod1?.isLocked).toBe(false);

    const mod2 = modules.find((m) => m.id === '2');
    expect(mod2?.isLocked).toBe(true);
  });

  it('allows access to published page', async () => {
    const page = await adapter.getCoursePage('101', 'welcome-to-sdi', '1001');

    expect(page.title).toBe('Welcome to SDI');
    expect(page.body).toContain('# Welcome to SDI');
    expect(page.isPublished).toBe(true);
  });

  it('rejects access to unpublished page for student persona (critique §8)', async () => {
    await expect(
      adapter.getCoursePage('101', 'draft-exam-review', '1001'),
    ).rejects.toThrow(/not published or visible/i);
  });

  it('provides instructor submission statistics and summaries', async () => {
    const summaries = await adapter.getSubmissionSummaries('101');

    expect(summaries.length).toBe(3);
    const lab1 = summaries.find((s) => s.assignmentId === '101');
    expect(lab1?.submittedCount).toBe(1);
  });

  it('calculates gradebook metrics accurately across graded scores for instructor', async () => {
    const gradebook = await adapter.getGradebookSummary('101');

    expect(gradebook.courseId).toBe('101');
    expect(gradebook.assignmentCount).toBe(3);
    expect(gradebook.averageScorePercent).toBe(95);
    expect(gradebook.medianScorePercent).toBe(95);
  });

  it('computes exact arithmetic mean and median for odd/even graded distributions and zero for ungraded courses', async () => {
    // Even count of scores: [60, 80, 90, 100] -> mean 82.5, median (80+90)/2 = 85.0
    const mockFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/courses/500/assignments') {
        return new Response(
          JSON.stringify([
            { id: 1, name: 'A1', points_possible: 100 },
            { id: 2, name: 'A2', points_possible: 50 },
          ]),
          { status: 200 },
        );
      }
      if (url.pathname === '/api/v1/courses/500/assignments/1/submissions') {
        return new Response(
          JSON.stringify([
            { id: 1, assignment_id: 1, user_id: 1, score: 60 },
            { id: 2, assignment_id: 1, user_id: 2, score: 100 },
          ]),
          { status: 200 },
        );
      }
      if (url.pathname === '/api/v1/courses/500/assignments/2/submissions') {
        return new Response(
          JSON.stringify([
            { id: 3, assignment_id: 2, user_id: 1, score: 40 }, // 80%
            { id: 4, assignment_id: 2, user_id: 2, score: 45 }, // 90%
            { id: 5, assignment_id: 2, user_id: 3, score: null },
          ]),
          { status: 200 },
        );
      }
      if (url.pathname === '/api/v1/courses/501/assignments') {
        return new Response(JSON.stringify([{ id: 10, name: 'Empty', points_possible: 100 }]), {
          status: 200,
        });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };

    const customAdapter = new CanvasRestAdapter(
      new CanvasClient({
        baseUrl: 'https://classroom.sdi.edu',
        accessToken: 'test-token',
        fetchFn: mockFetch,
        cacheTtlMs: 0,
      }),
    );

    const summary = await customAdapter.getGradebookSummary('500', '2001');
    expect(summary.averageScorePercent).toBe(82.5);
    expect(summary.medianScorePercent).toBe(85);

    const emptySummary = await customAdapter.getGradebookSummary('501', '2001');
    expect(emptySummary.averageScorePercent).toBe(0);
    expect(emptySummary.medianScorePercent).toBe(0);
  });

  it('prevents [] suffix duplication in query parameters and preserves pagination nextUrl across cache hits', async () => {
    const requestedUrls: string[] = [];
    const pagedFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      requestedUrls.push(urlStr);

      if (urlStr.includes('page=2')) {
        return new Response(
          JSON.stringify([{ id: 2, name: 'Second Page Assignment', due_at: null, points_possible: 20 }]),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify([{ id: 1, name: 'First Page Assignment', due_at: null, points_possible: 10 }]),
        {
          status: 200,
          headers: {
            Link: '<https://classroom.sdi.edu/api/v1/courses/777/assignments?page=2&per_page=1>; rel="next"',
          },
        },
      );
    };

    const cachedClient = new CanvasClient({
      baseUrl: 'https://classroom.sdi.edu',
      accessToken: 'test-token',
      fetchFn: pagedFetch,
      cacheTtlMs: 30_000,
    });
    const pagedAdapter = new CanvasRestAdapter(cachedClient);

    // 1. Verify no include[][] / student_ids[][] duplication
    await cachedClient.get('/api/v1/courses/777/students/submissions', {
      query: { 'include[]': ['assignment'], 'student_ids[]': ['1001'] },
    });
    expect(requestedUrls[0]).not.toContain('%5B%5D%5B%5D');
    expect(requestedUrls[0]).not.toContain('[][]');
    expect(requestedUrls[0]).toContain('include%5B%5D=assignment');
    expect(requestedUrls[0]).toContain('student_ids%5B%5D=1001');

    // 2. First paginated fetch returns both page 1 and page 2; second fetch from cache must STILL return both pages!
    const firstRun = await pagedAdapter.getUpcomingAssignments('777', '1001');
    const secondRun = await pagedAdapter.getUpcomingAssignments('777', '1001');
    expect(firstRun).toHaveLength(2);
    expect(secondRun).toHaveLength(2);
    expect(secondRun[1].name).toBe('Second Page Assignment');
  });

  it('retrieves student enrolled courses (cross-course, critique §2)', async () => {
    const courses = await adapter.getEnrolledCourses('1001');
    expect(courses.length).toBe(2);
    expect(courses[0].id).toBe('101');
    expect(courses[1].id).toBe('104');
  });

  it('aggregates upcoming assignments across enrolled courses', async () => {
    const crossAssignments = await adapter.getCrossCourseUpcomingAssignments('1001');
    expect(crossAssignments.length).toBe(4); // 3 from 101, 1 from 104
    expect(crossAssignments.some((a) => a.courseId === '101')).toBe(true);
    expect(crossAssignments.some((a) => a.courseId === '104')).toBe(true);
    const upperRec = crossAssignments.find((a) => a.courseId === '104');
    expect(upperRec?.name).toBe('Upper Receiver Assembly Practical');
  });

  it('tracks Canvas rate limit headers', async () => {
    await adapter.getSyllabus('101', '1001');
    const remaining = client.getRateLimitRemaining();
    expect(remaining).toBe(699.95);
  });
});
