import { CollegeConfig, DemoPersona } from '@ai-tutor/core';

export const SDI_DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'demo_student',
    name: 'Demo Student (Alex)',
    canvasUserId: '1001',
    role: 'student',
    description: 'Enrolled learner in FTT-101 (Safety & Fundamentals)',
  },
  {
    id: 'demo_instructor',
    name: 'Demo Instructor (Prof. Martinez)',
    canvasUserId: '2001',
    role: 'instructor',
    description: 'Course instructor with full grading & course permissions',
  },
  {
    id: 'demo_ta',
    name: 'Demo TA (Jordan)',
    canvasUserId: '3001',
    role: 'instructor',
    description: 'Teaching assistant with mixed role permissions',
  },
];

export const SDI_COLLEGE_CONFIG: CollegeConfig = {
  id: 'sdi',
  name: 'Sonoran Desert Institute',
  domain: 'classroom.sdi.edu',
  defaultCourseSetting: 'full',
  theme: {
    brandColor: '#D50032',
    primaryActionColor: '#D50032',
    surfaceColor: '#EDEAE6',
    fontBody: 'Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontDisplay: '"prohibition", "Impact", "Arial Black", sans-serif',
  },
  crisis: {
    hotlineName: '988 Suicide & Crisis Lifeline',
    phone: '988',
    sms: '988',
    url: 'https://988lifeline.org',
    message:
      'If you or someone you know is struggling or in crisis, help is available. Speak or text with someone at 988, or reach out to SDI Student Support.',
  },
  personaCopy: {
    tutorName: 'SDI AI Tutor',
    greetingStudent:
      'Hello! I am your SDI AI Tutor. I can help answer questions about your deadlines, assignments, and guide you through your course material.',
    greetingInstructor:
      'Welcome, Instructor. I can help look up assignment submissions, summarize gradebook data, and draft course materials.',
  },
};
