import {
  LmsPort,
  GradeRecord,
  AssignmentSummary,
  AssignmentDetail,
  Announcement,
  ModuleSummary,
  PageDetail,
  SubmissionSummary,
  GradebookSummary,
} from '@ai-tutor/core';

export class FakeLmsAdapter implements LmsPort {
  private grades: GradeRecord[] = [
    {
      assignmentId: 'assign-101',
      assignmentName: 'Week 1 Lab: Safety & Tooling',
      score: 95,
      possiblePoints: 100,
      grade: 'A',
      feedback: 'Excellent work adhering to safety protocols.',
      submittedAt: '2026-11-10T14:30:00Z',
    },
    {
      assignmentId: 'assign-102',
      assignmentName: 'Week 2 Blueprint Analysis',
      score: null,
      possiblePoints: 50,
      grade: null,
      feedback: undefined,
    },
  ];

  private assignments: AssignmentDetail[] = [
    {
      id: 'assign-101',
      name: 'Week 1 Lab: Safety & Tooling',
      dueAt: '2026-11-12T23:59:00Z',
      pointsPossible: 100,
      hasSubmitted: true,
      description: 'Complete the safety questionnaire and equipment checklist.',
    },
    {
      id: 'assign-102',
      name: 'Week 2 Blueprint Analysis',
      dueAt: '2026-11-26T23:59:00Z',
      pointsPossible: 50,
      hasSubmitted: false,
      description: 'Analyze the schematic provided in Module 2 and identify tolerances.',
    },
  ];

  private modules: ModuleSummary[] = [
    {
      id: 'mod-1',
      name: 'Module 1: Foundations & Safety',
      isLocked: false,
      items: [
        { id: 'item-1', title: 'Welcome to SDI', type: 'Page', url: 'welcome-to-sdi' },
        { id: 'item-2', title: 'Week 1 Lab', type: 'Assignment', url: 'assign-101' },
      ],
    },
    {
      id: 'mod-2',
      name: 'Module 2: Advanced Schematics (Locked)',
      isLocked: true,
      items: [{ id: 'item-3', title: 'Blueprint Basics', type: 'Page', url: 'blueprint-basics' }],
    },
  ];

  private pages: PageDetail[] = [
    {
      url: 'welcome-to-sdi',
      title: 'Welcome to SDI',
      body: 'Welcome to Sonoran Desert Institute! This course covers precision mechanics and craft standards.',
      updatedAt: '2026-11-01T00:00:00Z',
      isPublished: true,
    },
    {
      url: 'draft-exam-review',
      title: 'Draft Exam Review (Unpublished)',
      body: 'Questions and solutions for the upcoming midterm.',
      updatedAt: '2026-11-15T00:00:00Z',
      isPublished: false,
    },
  ];

  async getStudentGrades(_courseId: string, _userId: string): Promise<GradeRecord[]> {
    return this.grades;
  }

  async getUpcomingAssignments(_courseId: string, _userId: string): Promise<AssignmentSummary[]> {
    return this.assignments.map(({ id, name, dueAt, pointsPossible, hasSubmitted }) => ({
      id,
      name,
      dueAt,
      pointsPossible,
      hasSubmitted,
    }));
  }

  async getAssignmentDetails(
    _courseId: string,
    assignmentId: string,
    _userId: string,
  ): Promise<AssignmentDetail> {
    const found = this.assignments.find((a) => a.id === assignmentId);
    if (!found) {
      throw new Error(`Assignment not found: ${assignmentId}`);
    }
    return found;
  }

  async getSyllabus(_courseId: string, _userId: string): Promise<string> {
    return `# SDI Firearms Technology Course Syllabus\n\n- Course: FTT-101\n- Policies: Late work accepted up to 3 days with a 10% penalty.\n- Office hours: Tuesday and Thursday 2-4 PM MST.`;
  }

  async getAnnouncements(_courseId: string, _userId: string): Promise<Announcement[]> {
    return [
      {
        id: 'ann-1',
        title: 'Welcome to Week 2',
        message: 'Please review the blueprint specifications before Friday.',
        postedAt: '2026-11-18T09:00:00Z',
      },
    ];
  }

  async getCourseModules(_courseId: string, _userId: string): Promise<ModuleSummary[]> {
    // Student should only see unlocked modules or marked locked
    return this.modules;
  }

  async getCoursePage(_courseId: string, pageUrl: string, _userId: string): Promise<PageDetail> {
    const page = this.pages.find((p) => p.url === pageUrl);
    if (!page) {
      throw new Error(`Page not found: ${pageUrl}`);
    }
    if (page.isPublished === false) {
      throw new Error(`Page is not published or visible: ${pageUrl}`);
    }
    return page;
  }

  async getSubmissionSummaries(_courseId: string, _assignmentId?: string): Promise<SubmissionSummary[]> {
    return [
      {
        assignmentId: 'assign-101',
        assignmentName: 'Week 1 Lab: Safety & Tooling',
        totalEnrolled: 25,
        submittedCount: 24,
        unsubmittedCount: 1,
        gradedCount: 24,
      },
      {
        assignmentId: 'assign-102',
        assignmentName: 'Week 2 Blueprint Analysis',
        totalEnrolled: 25,
        submittedCount: 18,
        unsubmittedCount: 7,
        gradedCount: 10,
      },
    ];
  }

  async getGradebookSummary(courseId: string): Promise<GradebookSummary> {
    return {
      courseId,
      averageScorePercent: 88.5,
      medianScorePercent: 91.0,
      assignmentCount: 2,
    };
  }
}
