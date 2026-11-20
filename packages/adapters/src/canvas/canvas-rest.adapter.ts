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
import { CanvasClient } from './canvas-client.js';
import { htmlToMarkdown } from './html-to-markdown.js';
import {
  CanvasAssignmentSchema,
  CanvasSubmissionSchema,
  CanvasCourseSchema,
  CanvasModuleSchema,
  CanvasPageSchema,
  CanvasAnnouncementSchema,
} from './canvas-schemas.js';

export class CanvasRestAdapter implements LmsPort {
  constructor(private client: CanvasClient) {}

  async getEnrolledCourses(userId: string): Promise<EnrolledCourse[]> {
    const res = await this.client.getAllPages<unknown>(
      `/api/v1/courses`,
      {
        asUserId: userId,
        query: {
          enrollment_state: 'active',
          'include[]': ['term'],
        },
      },
    );

    const courses: EnrolledCourse[] = [];
    for (const item of res) {
      const parsed = CanvasCourseSchema.safeParse(item);
      if (parsed.success) {
        courses.push({
          id: parsed.data.id,
          name: parsed.data.name,
          courseCode: parsed.data.course_code || parsed.data.name,
        });
      }
    }
    return courses;
  }

  async getCrossCourseUpcomingAssignments(userId: string): Promise<CrossCourseAssignment[]> {
    const courses = await this.getEnrolledCourses(userId);
    const crossAssignments: CrossCourseAssignment[] = [];

    for (const course of courses) {
      try {
        const assignments = await this.getUpcomingAssignments(course.id, userId);
        for (const a of assignments) {
          crossAssignments.push({
            ...a,
            courseId: course.id,
            courseName: course.name,
          });
        }
      } catch {
        // If student cannot access a specific course's assignments, continue
      }
    }

    crossAssignments.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    return crossAssignments;
  }

