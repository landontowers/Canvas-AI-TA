import {
  CalculatorPort,
  CalculationResult,
  DateMathResult,
} from '@ai-tutor/core';
import { create, all } from 'mathjs';

const math = create(all, {});

export class InProcessCalculatorAdapter implements CalculatorPort {
  async evaluate(expression: string): Promise<CalculationResult> {
    try {
      // Safe arithmetic evaluation using mathjs parser, never JS eval()
      const compiled = math.compile(expression);
      const rawResult = compiled.evaluate();

      if (rawResult && typeof rawResult === 'object' && 'format' in rawResult) {
        return {
          expression,
          result: rawResult.format(),
        };
      }

      return {
        expression,
        result: typeof rawResult === 'number' || typeof rawResult === 'string' ? rawResult : String(rawResult),
      };
    } catch (err: unknown) {
      return {
        expression,
        result: '',
        isError: true,
        errorMessage: err instanceof Error ? err.message : 'Calculation error',
      };
    }
  }

  async calculateDate(options: {
    baseDate: string;
    operation: 'add' | 'subtract';
    amount: number;
    unit: 'days' | 'weeks' | 'months' | 'years' | 'hours';
  }): Promise<DateMathResult> {
    try {
      const date = new Date(options.baseDate);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid base date: ${options.baseDate}`);
      }

      const multiplier = options.operation === 'add' ? 1 : -1;
      const amount = options.amount * multiplier;

      switch (options.unit) {
        case 'hours':
          date.setHours(date.getHours() + amount);
          break;
        case 'days':
          date.setDate(date.getDate() + amount);
          break;
        case 'weeks':
          date.setDate(date.getDate() + amount * 7);
          break;
        case 'months':
          date.setMonth(date.getMonth() + amount);
          break;
        case 'years':
          date.setFullYear(date.getFullYear() + amount);
          break;
      }

      return {
        baseDate: options.baseDate,
        operation: options.operation,
        amount: options.amount,
        unit: options.unit,
        resultDate: date.toISOString(),
      };
    } catch (err: unknown) {
      return {
        baseDate: options.baseDate,
        operation: options.operation,
        amount: options.amount,
        unit: options.unit,
        resultDate: '',
        isError: true,
        errorMessage: err instanceof Error ? err.message : 'Date math error',
      };
    }
  }
}
