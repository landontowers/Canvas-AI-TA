import { loadAppConfig } from '@ai-tutor/adapters';
import { buildServer } from './server.js';

const config = loadAppConfig();
const server = buildServer(config);

server.listen({ port: config.server.port, host: config.server.host }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`API server running at ${address}`);
});
