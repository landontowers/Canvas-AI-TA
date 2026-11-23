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
  EnrolledCourse,
  CrossCourseAssignment,
} from '@virtual-ta/core';

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
      rubric: [
        { id: 'crit-101-1', description: 'Chamber & Workspace Safety Verification', points: 40 },
        { id: 'crit-101-2', description: 'Tooling Identification & Torque Specs', points: 40 },
        { id: 'crit-101-3', description: 'Clear Documentation & Formatting', points: 20 },
      ],
    },
    {
      id: 'assign-102',
      name: 'Week 2 Blueprint Analysis',
      dueAt: '2026-11-26T23:59:00Z',
      pointsPossible: 50,
      hasSubmitted: false,
      description: 'Analyze the schematic provided in Module 2 and identify tolerances.',
      rubric: [
        { id: 'crit-102-1', description: 'Headspace Tolerance Calculations', points: 25 },
        { id: 'crit-102-2', description: 'Blueprint Callout Identification', points: 15 },
        { id: 'crit-102-3', description: 'Safety & Inspection Notes', points: 10 },
      ],
    },
    {
      id: 'assign-103',
      name: 'Safety Lab 1: Practical Verification',
      dueAt: null,
      pointsPossible: 75,
      hasSubmitted: false,
      description: 'Submit your step-by-step chamber clearance and workspace safety checklist.',
      rubric: [
        { id: 'crit-103-1', description: 'Four Rules of Firearm Safety Applied', points: 35 },
        { id: 'crit-103-2', description: 'Chamber & Magazine Visual/Physical Check', points: 25 },
        { id: 'crit-103-3', description: 'Bench & PPE Readiness', points: 15 },
      ],
    },
    {
      id: 'assign-104',
      name: 'Week 3 Headspace Gauge Lab',
      dueAt: '2026-11-29T23:59:00Z',
      pointsPossible: 100,
      hasSubmitted: false,
      description: 'Document GO, NO-GO, and FIELD gauge checks on a bolt-action receiver.',
      rubric: [
        { id: 'crit-104-1', description: 'GO Gauge Minimum Chamber Verification', points: 40 },
        { id: 'crit-104-2', description: 'NO-GO Gauge Maximum Safe Limit', points: 40 },
        { id: 'crit-104-3', description: 'Measurement Table & Notes', points: 20 },
      ],
    },
    {
      id: 'assign-105',
      name: 'Optional Shop Safety Reflection',
      dueAt: null,
      pointsPossible: 25,
      hasSubmitted: false,
      description: 'Brief reflection on bench PPE and live-ammo isolation procedures.',
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
        { id: 'item-4', title: 'Headspace & SAAMI Gauges', type: 'Page', url: 'headspace-saami-gauges' },
        { id: 'item-5', title: 'Greenhill Twist Rate Guide', type: 'Page', url: 'greenhill-twist-rate' },
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
      url: 'headspace-saami-gauges',
      title: 'Headspace & SAAMI Gauges',
      body: 'A GO gauge verifies minimum SAAMI chamber dimensions; the bolt should close smoothly. A NO-GO gauge tests maximum safe headspace; the bolt must NOT close.',
      updatedAt: '2026-11-08T00:00:00Z',
      isPublished: true,
    },
    {
      url: 'greenhill-twist-rate',
      title: 'Greenhill Twist Rate Guide',
      body: 'Greenhill formula: T = (150 * D^2) / L, where D is bullet diameter in inches and L is bullet length in inches.',
      updatedAt: '2026-11-10T00:00:00Z',
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

  private enrolledCourses: EnrolledCourse[] = [
    {
      id: 'sdi-ftt101',
      name: 'FTT 101: Firearms Industry Fundamentals',
      courseCode: 'FTT 101',
      enrollmentRole: 'student',
    },
    {
      id: 'sdi-ftt104',
      name: 'FTT 104: Modern Sporting Rifles',
      courseCode: 'FTT 104',
      enrollmentRole: 'student',
    },
    {
      id: 'sdi-fbs201',
      name: 'FBS 201: Firearms Basic Ballistics',
      courseCode: 'FBS 201',
      enrollmentRole: 'student',
    },
    {
      id: 'sdi-gun105',
      name: 'GUN 105: Gunsmithing Bench Safety',
      courseCode: 'GUN 105',
      enrollmentRole: 'student',
    },
  ];

  private crossCourseAssignments: CrossCourseAssignment[] = [
    {
      id: 'assign-101',
      name: 'Week 1 Lab: Safety & Tooling',
      courseId: 'sdi-ftt101',
      courseName: 'FTT 101: Firearms Industry Fundamentals',
      dueAt: '2026-11-22T23:59:00Z',
      pointsPossible: 100,
      hasSubmitted: true,
    },
    {
      id: 'assign-104-1',
      name: 'Upper Receiver Assembly Practical',
      courseId: 'sdi-ftt104',
      courseName: 'FTT 104: Modern Sporting Rifles',
      dueAt: '2026-11-24T23:59:00Z',
      pointsPossible: 100,
      hasSubmitted: false,
    },
    {
      id: 'assign-102',
      name: 'Week 2 Blueprint Analysis',
      courseId: 'sdi-ftt101',
      courseName: 'FTT 101: Firearms Industry Fundamentals',
      dueAt: '2026-11-26T23:59:00Z',
      pointsPossible: 50,
      hasSubmitted: false,
    },
    {
      id: 'assign-201-1',
      name: 'Internal Ballistics Calculation Set 1',
      courseId: 'sdi-fbs201',
      courseName: 'FBS 201: Firearms Basic Ballistics',
      dueAt: '2026-11-28T23:59:00Z',
      pointsPossible: 75,
      hasSubmitted: false,
    },
  ];

  async getEnrolledCourses(_userId: string): Promise<EnrolledCourse[]> {
    return this.enrolledCourses;
  }

  async getCrossCourseUpcomingAssignments(_userId: string): Promise<CrossCourseAssignment[]> {
    return this.crossCourseAssignments;
  }

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

  async getSubmissionSummaries(_courseId: string, _assignmentId?: string, _asUserId?: string): Promise<SubmissionSummary[]> {
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
      {
        assignmentId: 'assign-103',
        assignmentName: 'Safety Lab 1: Practical Verification',
        totalEnrolled: 25,
        submittedCount: 21,
        unsubmittedCount: 4,
        gradedCount: 15,
      },
      {
        assignmentId: 'assign-104',
        assignmentName: 'Week 3 Headspace Gauge Lab',
        totalEnrolled: 25,
        submittedCount: 9,
        unsubmittedCount: 16,
        gradedCount: 4,
      },
    ];
  }

  async getGradebookSummary(courseId: string, _asUserId?: string): Promise<GradebookSummary> {
    return {
      courseId,
      averageScorePercent: 88.5,
      medianScorePercent: 91.0,
      assignmentCount: 2,
    };
  }
}
