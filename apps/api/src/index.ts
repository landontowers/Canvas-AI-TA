import { loadAppConfig, runMigrations, seedDatabase } from '@ai-tutor/adapters';
import { buildServer } from './server.js';

async function main() {
  const config = loadAppConfig();

  if (config.database.persistenceMode === 'postgres') {
    await runMigrations(config.database.url);
    await seedDatabase(config.database.url);
  }

  const server = buildServer(config);

  const address = await server.listen({
    port: config.server.port,
    host: config.server.host,
  });
  server.log.info(`API server running at ${address}`);
}

main().catch((err) => {
  console.error('API server startup failed:', err);
  process.exit(1);
});
