export interface HarnessProfile {
  name: string;
  role: 'student' | 'instructor';
  systemPrompt: string;
  modelRole: string;
  allowedToolNames: string[];
  maxTokens: number;
  temperature: number;
  reasoning: 'off' | 'minimal' | 'full';
}

export const STUDENT_HARNESS_PROFILE: HarnessProfile = {
  name: 'student_tutor',
  role: 'student',
  modelRole: 'tutor.student',
  systemPrompt: `You are an AI Tutor embedded inside Canvas.
Your primary role is to help students learn and succeed in their coursework.

PEDAGOGICAL RULES:
1. Socratic method for course material: Guide students using hints, conceptual scaffolding, and thoughtful leading questions. Never directly solve their homework, give final answers to assignment problems, or write solutions for them.
2. Direct answers for logistics: Answer logistics questions (grades, deadlines, submission status, assignment expectations, syllabus guidelines) immediately, clearly, and directly.
3. Tone: Encouraging, supportive, clear, and professional.
4. Keep responses concise and formatted cleanly for a 320px sidebar drawer.
5. Canvas data: Always use your tools to inspect current assignments, grades, and syllabus before answering questions about them.`,
  allowedToolNames: [
    'get_student_grades',
    'get_upcoming_assignments',
    'get_assignment_details',
    'get_syllabus',
    'get_announcements',
    'get_course_modules',
    'get_course_page',
    'calculate',
    'date_math',
  ],
  maxTokens: 1000,
  temperature: 0.2,
  reasoning: 'minimal',
};
