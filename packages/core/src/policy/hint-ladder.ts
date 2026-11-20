import { z } from 'zod';
import { QuestionClassification } from './classifier.js';

export const HintLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type HintLevel = z.infer<typeof HintLevelSchema>;

export const TutoringStateSchema = z.object({
  activeConcept: z.string().max(120).optional(),
  attemptCount: z.number().int().nonnegative(),
  hintLevel: HintLevelSchema,
  lastUpdatedAt: z.string().optional(),
});

export type TutoringState = z.infer<typeof TutoringStateSchema>;

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'does',
  'did',
  'doing',
  'will',
  'would',
  'could',
  'should',
  'can',
  'may',
  'might',
  'must',
  'from',
  'into',
  'onto',
  'about',
  'above',
  'below',
  'between',
  'through',
  'during',
  'before',
  'after',
  'over',
  'under',
  'you',
  'your',
  'yours',
  'they',
  'their',
  'them',
  'then',
  'than',
  'there',
  'here',
  'just',
  'like',
  'some',
  'any',
  'not',
  'but',
  'use',
  'using',
  'need',
  'want',
  'tell',
  'give',
  'show',
  'find',
  'make',
  'get',
  'got',
  // Generic tutoring meta / struggle tokens so follow-ups keep the prior topic
  'help',
  'hint',
  'stuck',
  'confused',
  'understand',
  'explain',
  'again',
  'answer',
  'solve',
  'question',
  'please',
  'still',
  'don',
  'dont',
  'cant',
  'more',
  'next',
  'step',
  'try',
  'tried',
  'lab',
  'homework',
  'problem',
  'work',
]);

const CONTINUATION_PHRASES = [
  'stuck',
  'still confused',
  "don't understand",
  'dont understand',
  'do not understand',
  "don't get",
  'dont get',
  'do not get',
  'not getting',
  "still don't",
  'still do not',
  "can't figure",
  'cannot figure',
  'another hint',
  'more help',
  'next step',
  'what next',
  'i tried',
  'is it',
  'did i',
  'why does that',
  'explain again',
  'tell me the answer',
  'give me a hint',
];

function tokenizeConcept(text: string | undefined): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const token of matches) {
    if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= 6) break;
  }

  return tokens;
}

/**
 * Extracts a concise concept signature from a student's question while filtering
 * out stop words and generic struggle/meta phrases.
 */
export function extractConceptSignature(message: string): string | undefined {
  const tokens = tokenizeConcept(message);
  if (tokens.length === 0) return undefined;
  return tokens.join(' ').slice(0, 100);
}

/**
 * Detects whether a message is a continuation or struggle follow-up on the active concept.
 */
export function isContinuationOrStruggle(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 5) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  return CONTINUATION_PHRASES.some((phrase) => lower.includes(phrase));
}

function topicOverlap(a: string | undefined, b: string | undefined): number {
  const tokensA = new Set(tokenizeConcept(a));
  const tokensB = new Set(tokenizeConcept(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const minSize = Math.min(tokensA.size, tokensB.size);
  return minSize === 0 ? 0 : intersection / minSize;
}

/**
 * Advances or preserves per-conversation Socratic tutoring state across turns.
 * Escalates Level 1 -> Level 2 -> Level 3 on repeated struggles/attempts on the same concept,
 * preserves state across logistics questions, and resets to Level 1 on a distinct new topic.
 */
export function advanceTutoringState(
  prev: TutoringState | undefined,
  userMessage: string,
  classification: QuestionClassification,
  now: Date = new Date(),
): TutoringState {
  if (classification === 'logistics') {
    return prev ? { ...prev } : { attemptCount: 0, hintLevel: 1 };
  }

  const candidateConcept = extractConceptSignature(userMessage);
  const timestamp = now.toISOString();

  if (!prev || prev.attemptCount === 0) {
    return {
      activeConcept: candidateConcept || 'course concept',
      attemptCount: 1,
      hintLevel: 1,
      lastUpdatedAt: timestamp,
    };
  }

  const overlap = topicOverlap(prev.activeConcept, candidateConcept);
  const continuingSameTopic =
    isContinuationOrStruggle(userMessage) || !candidateConcept || overlap >= 0.25;

  if (continuingSameTopic) {
    const nextAttempt = prev.attemptCount + 1;
    const nextLevel: HintLevel = nextAttempt <= 1 ? 1 : nextAttempt === 2 ? 2 : 3;
    return {
      activeConcept: prev.activeConcept || candidateConcept || 'course concept',
      attemptCount: nextAttempt,
      hintLevel: nextLevel,
      lastUpdatedAt: timestamp,
    };
  }

  return {
    activeConcept: candidateConcept,
    attemptCount: 1,
    hintLevel: 1,
    lastUpdatedAt: timestamp,
  };
}

/**
 * Formats the current Socratic hint ladder state into a concise server-side system instruction block.
 */
export function buildHintLadderInstruction(state: TutoringState): string {
  const levelDirectives: Record<HintLevel, string> = {
    1: 'Level 1 (Metacognitive Nudge): Ask what the student already knows or has tried, and orient them toward the relevant principle or course material without giving procedural steps or final answers.',
    2: 'Level 2 (Conceptual Scaffold): Provide a targeted conceptual hint, relevant formula/framework name, or concrete analogy, followed by one focused check-in question to test their understanding.',
    3: 'Level 3 (Guided Partial Step): Break the problem down and walk through only the first concrete setup step or partial example, then ask the student to compute or explain the next step themselves. Still NEVER reveal the final answer or complete homework solution.',
  };

  return [
    'SOCRATIC HINT LADDER STATE (Server-Enforced):',
    `- Active Concept: ${state.activeConcept || 'course concept'}`,
    `- Student Attempts: ${state.attemptCount}`,
    `- Current Hint Level: ${state.hintLevel}/3`,
    `- Directive: ${levelDirectives[state.hintLevel]}`,
  ].join('\n');
}
