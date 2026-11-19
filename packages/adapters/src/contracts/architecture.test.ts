import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Architecture Boundary Verification', () => {
  it('passes when core follows hexagonal architecture rules', () => {
    const output = execSync('pnpm dep-check', { encoding: 'utf-8' });
    expect(output).toContain('no dependency violations found');
  });

  it('catches a deliberate violation if core attempts to import adapters', () => {
    const rootDir = process.cwd();
    const violationFile = path.resolve(rootDir, 'packages/core/src/deliberate-violation.tmp.ts');
    try {
      fs.writeFileSync(
        violationFile,
        "import { FakeLlmAdapter } from '../../adapters/src/fake/fake-llm.adapter.js';\nexport const x = FakeLlmAdapter;\n",
      );

      let threw = false;
      try {
        execSync('pnpm dep-check', { encoding: 'utf-8', stdio: 'pipe' });
      } catch (err: unknown) {
        threw = true;
        const output = String((err as { stdout?: Buffer; stderr?: Buffer }).stdout || '');
        expect(output).toContain('core-no-adapters-or-apps');
      }
      expect(threw).toBe(true);
    } finally {
      if (fs.existsSync(violationFile)) {
        fs.unlinkSync(violationFile);
      }
    }
  });
});
