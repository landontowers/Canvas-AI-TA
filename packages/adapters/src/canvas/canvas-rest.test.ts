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

  it('calculates gradebook metrics for instructor', async () => {
    const gradebook = await adapter.getGradebookSummary('101');

    expect(gradebook.courseId).toBe('101');
    expect(gradebook.assignmentCount).toBe(3);
    expect(gradebook.averageScorePercent).toBeGreaterThan(0);
  });

  it('tracks Canvas rate limit headers', async () => {
    await adapter.getSyllabus('101', '1001');
    const remaining = client.getRateLimitRemaining();
    expect(remaining).toBe(699.95);
  });
});
