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
