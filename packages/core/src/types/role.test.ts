import { describe, it, expect } from 'vitest';
import { resolveAssistantRole } from './role.js';

describe('resolveAssistantRole', () => {
  it('resolves Canvas enrollment role strings accurately', () => {
    expect(resolveAssistantRole(['Learner', 'StudentEnrollment'])).toBe('student');
    expect(resolveAssistantRole(['Observer'])).toBe('student');
    expect(resolveAssistantRole(['Instructor'])).toBe('instructor');
    expect(resolveAssistantRole(['TeacherEnrollment'])).toBe('instructor');
    expect(resolveAssistantRole(['TeachingAssistant'])).toBe('instructor');
    expect(resolveAssistantRole(['Learner', 'TaEnrollment'])).toBe('instructor');
  });

  it('resolves IMS LTI 1.3 role URIs accurately', () => {
    expect(
      resolveAssistantRole(['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']),
    ).toBe('student');
    expect(
      resolveAssistantRole(['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student']),
    ).toBe('student');
    expect(
      resolveAssistantRole(['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor']),
    ).toBe('instructor');
    expect(
      resolveAssistantRole([
        'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
      ]),
    ).toBe('instructor');
  });

  it('does not trigger false positives for words containing the substring "ta"', () => {
    expect(resolveAssistantRole(['StudentData', 'StateLearner', 'MetadataViewer'])).toBe('student');
    expect(resolveAssistantRole(['ta'])).toBe('instructor');
    expect(resolveAssistantRole(['course/ta'])).toBe('instructor');
  });
});
