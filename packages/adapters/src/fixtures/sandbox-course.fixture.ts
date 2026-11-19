/**
 * Sanitized, realistic Canvas REST API responses matching the sandbox course (critique §4.4, plan Phase 2).
 * Enables 100% offline testing without connecting to live Canvas.
 */

export const SANDBOX_COURSE = {
  id: '101',
  name: 'FTT-101: Firearms Safety & Fundamentals',
  course_code: 'FTT-101',
  syllabus_body: '<h1>FTT-101 Syllabus</h1><p>Late assignments are subject to a 10% penalty per day. Office hours: Tue/Thu 2-4 PM MST.</p>',
};

export const SANDBOX_ASSIGNMENTS = [
  {
    id: 101,
    name: 'Week 1 Lab: Safety & Tooling',
    due_at: '2026-11-12T23:59:00Z',
    points_possible: 100,
    has_submitted_submissions: true,
    description: '<h3>Lab Safety Assessment</h3><p>Identify all necessary safety gear and shop inspection steps before tool calibration.</p>',
    rubric: [
      { id: 'crit-1', description: 'Safety inspection checklist', points: 50 },
      { id: 'crit-2', description: 'Equipment calibration steps', points: 50 },
    ],
  },
  {
    id: 102,
    name: 'Week 2 Blueprint Analysis (No Due Date)',
    due_at: null, // Test unexpected nulls (critique §3.2)
    points_possible: 50,
    has_submitted_submissions: false,
    description: '<p>Analyze the schematics provided and record precision tolerances.</p>',
  },
  {
    id: 103,
    name: 'Midterm Examination',
    due_at: '2026-12-01T23:59:00Z',
    points_possible: 150,
    has_submitted_submissions: false,
    description: '<p>Comprehensive evaluation over Modules 1 through 3.</p>',
  },
];

export const SANDBOX_SUBMISSIONS = [
  {
    id: 501,
    assignment_id: 101,
    user_id: 1001, // Alex (demo student)
    score: 95,
    grade: 'A',
    submitted_at: '2026-11-10T14:30:00Z',
    workflow_state: 'graded',
    submission_comments: [
      {
        id: 901,
        author_name: 'Prof. Martinez',
        comment: 'Excellent work adhering to safety protocols.',
        created_at: '2026-11-11T10:00:00Z',
      },
    ],
    assignment: SANDBOX_ASSIGNMENTS[0],
  },
  {
    id: 502,
    assignment_id: 102,
    user_id: 1001,
    score: null,
    grade: null,
    submitted_at: null,
    workflow_state: 'unsubmitted',
    assignment: SANDBOX_ASSIGNMENTS[1],
  },
];

export const SANDBOX_MODULES = [
  {
    id: 1,
    name: 'Module 1: Foundations & Safety',
    state: 'unlocked',
    unlock_at: null,
    items: [
      { id: 11, title: 'Welcome to SDI', type: 'Page', page_url: 'welcome-to-sdi' },
      { id: 12, title: 'Week 1 Lab', type: 'Assignment', content_id: 101 },
    ],
  },
  {
    id: 2,
    name: 'Module 2: Advanced Schematics (Locked)',
    state: 'locked',
    unlock_at: '2026-12-15T00:00:00Z',
    items: [
      { id: 21, title: 'Blueprint Basics', type: 'Page', page_url: 'blueprint-basics' },
    ],
  },
];

export const SANDBOX_PAGES: Record<string, { url: string; title: string; body: string; published: boolean; updated_at: string }> = {
  'welcome-to-sdi': {
    url: 'welcome-to-sdi',
    title: 'Welcome to SDI',
    body: '<h1>Welcome to SDI</h1><p>Welcome to Sonoran Desert Institute! This course covers precision mechanics and craft standards.</p>',
    published: true,
    updated_at: '2026-11-01T00:00:00Z',
  },
  'draft-exam-review': {
    url: 'draft-exam-review',
    title: 'Draft Exam Review (Unpublished)',
    body: '<h1>Unpublished Midterm Answers</h1><p>DO NOT DISTRIBUTE: Question 1 answer is C.</p>',
    published: false, // Student persona must never see this!
    updated_at: '2026-11-15T00:00:00Z',
  },
};

