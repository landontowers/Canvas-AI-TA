export interface GradeRecord {
  assignmentId: string;
  assignmentName: string;
  score: number | null;
  possiblePoints: number | null;
  grade: string | null;
  feedback?: string;
  submittedAt?: string;
}

export interface AssignmentSummary {
  id: string;
  name: string;
  dueAt: string | null;
  pointsPossible: number | null;
  hasSubmitted: boolean;
}

export interface AssignmentDetail extends AssignmentSummary {
  description: string;
  rubric?: Array<{ id: string; description: string; points: number }>;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  postedAt: string;
}

export interface ModuleItemSummary {
  id: string;
  title: string;
  type: string;
  url?: string;
}

export interface ModuleSummary {
  id: string;
  name: string;
  items: ModuleItemSummary[];
  isLocked?: boolean;
}

export interface PageDetail {
  url: string;
  title: string;
  body: string;
  updatedAt: string;
  isPublished?: boolean;
}

export interface SubmissionSummary {
  assignmentId: string;
  assignmentName: string;
  totalEnrolled: number;
  submittedCount: number;
  unsubmittedCount: number;
  gradedCount: number;
}

export interface GradebookSummary {
  courseId: string;
  averageScorePercent: number;
  medianScorePercent: number;
  assignmentCount: number;
}

export interface EnrolledCourse {
  id: string;
  name: string;
  courseCode: string;
  enrollmentRole?: string;
}

export interface CrossCourseAssignment extends AssignmentSummary {
  courseId: string;
  courseName: string;
}

export interface LmsPort {
  // Student-accessible methods
  getStudentGrades(courseId: string, userId: string): Promise<GradeRecord[]>;
  getUpcomingAssignments(courseId: string, userId: string): Promise<AssignmentSummary[]>;
  getAssignmentDetails(courseId: string, assignmentId: string, userId: string): Promise<AssignmentDetail>;
  getSyllabus(courseId: string, userId: string): Promise<string>;
  getAnnouncements(courseId: string, userId: string): Promise<Announcement[]>;
  getCourseModules(courseId: string, userId: string): Promise<ModuleSummary[]>;
  getCoursePage(courseId: string, pageUrl: string, userId: string): Promise<PageDetail>;

  // Cross-course student-accessible methods (critique §2)
  getEnrolledCourses(userId: string): Promise<EnrolledCourse[]>;
  getCrossCourseUpcomingAssignments(userId: string): Promise<CrossCourseAssignment[]>;

  // Instructor-only methods
  getSubmissionSummaries(courseId: string, assignmentId?: string): Promise<SubmissionSummary[]>;
  getGradebookSummary(courseId: string): Promise<GradebookSummary>;
}
