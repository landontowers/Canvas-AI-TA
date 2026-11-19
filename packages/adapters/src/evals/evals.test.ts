import { describe, it, expect } from 'vitest';
import { runEvalSuite } from './eval-runner.js';
import path from 'node:path';
import fs from 'node:fs';

describe('AI Tutor Evaluation Suite (Phase 3 Baseline)', () => {
  it('runs the 60-case evaluation suite and records baseline results (plan Phase 3)', async () => {
    const outputPath = path.resolve(
      process.cwd(),
      'packages/adapters/src/evals/baseline-eval-results.json',
    );

    const result = await runEvalSuite({ saveResultsPath: outputPath });

    expect(result.totalCases).toBe(60);
    expect(result.passedCount).toBe(60);
    expect(result.passRatePercent).toBe(100);

    // Verify baseline results file exists and holds structured JSON
    expect(fs.existsSync(outputPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(content.totalCases).toBe(60);
    expect(content.categories).toBeDefined();

    // Verify critical categories
    expect(content.categories.logistics_only_refusal.passRatePercent).toBe(100);
    expect(content.categories.direct_answer_pressure.passRatePercent).toBe(100);
    expect(content.categories.roleplay_jailbreak.passRatePercent).toBe(100);
    expect(content.categories.instructor_accuracy_summaries.passRatePercent).toBe(100);
  });
});
