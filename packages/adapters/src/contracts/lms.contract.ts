import { describe, it, expect } from 'vitest';
import { LmsPort } from '@ai-tutor/core';

export function runLmsContractTests(name: string, createAdapter: () => LmsPort | Promise<LmsPort>) {
  describe(`LMS Port Contract: ${name}`, () => {
    it('retrieves student grades', async () => {
      const adapter = await createAdapter();
      const grades = await adapter.getStudentGrades('sdi-101', 'user-1');

      expect(Array.isArray(grades)).toBe(true);
      if (grades.length > 0) {
        expect(grades[0]).toHaveProperty('assignmentId');
        expect(grades[0]).toHaveProperty('assignmentName');
      }
    });

    it('retrieves upcoming assignments with details', async () => {
      const adapter = await createAdapter();
      const assignments = await adapter.getUpcomingAssignments('sdi-101', 'user-1');

      expect(Array.isArray(assignments)).toBe(true);
      if (assignments.length > 0) {
        const detail = await adapter.getAssignmentDetails('sdi-101', assignments[0].id, 'user-1');
        expect(detail.id).toBe(assignments[0].id);
        expect(detail).toHaveProperty('description');
      }
    });

    it('retrieves syllabus and announcements', async () => {
      const adapter = await createAdapter();
      const syllabus = await adapter.getSyllabus('sdi-101', 'user-1');
      expect(typeof syllabus).toBe('string');

      const announcements = await adapter.getAnnouncements('sdi-101', 'user-1');
      expect(Array.isArray(announcements)).toBe(true);
    });

    it('enforces visibility rules: rejects unpublished pages', async () => {
      const adapter = await createAdapter();
      await expect(
        adapter.getCoursePage('sdi-101', 'draft-exam-review', 'user-1'),
      ).rejects.toThrow();
    });

    it('provides instructor submission and gradebook summaries', async () => {
      const adapter = await createAdapter();
      const summaries = await adapter.getSubmissionSummaries('sdi-101');
      expect(Array.isArray(summaries)).toBe(true);

      const gradebook = await adapter.getGradebookSummary('sdi-101');
      expect(gradebook).toHaveProperty('averageScorePercent');
      expect(gradebook).toHaveProperty('medianScorePercent');
    });
  });
}
