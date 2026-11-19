export interface CalculationResult {
  expression: string;
  result: string | number;
  unit?: string;
  isError?: boolean;
  errorMessage?: string;
}

export interface DateMathResult {
  baseDate: string;
  operation: 'add' | 'subtract';
  amount: number;
  unit: 'days' | 'weeks' | 'months' | 'years' | 'hours';
  resultDate: string;
  isError?: boolean;
  errorMessage?: string;
}

export interface CalculatorPort {
  evaluate(expression: string): Promise<CalculationResult>;
  calculateDate(options: {
    baseDate: string;
    operation: 'add' | 'subtract';
    amount: number;
    unit: 'days' | 'weeks' | 'months' | 'years' | 'hours';
  }): Promise<DateMathResult>;
}
