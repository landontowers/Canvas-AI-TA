import {
  LlmPort,
  ModerationCheckOptions,
  ModerationContextMessage,
  ModerationPort,
  ModerationResult,
} from '@virtual-ta/core';

export interface ContextualModerationOptions {
  crisisMessage?: string;
  classifierLlm?: LlmPort;
}

const EXPLICIT_CRISIS_PHRASES = [
  'kill myself',
  'end my life',
  'want to die',
  'cutting myself',
  'harm myself',
  'take my own life',
  'no reason to live',
  'harm others',
  'self-harm',
  'overdose on',
];

const BENIGN_FIREARMS_SUICIDE_IDIOMS = ['suicide grip', 'suicide clutch'];

const INDIRECT_CRISIS_PHRASES = [
  'better off without me',
  'tired of living',
  'end it all',
  "don't want to be here",
  'dont want to be here',
  "can't go on",
  'cant go on',
  'hurt someone',
  'bring a weapon to',
];

const AMBIGUOUS_DISTRESS_CUES = [
  'give up on everything',
  'give up',
  'nothing matters anymore',
  'nobody would care',
  "can't take it anymore",
  'cant take it anymore',
  'done with everything',
  'say goodbye',
  'disappear',
  'pointless',
];

const PRIOR_DISTRESS_CUES = [
  'overwhelmed',
  'hopeless',
  'failing everything',
  'falling apart',
  'worthless',
  'alone',
  'exhausted',
  "can't cope",
  'cant cope',
];

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export class ContextualModerationAdapter implements ModerationPort {
  private crisisMessage: string;
  private classifierLlm?: LlmPort;

  constructor(options: ContextualModerationOptions = {}) {
    this.crisisMessage =
      options.crisisMessage ||
      'If you are experiencing a mental health emergency, please dial 988 or reach out to SDI Student Support.';
    this.classifierLlm = options.classifierLlm;
  }

  private normalizeOptions(
    userIdOrOptions?: string | ModerationCheckOptions,
  ): ModerationCheckOptions {
    if (!userIdOrOptions || typeof userIdOrOptions === 'string') {
      return { userId: userIdOrOptions };
    }
    return userIdOrOptions;
  }

  private checkExplicitLexical(lower: string): string | undefined {
    for (const phrase of EXPLICIT_CRISIS_PHRASES) {
      if (lower.includes(phrase)) {
        return phrase;
      }
    }

    if (lower.includes('suicide')) {
      const stripped = BENIGN_FIREARMS_SUICIDE_IDIOMS.reduce(
        (acc, idiom) => acc.replaceAll(idiom, ''),
        lower,
      );
      if (stripped.includes('suicide')) {
        return 'suicide';
      }
    }

    return undefined;
  }

  private evaluateDeterministicContextual(
    lower: string,
    recentMessages: ModerationContextMessage[],
  ): { detected: boolean; triggerSnippet?: string; reason?: string; confidence: number } {
    const indirectMatch = INDIRECT_CRISIS_PHRASES.find((phrase) => lower.includes(phrase));
    if (indirectMatch) {
      return {
        detected: true,
        triggerSnippet: indirectMatch,
        reason: 'Indirect crisis or severe harm indicator detected',
        confidence: 0.9,
      };
    }

    const ambiguousMatch = AMBIGUOUS_DISTRESS_CUES.find((phrase) => lower.includes(phrase));
    if (ambiguousMatch) {
      const priorText = recentMessages
        .filter((m) => m.role === 'user')
        .map((m) => m.content.toLowerCase())
        .join(' ');
      const hadPriorDistress = PRIOR_DISTRESS_CUES.some((cue) => priorText.includes(cue));

      if (hadPriorDistress) {
        return {
          detected: true,
          triggerSnippet: ambiguousMatch,
          reason: 'Multi-turn crisis distress escalation detected across recent messages',
          confidence: 0.85,
        };
      }
    }

    return {
      detected: false,
      confidence: 0.1,
    };
  }

  private async classifyWithContextLlm(
    content: string,
    recentMessages: ModerationContextMessage[],
  ): Promise<ModerationResult | null> {
    if (!this.classifierLlm) return null;

    const contextWindow = recentMessages.slice(-4);
    const transcript = contextWindow
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = [
      transcript ? `RECENT CONVERSATION:\n${transcript}` : '',
      `CURRENT STUDENT MESSAGE:\n${content}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const response = await this.classifierLlm.generate({
        systemPrompt: [
          'You are a safety and crisis triage classifier for a firearms technology college (SDI) Virtual TA.',
          'CRITICAL DOMAIN RULE: Technical firearms and gunsmithing terms (such as trigger, chamber, barrel, firing pin, primer, headspace, ballistics, recoil, ammunition, rifle, handgun, safety, suicide grip) are NORMAL ACADEMIC COURSEWORK and must NEVER be flagged as crisis unless paired with self-harm or interpersonal violence intent.',
          'Flag crisisDetected=true ONLY for genuine self-harm ideation, suicide intent, hopelessness escalation across turns, or threats of violence toward others.',
          'Respond strictly with valid JSON: {"crisisDetected": boolean, "category": string, "confidence": number, "reason": string}.',
        ].join(' '),
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
        temperature: 0,
      });

      const parsed = JSON.parse(stripCodeFences(response.text)) as {
        crisisDetected?: unknown;
        category?: unknown;
        confidence?: unknown;
        reason?: unknown;
      };

      if (typeof parsed.crisisDetected !== 'boolean') {
        return null;
      }

      const category =
        typeof parsed.category === 'string' && parsed.category.trim().length > 0
          ? parsed.category.trim()
          : 'self-harm';
      const confidence =
        typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
          ? parsed.confidence
          : parsed.crisisDetected
            ? 0.9
            : 0.1;
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
          ? parsed.reason.trim()
          : 'Contextual safety evaluation';

      if (parsed.crisisDetected) {
        return {
          flagged: true,
          categories: [category],
          crisisDetected: true,
          crisisMessage: this.crisisMessage,
          reason,
          triggerSnippet: content.slice(0, 120),
          stage: 'contextual',
          confidence,
        };
      }

      return {
        flagged: false,
        categories: [],
        crisisDetected: false,
        reason,
        stage: 'contextual',
        confidence,
      };
    } catch {
      return null;
    }
  }

  async checkContent(
    content: string,
    userIdOrOptions?: string | ModerationCheckOptions,
  ): Promise<ModerationResult> {
    const options = this.normalizeOptions(userIdOrOptions);
    const lower = content.toLowerCase();

    // Stage 1a: Explicit unambiguous crisis check (with firearms idiom guard)
    const explicitMatch = this.checkExplicitLexical(lower);
    if (explicitMatch) {
      return {
        flagged: true,
        categories: ['self-harm'],
        crisisDetected: true,
        crisisMessage: this.crisisMessage,
        reason: 'Explicit self-harm or crisis signals detected',
        triggerSnippet: explicitMatch,
        stage: 'lexical',
        confidence: 0.99,
      };
    }

    // Stage 1b: Indirect or multi-turn distress cue detection
    const recentMessages = options.recentMessages || [];
    const hasIndirectCue = INDIRECT_CRISIS_PHRASES.some((p) => lower.includes(p));
    const hasAmbiguousCue = AMBIGUOUS_DISTRESS_CUES.some((p) => lower.includes(p));

    if (hasIndirectCue || hasAmbiguousCue) {
      // Stage 2: Domain-aware LLM contextual classification if available
      const llmResult = await this.classifyWithContextLlm(content, recentMessages);
      if (llmResult) {
        return llmResult;
      }

      // Deterministic contextual fallback (or primary when no classifier LLM is configured)
      const fallback = this.evaluateDeterministicContextual(lower, recentMessages);
      if (fallback.detected) {
        return {
          flagged: true,
          categories: ['self-harm'],
          crisisDetected: true,
          crisisMessage: this.crisisMessage,
          reason: fallback.reason,
          triggerSnippet: fallback.triggerSnippet,
          stage: 'contextual',
          confidence: fallback.confidence,
        };
      }
    }

    return {
      flagged: false,
      categories: [],
      crisisDetected: false,
      stage: 'none',
      confidence: 0,
    };
  }
}
