export interface CourseContentPort {
  fetchPageContent(params: {
    courseId: string;
    pageUrl: string;
    userId: string;
  }): Promise<string>;

  fetchAssignmentDescription(params: {
    courseId: string;
    assignmentId: string;
    userId: string;
  }): Promise<string>;

  fetchSyllabusContent(params: {
    courseId: string;
    userId: string;
  }): Promise<string>;
}