export const SANDBOX_ANNOUNCEMENTS = [
  {
    id: 801,
    title: 'Welcome to Week 2',
    message: '<p>Please review the blueprint specifications before Friday.</p>',
    posted_at: '2026-11-18T09:00:00Z',
  },
];

export const SANDBOX_ENROLLMENTS = [
  {
    id: 1,
    user_id: 1001,
    course_id: 101,
    type: 'StudentEnrollment',
    role: 'Learner',
    enrollment_state: 'active',
  },
  {
    id: 2,
    user_id: 2001,
    course_id: 101,
    type: 'TeacherEnrollment',
    role: 'Instructor',
    enrollment_state: 'active',
  },
  {
    id: 3,
    user_id: 3001,
    course_id: 101,
    type: 'TaEnrollment',
    role: 'TeachingAssistant',
    enrollment_state: 'active',
  },
  {
    id: 4,
    user_id: 3001,
    course_id: 101,
    type: 'StudentEnrollment',
    role: 'Learner',
    enrollment_state: 'active',
  },
];

/**
 * Creates a mock fetch function that routes Canvas REST API calls to the sandbox course fixture.
 */
export function createSandboxFetch(): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    const parsedUrl = new URL(urlStr);
    const pathname = parsedUrl.pathname;
    const asUserId = parsedUrl.searchParams.get('as_user_id');

    // Headers mock
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Request-Cost': '0.05',
      'X-Rate-Limit-Remaining': '699.95',
    });

    const createResponse = (body: unknown, status = 200): Response => {
      return new Response(JSON.stringify(body), {
        status,
        headers,
      });
    };

    // 1. Course details & syllabus
    if (pathname.match(/^\/api\/v1\/courses\/\d+$/)) {
      return createResponse(SANDBOX_COURSE);
    }

    // 2. Student submissions
    if (pathname.includes('/students/submissions')) {
      const studentId = parsedUrl.searchParams.get('student_ids[]');
      const filtered = SANDBOX_SUBMISSIONS.filter(
        (s) => !studentId || String(s.user_id) === String(studentId),
      );
      return createResponse(filtered);
    }

    // 3. Assignment details
    const assignMatch = pathname.match(/\/api\/v1\/courses\/\d+\/assignments\/(\d+)$/);
    if (assignMatch) {
      const aId = parseInt(assignMatch[1], 10);
      const found = SANDBOX_ASSIGNMENTS.find((a) => a.id === aId);
      if (found) return createResponse(found);
      return new Response('Not found', { status: 404 });
    }

    // 4. Assignments list
    if (pathname.match(/\/api\/v1\/courses\/\d+\/assignments$/)) {
      return createResponse(SANDBOX_ASSIGNMENTS);
    }

    // 5. Assignment submissions (for instructor summaries)
    if (pathname.match(/\/api\/v1\/courses\/\d+\/assignments\/\d+\/submissions$/)) {
      return createResponse(SANDBOX_SUBMISSIONS);
    }

    // 6. Announcements
    if (pathname.includes('/announcements')) {
      return createResponse(SANDBOX_ANNOUNCEMENTS);
    }

    // 7. Modules
    if (pathname.includes('/modules')) {
      return createResponse(SANDBOX_MODULES);
    }

    // 8. Pages
    const pageMatch = pathname.match(/\/api\/v1\/courses\/\d+\/pages\/(.+)$/);
    if (pageMatch) {
      const slug = pageMatch[1];
      const page = SANDBOX_PAGES[slug];
      if (page) {
        return createResponse(page);
      }
      return new Response('Page not found', { status: 404 });
    }

    // 9. Enrollments
    if (pathname.includes('/enrollments')) {
      const userId = parsedUrl.searchParams.get('user_id') || asUserId;
      const filtered = SANDBOX_ENROLLMENTS.filter(
        (e) => !userId || String(e.user_id) === String(userId),
      );
      return createResponse(filtered);
    }

    return new Response(JSON.stringify({ message: 'Mock endpoint not handled', path: pathname }), {
      status: 404,
      headers,
    });
  };
}
