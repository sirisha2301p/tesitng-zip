import { loadServerConfig } from './config.js';
import { createGameServer } from './server.js';
import { WordBank } from './words/wordBank.js';

const config = loadServerConfig();
const words = WordBank.fromFile();
const server = createGameServer({ server: config, words });

const port = await server.listen();
console.log(`Draw & Guess server listening on http://localhost:${port} (${words.size} words loaded)`);

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down`);
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
