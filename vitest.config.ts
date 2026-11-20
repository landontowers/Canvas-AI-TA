import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ai-tutor/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@ai-tutor/adapters': path.resolve(__dirname, './packages/adapters/src/index.ts'),
    },
  },
  test: {
    testTimeout: 25000,
    projects: [
      {
        test: {
          name: 'backend',
          testTimeout: 25000,
          include: [
            'packages/**/*.test.ts',
            'apps/api/**/*.test.ts',
          ],
          environment: 'node',
          alias: {
            '@ai-tutor/core': path.resolve(__dirname, './packages/core/src/index.ts'),
            '@ai-tutor/adapters': path.resolve(__dirname, './packages/adapters/src/index.ts'),
          },
        },
      },
      {
        test: {
          name: 'web',
          testTimeout: 25000,
          include: ['apps/web/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          alias: {
            '@ai-tutor/core': path.resolve(__dirname, './packages/core/src/index.ts'),
            '@ai-tutor/adapters': path.resolve(__dirname, './packages/adapters/src/index.ts'),
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'packages/core/src/**/*.ts',
        'packages/adapters/src/**/*.ts',
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/ports/**',
        '**/types/**',
        '**/main.tsx',
        '**/index.ts',
        '**/persistence/seed.ts',
        '**/persistence/reset.ts',
        '**/persistence/schema.ts',
        'scripts/**',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
    },
  },
});
