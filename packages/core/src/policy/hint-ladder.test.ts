import { describe, it, expect } from 'vitest';
import {
  advanceTutoringState,
  buildHintLadderInstruction,
  extractConceptSignature,
  isContinuationOrStruggle,
  TutoringState,
} from './hint-ladder.js';

describe('Stateful Socratic Hint Ladder', () => {
  it('extracts concept signatures while filtering stop words and struggle phrases', () => {
    expect(extractConceptSignature('How do I calculate chamber headspace tolerance?')).toBe(
      'calculate chamber headspace tolerance',
    );
    expect(extractConceptSignature('I am still stuck and confused, please help!')).toBeUndefined();
  });

  it('identifies continuation and struggle follow-ups', () => {
    expect(isContinuationOrStruggle('What next?')).toBe(true);
    expect(isContinuationOrStruggle('I am still confused on how to start this calculation')).toBe(true);
    expect(
      isContinuationOrStruggle(
        'Can you explain the Greenhill formula for barrel rifling twist rate in detail?',
      ),
    ).toBe(false);
  });

  it('escalates hint levels 1 -> 2 -> 3 on same concept, caps at 3, preserves logistics, and resets on topic switch', () => {
    const t0 = new Date('2026-11-20T10:00:00Z');
    const s1 = advanceTutoringState(
      undefined,
      'How do I calculate chamber headspace tolerance?',
      'course_material',
      t0,
    );
    expect(s1.hintLevel).toBe(1);
    expect(s1.attemptCount).toBe(1);
    expect(s1.activeConcept).toContain('headspace');

    // Logistics turn preserves active state without advancing attemptCount
    const logisticsState = advanceTutoringState(
      s1,
      'When is Week 2 Blueprint Analysis due?',
      'logistics',
      t0,
    );
    expect(logisticsState.hintLevel).toBe(1);
    expect(logisticsState.attemptCount).toBe(1);
    expect(logisticsState.activeConcept).toBe(s1.activeConcept);

    // Follow-up struggle escalates to Level 2
    const s2 = advanceTutoringState(
      logisticsState,
      'I am still confused, what should I look at first?',
      'course_material',
      t0,
    );
    expect(s2.hintLevel).toBe(2);
    expect(s2.attemptCount).toBe(2);
    expect(s2.activeConcept).toBe(s1.activeConcept);

    // Third attempt escalates to Level 3 and fourth caps at Level 3
    const s3 = advanceTutoringState(s2, 'I tried subtracting but got stuck again', 'course_material', t0);
    expect(s3.hintLevel).toBe(3);
    expect(s3.attemptCount).toBe(3);

    const s4 = advanceTutoringState(s3, 'Wait I do not get the tolerance check', 'course_material', t0);
    expect(s4.hintLevel).toBe(3);
    expect(s4.attemptCount).toBe(4);

    // Distinct new topic resets back to Level 1
    const reset = advanceTutoringState(
      s4,
      'How do primer anvil geometry and metallurgy affect ignition sensitivity?',
      'course_material',
      t0,
    );
    expect(reset.hintLevel).toBe(1);
    expect(reset.attemptCount).toBe(1);
    expect(reset.activeConcept).toContain('primer');

    // Initial logistics query without prior state yields attemptCount 0 / hintLevel 1
    const emptyLogistics = advanceTutoringState(undefined, 'When is the lab due?', 'logistics', t0);
    expect(emptyLogistics).toEqual({ attemptCount: 0, hintLevel: 1 });
  });

  it('formats distinct directives for Level 1, Level 2, and Level 3', () => {
    const base: TutoringState = { activeConcept: 'headspace tolerance', attemptCount: 1, hintLevel: 1 };
    expect(buildHintLadderInstruction(base)).toContain('Level 1 (Metacognitive Nudge)');
    expect(buildHintLadderInstruction({ ...base, attemptCount: 2, hintLevel: 2 })).toContain(
      'Level 2 (Conceptual Scaffold)',
    );
    expect(buildHintLadderInstruction({ ...base, attemptCount: 3, hintLevel: 3 })).toContain(
      'Level 3 (Guided Partial Step)',
    );
  });
});
