import {
  CalculatorPort,
  CalculationResult,
  DateMathResult,
} from '@ai-tutor/core';
import { create, all } from 'mathjs';

const MAX_EXPRESSION_LENGTH = 256;

const math = create(all, {});
const limitedEvaluate = math.evaluate;

const disabledFn = (name: string) => () => {
  throw new Error(`Function '${name}' is disabled in calculator sandbox.`);
};

math.import(
  {
    import: disabledFn('import'),
    createUnit: disabledFn('createUnit'),
    evaluate: disabledFn('evaluate'),
    parse: disabledFn('parse'),
    simplify: disabledFn('simplify'),
    derivative: disabledFn('derivative'),
    resolve: disabledFn('resolve'),
    range: disabledFn('range'),
    ones: disabledFn('ones'),
    zeros: disabledFn('zeros'),
    identity: disabledFn('identity'),
    resize: disabledFn('resize'),
  },
  { override: true },
);

export class InProcessCalculatorAdapter implements CalculatorPort {
  async evaluate(expression: string): Promise<CalculationResult> {
    const trimmed = expression.trim();
    if (!trimmed) {
      return {
        expression,
        result: '',
        isError: true,
        errorMessage: 'Expression must not be empty.',
      };
    }

    if (trimmed.length > MAX_EXPRESSION_LENGTH) {
      return {
        expression,
        result: '',
        isError: true,
        errorMessage: `Expression exceeds maximum allowed length (${MAX_EXPRESSION_LENGTH} characters).`,
      };
    }

    try {
      // Safe restricted evaluation using mathjs parser, never JS eval()
      const rawResult = limitedEvaluate(trimmed);

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
