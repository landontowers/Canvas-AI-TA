/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-no-adapters-or-apps',
      comment:
        'Hexagonal architecture rule: packages/core must never depend on packages/adapters or apps',
      severity: 'error',
      from: {
        path: '^packages/core',
      },
      to: {
        path: '^(packages/adapters|apps)',
      },
    },
    {
      name: 'core-no-vendor-sdk',
      comment:
        'Hexagonal architecture rule: packages/core must never depend on vendor SDKs or DB libraries',
      severity: 'error',
      from: {
        path: '^packages/core',
      },
      to: {
        pathNot: 'zod',
        dependencyTypes: ['npm'],
      },
    },
    {
      name: 'core-no-node-builtins',
      comment:
        'Hexagonal architecture rule: packages/core must stay runtime-agnostic with no Node built-in imports',
      severity: 'error',
      from: {
        path: '^packages/core',
      },
      to: {
        dependencyTypes: ['core'],
      },
    },
    {
      name: 'adapters-no-apps',
      comment: 'Adapters must not depend on apps',
      severity: 'error',
      from: {
        path: '^packages/adapters',
      },
      to: {
        path: '^apps',
      },
    },
    {
      name: 'web-no-adapters-or-api',
      comment: 'Frontend apps/web must not import server adapters or apps/api',
      severity: 'error',
      from: {
        path: '^apps/web',
      },
      to: {
        path: '^(packages/adapters|apps/api)',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: '(node_modules|dist)',
    },
    exclude: {
      path: 'dist',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};
