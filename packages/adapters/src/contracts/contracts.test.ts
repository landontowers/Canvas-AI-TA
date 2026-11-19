import { describe } from 'vitest';
import { FakeLlmAdapter } from '../fake/fake-llm.adapter.js';
import { FakeLmsAdapter } from '../fake/fake-lms.adapter.js';
import { FakeIdentityAdapter } from '../fake/fake-identity.adapter.js';
import { InProcessCalculatorAdapter } from '../fake/in-process-calculator.adapter.js';
import { InMemoryPersistenceAdapter } from '../fake/in-memory-persistence.adapter.js';
import { FakeModerationAdapter } from '../fake/fake-moderation.adapter.js';
import { NoopTelemetryAdapter } from '../fake/noop-telemetry.adapter.js';

import { runLlmContractTests } from './llm.contract.js';
import { runLmsContractTests } from './lms.contract.js';
import { runIdentityContractTests } from './identity.contract.js';
import { runCalculatorContractTests } from './calculator.contract.js';
import { runPersistenceContractTests } from './persistence.contract.js';
import { runModerationContractTests } from './moderation.contract.js';
import { runTelemetryContractTests } from './telemetry.contract.js';

describe('Port Contract Tests Suite', () => {
  runLlmContractTests('FakeLlmAdapter', () => new FakeLlmAdapter());
  runLmsContractTests('FakeLmsAdapter', () => new FakeLmsAdapter());
  runIdentityContractTests('FakeIdentityAdapter', () => new FakeIdentityAdapter());
  runCalculatorContractTests('InProcessCalculatorAdapter', () => new InProcessCalculatorAdapter());
  runPersistenceContractTests('InMemoryPersistenceAdapter', () => new InMemoryPersistenceAdapter());
  runModerationContractTests('FakeModerationAdapter', () => new FakeModerationAdapter());
  runTelemetryContractTests('NoopTelemetryAdapter', () => new NoopTelemetryAdapter());
});
