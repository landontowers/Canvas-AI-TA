import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Architecture Boundary Verification', () => {
  const rootDir = fs.existsSync(path.resolve(process.cwd(), 'pnpm-workspace.yaml'))
    ? process.cwd()
    : path.resolve(process.cwd(), '../..');

  it('passes when core follows hexagonal architecture rules', { timeout: 30000 }, () => {
    const output = execSync('pnpm dep-check', { cwd: rootDir, encoding: 'utf-8' });
    expect(output).toContain('no dependency violations found');
  });

  it('catches a deliberate violation if core attempts to import adapters', { timeout: 30000 }, () => {
    const violationFile = path.resolve(rootDir, 'packages/core/src/deliberate-violation.tmp.ts');
    try {
      fs.writeFileSync(
        violationFile,
        "import { FakeLlmAdapter } from '../../adapters/src/fake/fake-llm.adapter.js';\nexport const x = FakeLlmAdapter;\n",
      );

      let threw = false;
      try {
        execSync('pnpm dep-check', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
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

  it('catches Node built-in imports in core and adapter imports in web', { timeout: 30000 }, () => {
    const coreBuiltinViolation = path.resolve(rootDir, 'packages/core/src/builtin-violation.tmp.ts');
    const webAdapterViolation = path.resolve(rootDir, 'apps/web/src/adapter-violation.tmp.ts');
    try {
      fs.writeFileSync(
        coreBuiltinViolation,
        "import crypto from 'node:crypto';\nexport const h = crypto.randomUUID();\n",
      );
      let coreThrew = false;
      try {
        execSync('pnpm dep-check', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch (err: unknown) {
        coreThrew = true;
        const output = String((err as { stdout?: Buffer; stderr?: Buffer }).stdout || '');
        expect(output).toContain('core-no-node-builtins');
      }
      expect(coreThrew).toBe(true);
      fs.unlinkSync(coreBuiltinViolation);

      fs.writeFileSync(
        webAdapterViolation,
        "import { FakeIdentityAdapter } from '../../../packages/adapters/src/fake/fake-identity.adapter.js';\nexport const a = FakeIdentityAdapter;\n",
      );
      let webThrew = false;
      try {
        execSync('pnpm dep-check', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
      } catch (err: unknown) {
        webThrew = true;
        const output = String((err as { stdout?: Buffer; stderr?: Buffer }).stdout || '');
        expect(output).toContain('web-no-adapters-or-api');
      }
      expect(webThrew).toBe(true);
    } finally {
      if (fs.existsSync(coreBuiltinViolation)) fs.unlinkSync(coreBuiltinViolation);
      if (fs.existsSync(webAdapterViolation)) fs.unlinkSync(webAdapterViolation);
    }
  });
});