  async getStudentGrades(courseId: string, userId: string): Promise<GradeRecord[]> {
    // Canvas endpoint: /api/v1/courses/:id/students/submissions
    const res = await this.client.getAllPages<unknown>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/students/submissions`,
      {
        asUserId: userId,
        query: {
          'student_ids[]': [userId],
          'include[]': ['assignment', 'submission_comments'],
        },
      },
    );

    const grades: GradeRecord[] = [];
    for (const item of res) {
      const parsed = CanvasSubmissionSchema.safeParse(item);
      if (parsed.success) {
        const sub = parsed.data;
        const feedback = sub.submission_comments?.map((c) => c.comment).join('\n') || undefined;
        grades.push({
          assignmentId: sub.assignment_id,
          assignmentName: sub.assignment?.name || `Assignment #${sub.assignment_id}`,
          score: sub.score ?? null,
          possiblePoints: sub.assignment?.points_possible ?? null,
          grade: sub.grade ?? null,
          feedback,
          submittedAt: sub.submitted_at ?? undefined,
        });
      }
    }

    return grades;
  }

  async getUpcomingAssignments(courseId: string, userId: string): Promise<AssignmentSummary[]> {
    const res = await this.client.getAllPages<unknown>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments`,
      {
        asUserId: userId,
        query: {
          order_by: 'due_at',
        },
      },
    );

    const assignments: AssignmentSummary[] = [];
    for (const item of res) {
      const parsed = CanvasAssignmentSchema.safeParse(item);
      if (parsed.success) {
        const a = parsed.data;
        assignments.push({
          id: a.id,
          name: a.name,
          dueAt: a.due_at ?? null,
          pointsPossible: a.points_possible ?? null,
          hasSubmitted: !!a.has_submitted_submissions,
        });
      }
    }

    return assignments;
  }

  async getAssignmentDetails(
    courseId: string,
    assignmentId: string,
    userId: string,
  ): Promise<AssignmentDetail> {
    const res = await this.client.get<unknown>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`,
      { asUserId: userId },
    );

    const a = CanvasAssignmentSchema.parse(res.data);
    const rubric = a.rubric?.map((r) => ({
      id: r.id,
      description: r.description,
      points: r.points,
    }));

    return {
      id: a.id,
      name: a.name,
      dueAt: a.due_at ?? null,
      pointsPossible: a.points_possible ?? null,
      hasSubmitted: !!a.has_submitted_submissions,
      description: htmlToMarkdown(a.description),
      rubric,
    };
  }

  async getSyllabus(courseId: string, userId: string): Promise<string> {
    const res = await this.client.get<unknown>(`/api/v1/courses/${encodeURIComponent(courseId)}`, {
      asUserId: userId,
      query: {
        'include[]': ['syllabus_body'],
      },
    });

    const course = CanvasCourseSchema.parse(res.data);
    return htmlToMarkdown(course.syllabus_body);
  }

  async getAnnouncements(courseId: string, userId: string): Promise<Announcement[]> {
    const res = await this.client.getAllPages<unknown>(`/api/v1/announcements`, {
      asUserId: userId,
      query: {
        'context_codes[]': [`course_${encodeURIComponent(courseId)}`],
      },
    });

    const announcements: Announcement[] = [];
    for (const item of res) {
      const parsed = CanvasAnnouncementSchema.safeParse(item);
      if (parsed.success) {
        const ann = parsed.data;
        announcements.push({
          id: ann.id,
          title: ann.title,
          message: htmlToMarkdown(ann.message),
          postedAt: ann.posted_at,
        });
      }
    }

    return announcements;
  }

  async getCourseModules(courseId: string, userId: string): Promise<ModuleSummary[]> {
    const res = await this.client.getAllPages<unknown>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules`,
      {
        asUserId: userId,
        query: {
          'include[]': ['items'],
        },
      },
    );

    const modules: ModuleSummary[] = [];
    for (const item of res) {
      const parsed = CanvasModuleSchema.safeParse(item);
      if (parsed.success) {
        const mod = parsed.data;
        const isLocked = mod.state === 'locked' || (mod.unlock_at ? new Date(mod.unlock_at) > new Date() : false);
        modules.push({
          id: mod.id,
          name: mod.name,
          isLocked,
          items: (mod.items || []).map((i) => ({
            id: i.id,
            title: i.title,
            type: i.type,
            url: i.page_url || i.html_url,
          })),
        });
      }
    }

    return modules;
  }

  async getCoursePage(courseId: string, pageUrl: string, userId: string): Promise<PageDetail> {
    const res = await this.client.get<unknown>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/pages/${encodeURIComponent(pageUrl)}`,
      { asUserId: userId },
    );

    const page = CanvasPageSchema.parse(res.data);

    // Visibility gate: student persona cannot see unpublished page (critique §8, plan Phase 2)
    if (page.published === false) {
      throw new Error(`Page is not published or visible: ${pageUrl}`);
    }

    return {
      url: page.url,
      title: page.title,
      body: htmlToMarkdown(page.body),
      updatedAt: page.updated_at || new Date().toISOString(),
      isPublished: page.published ?? true,
    };
  }

  async getSubmissionSummaries(courseId: string, assignmentId?: string, asUserId?: string): Promise<SubmissionSummary[]> {
    // Instructor tool (critique §3.14): Minimal student disclosure
    const encodedCourse = encodeURIComponent(courseId);
    const assignmentsRes = await this.client.getAllPages<unknown>(
      `/api/v1/courses/${encodedCourse}/assignments`,
      asUserId ? { asUserId } : undefined,
    );

    const summaries: SubmissionSummary[] = [];
    for (const aRaw of assignmentsRes) {
      const a = CanvasAssignmentSchema.parse(aRaw);
      if (assignmentId && a.id !== assignmentId) continue;

      const submissions = await this.client.getAllPages<unknown>(
        `/api/v1/courses/${encodedCourse}/assignments/${encodeURIComponent(a.id)}/submissions`,
        asUserId ? { asUserId } : undefined,
      );

      let submitted = 0;
      let graded = 0;

      for (const sRaw of submissions) {
        const s = CanvasSubmissionSchema.parse(sRaw);
        if (s.submitted_at || s.workflow_state === 'submitted' || s.workflow_state === 'graded') {
          submitted++;
        }
        if (s.workflow_state === 'graded' || s.score !== null) {
          graded++;
        }
      }

      const total = submissions.length;
      summaries.push({
        assignmentId: a.id,
        assignmentName: a.name,
        totalEnrolled: total,
        submittedCount: submitted,
        unsubmittedCount: Math.max(0, total - submitted),
        gradedCount: graded,
      });
    }

    return summaries;
  }

  async getGradebookSummary(courseId: string, asUserId?: string): Promise<GradebookSummary> {
    const encodedCourse = encodeURIComponent(courseId);
    const assignmentsRes = await this.client.getAllPages<unknown>(
      `/api/v1/courses/${encodedCourse}/assignments`,
      asUserId ? { asUserId } : undefined,
    );

    const parsedAssignments = assignmentsRes
      .map((aRaw) => CanvasAssignmentSchema.safeParse(aRaw))
      .filter((r): r is { success: true; data: ReturnType<typeof CanvasAssignmentSchema.parse> } => r.success)
      .map((r) => r.data);

    const pointsByAssignment = new Map<string, number>();
    for (const a of parsedAssignments) {
      if (typeof a.points_possible === 'number' && a.points_possible > 0) {
        pointsByAssignment.set(a.id, a.points_possible);
      }
    }

    const scorePercentages: number[] = [];
    for (const a of parsedAssignments) {
      const submissions = await this.client.getAllPages<unknown>(
        `/api/v1/courses/${encodedCourse}/assignments/${encodeURIComponent(a.id)}/submissions`,
        asUserId ? { asUserId } : undefined,
      );

      for (const sRaw of submissions) {
        const sParsed = CanvasSubmissionSchema.safeParse(sRaw);
        if (!sParsed.success) continue;
        const s = sParsed.data;
        if (s.assignment_id !== a.id) continue;

        const pointsPossible = pointsByAssignment.get(a.id);
        if (typeof s.score === 'number' && pointsPossible && pointsPossible > 0) {
          scorePercentages.push((s.score / pointsPossible) * 100);
        }
      }
    }

    if (scorePercentages.length === 0) {
      return {
        courseId,
        averageScorePercent: 0,
        medianScorePercent: 0,
        assignmentCount: parsedAssignments.length,
      };
    }

    scorePercentages.sort((x, y) => x - y);
    const sum = scorePercentages.reduce((acc, v) => acc + v, 0);
    const average = sum / scorePercentages.length;

    const mid = Math.floor(scorePercentages.length / 2);
    const median =
      scorePercentages.length % 2 === 1
        ? scorePercentages[mid]
        : (scorePercentages[mid - 1] + scorePercentages[mid]) / 2;

    return {
      courseId,
      averageScorePercent: Math.round(average * 10) / 10,
      medianScorePercent: Math.round(median * 10) / 10,
      assignmentCount: parsedAssignments.length,
    };
  }
}
