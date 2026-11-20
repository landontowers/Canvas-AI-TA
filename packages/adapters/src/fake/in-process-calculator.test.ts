import { describe, it, expect } from 'vitest';
import { InProcessCalculatorAdapter } from './in-process-calculator.adapter.js';

describe('InProcessCalculatorAdapter Security & Determinism Suite', () => {
  const calculator = new InProcessCalculatorAdapter();

  it('evaluates arithmetic expressions and legitimate SDI unit conversions', async () => {
    const arith = await calculator.evaluate('(25 * 4) + (150 / 3)');
    expect(arith.isError).toBeFalsy();
    expect(Number(arith.result)).toBe(150);

    const mmToIn = await calculator.evaluate('50 mm to inch');
    expect(mmToIn.isError).toBeFalsy();
    expect(String(mmToIn.result)).toContain('inch');

    const grainToGram = await calculator.evaluate('55 grain to gram');
    expect(grainToGram.isError).toBeFalsy();
    expect(String(grainToGram.result)).toContain('gram');
  });

  it('handles date math across all supported units and rejects invalid dates', async () => {
    const base = '2026-11-19T12:00:00.000Z';

    const plusHours = await calculator.calculateDate({ baseDate: base, operation: 'add', amount: 2, unit: 'hours' });
    expect(plusHours.isError).toBeFalsy();
    expect(plusHours.resultDate).toBe('2026-11-19T14:00:00.000Z');

    const minusWeeks = await calculator.calculateDate({ baseDate: base, operation: 'subtract', amount: 1, unit: 'weeks' });
    expect(minusWeeks.isError).toBeFalsy();
    expect(minusWeeks.resultDate).toBe('2026-11-12T12:00:00.000Z');

    const plusMonths = await calculator.calculateDate({ baseDate: base, operation: 'add', amount: 1, unit: 'months' });
    expect(plusMonths.isError).toBeFalsy();
    expect(plusMonths.resultDate).toContain('2026-12-19');

    const plusYears = await calculator.calculateDate({ baseDate: base, operation: 'add', amount: 1, unit: 'years' });
    expect(plusYears.isError).toBeFalsy();
    expect(plusYears.resultDate).toContain('2027-11-19');

    const badDate = await calculator.calculateDate({ baseDate: 'not-a-date', operation: 'add', amount: 1, unit: 'days' });
    expect(badDate.isError).toBe(true);
    expect(badDate.errorMessage).toContain('Invalid base date');
  });

  it('rejects empty expressions and oversized expressions above 256 chars', async () => {
    const emptyRes = await calculator.evaluate('   ');
    expect(emptyRes.isError).toBe(true);
    expect(emptyRes.errorMessage).toContain('must not be empty');

    const longExpr = '1+'.repeat(130) + '1';
    const longRes = await calculator.evaluate(longExpr);
    expect(longRes.isError).toBe(true);
    expect(longRes.errorMessage).toContain('maximum allowed length');
  });

  it('blocks DoS matrix allocation and code-injection functions inside mathjs', async () => {
    const dangerousExpressions = [
      'ones(10000, 10000)',
      'zeros(1000, 1000)',
      'range(1, 100000)',
      'identity(500)',
      'import("process")',
      'createUnit("evil", "1 m")',
      'evaluate("2+2")',
    ];

    for (const expr of dangerousExpressions) {
      const res = await calculator.evaluate(expr);
      expect(res.isError, `Expected dangerous expression "${expr}" to fail`).toBe(true);
      expect(res.errorMessage).toContain('disabled');
    }
  });
});
