import { describe, it, expect } from 'vitest';
import { CalculatorPort } from '@virtual-ta/core';

export function runCalculatorContractTests(
  name: string,
  createAdapter: () => CalculatorPort | Promise<CalculatorPort>,
) {
  describe(`Calculator Port Contract: ${name}`, () => {
    it('evaluates exact multi-step arithmetic', async () => {
      const adapter = await createAdapter();
      const result = await adapter.evaluate('(25 * 4) + (150 / 3)');

      expect(result.isError).toBeFalsy();
      expect(Number(result.result)).toBe(150);
    });

    it('handles unit conversions safely', async () => {
      const adapter = await createAdapter();
      const result = await adapter.evaluate('50 mm to inch');

      expect(result.isError).toBeFalsy();
      expect(String(result.result)).toContain('inch');
    });

    it('handles malformed syntax gracefully without crashing', async () => {
      const adapter = await createAdapter();
      const result = await adapter.evaluate('(((5 +');

      expect(result.isError).toBe(true);
      expect(result.errorMessage).toBeDefined();
    });

    it('performs exact date math', async () => {
      const adapter = await createAdapter();
      const result = await adapter.calculateDate({
        baseDate: '2026-11-19T00:00:00.000Z',
        operation: 'add',
        amount: 7,
        unit: 'days',
      });

      expect(result.isError).toBeFalsy();
      expect(result.resultDate).toBe('2026-11-26T00:00:00.000Z');
    });
  });
}
