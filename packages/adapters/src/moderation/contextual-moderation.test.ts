import { describe, it, expect, vi } from 'vitest';
import { LlmPort } from '@ai-tutor/core';
import { runModerationContractTests } from '../contracts/moderation.contract.js';
import { ContextualModerationAdapter } from './contextual-moderation.adapter.js';

function createMockClassifierLlm(responseText: string | Error): LlmPort {
  return {
    providerName: 'mock-classifier',
    getCapabilities: () => ({
      streaming: false,
      parallelToolCalls: false,
      reasoning: false,
      maxContextTokens: 8192,
      structuredOutput: true,
      supportsPromptCaching: false,
    }),
    generate: vi.fn(async () => {
      if (responseText instanceof Error) {
        throw responseText;
      }
      return { text: responseText };
    }),
    async *stream() {
      yield { type: 'done', conversationId: 'c', messageId: 'm' };
    },
  };
}

describe('ContextualModerationAdapter', () => {
  runModerationContractTests('ContextualModerationAdapter', () => new ContextualModerationAdapter());

  it('does not falsely flag legitimate firearms technology and gunsmithing terminology', async () => {
    const adapter = new ContextualModerationAdapter();
    const prompts = [
      'How do I adjust trigger pull weight without making the firing pin sear unsafe?',
      'What is the chamber pressure tolerance for a 5.56 barrel?',
      'Why does a suicide grip happen when gripping a pistol slide improperly?',
      'How do primer seating depth and recoil affect firearm safety?',
    ];

    for (const prompt of prompts) {
      const result = await adapter.checkContent(prompt, { userId: 'user-1001' });
      expect(result.crisisDetected).toBe(false);
      expect(result.flagged).toBe(false);
    }
  });

  it('detects explicit self-harm lexical phrases immediately at stage lexical', async () => {
    const adapter = new ContextualModerationAdapter({
      crisisMessage: 'Call 988 immediately.',
    });

    const result = await adapter.checkContent('I feel like I want to kill myself tonight.');
    expect(result.crisisDetected).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.stage).toBe('lexical');
    expect(result.crisisMessage).toBe('Call 988 immediately.');
    expect(result.triggerSnippet).toBe('kill myself');
  });

  it('detects indirect crisis phrases and multi-turn hopelessness accumulation deterministically', async () => {
    const adapter = new ContextualModerationAdapter();

    // Indirect single-turn phrase
    const indirect = await adapter.checkContent('Everyone would be better off without me.');
    expect(indirect.crisisDetected).toBe(true);
    expect(indirect.stage).toBe('contextual');
    expect(indirect.triggerSnippet).toBe('better off without me');

    // Ambiguous phrase WITHOUT prior distress remains safe
    const harmlessSingle = await adapter.checkContent('I want to disappear into my workbench project.');
    expect(harmlessSingle.crisisDetected).toBe(false);

    // Ambiguous hopelessness/goodbye phrase WITH prior distress escalates across turns
    const escalated = await adapter.checkContent('I just want to give up and say goodbye.', {
      userId: 'user-1001',
      courseId: 'sdi-ftt101',
      recentMessages: [
        { role: 'user', content: 'I am completely overwhelmed and feel hopeless this week.' },
        { role: 'assistant', content: 'I hear that things feel heavy right now.' },
      ],
    });
    expect(escalated.crisisDetected).toBe(true);
    expect(escalated.stage).toBe('contextual');
  });

  it('uses Stage 2 contextual classifierLlm when ambiguous distress occurs and strips JSON fences', async () => {
    const benignClassifier = createMockClassifierLlm(
      '```json\n{"crisisDetected": false, "category": "none", "confidence": 0.12, "reason": "Academic coursework frustration"}\n```',
    );
    const adapter = new ContextualModerationAdapter({ classifierLlm: benignClassifier });

    const benignResult = await adapter.checkContent('I feel like everything feels pointless on this lab.', {
      recentMessages: [{ role: 'user', content: 'This assignment is hard.' }],
    });
    expect(benignResult.crisisDetected).toBe(false);
    expect(benignResult.stage).toBe('contextual');

    const crisisClassifier = createMockClassifierLlm(
      '{"crisisDetected": true, "category": "self-harm", "confidence": 0.94, "reason": "Genuine hopelessness"}',
    );
    const alertAdapter = new ContextualModerationAdapter({
      classifierLlm: crisisClassifier,
      crisisMessage: 'Support line 988 is here.',
    });
    const crisisResult = await alertAdapter.checkContent('Nothing matters anymore, nobody would care.');
    expect(crisisResult.crisisDetected).toBe(true);
    expect(crisisResult.stage).toBe('contextual');
    expect(crisisResult.confidence).toBe(0.94);
    expect(crisisResult.crisisMessage).toBe('Support line 988 is here.');
  });

  it('falls back to deterministic contextual rules when classifierLlm throws or returns malformed JSON', async () => {
    const brokenLlm = createMockClassifierLlm(new Error('503 Upstream Timeout'));
    const adapter1 = new ContextualModerationAdapter({ classifierLlm: brokenLlm });

    const res1 = await adapter1.checkContent('I am tired of living like this.');
    expect(res1.crisisDetected).toBe(true);
    expect(res1.stage).toBe('contextual');

    const invalidJsonLlm = createMockClassifierLlm('not json at all');
    const adapter2 = new ContextualModerationAdapter({ classifierLlm: invalidJsonLlm });

    const res2 = await adapter2.checkContent('I am done with everything.', {
      recentMessages: [{ role: 'user', content: 'I feel totally hopeless and worthless.' }],
    });
    expect(res2.crisisDetected).toBe(true);
    expect(res2.stage).toBe('contextual');
  });
});
