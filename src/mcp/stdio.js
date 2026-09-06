import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { createLocalApi, createRemoteApi } from './api.js';
import { getConfig } from '../core/config.js';
import { configureLogger } from '../util/logger.js';
import { PATHS, ensureDataDirs } from '../core/paths.js';
import { loadJobs } from '../core/jobs.js';

export async function startStdioMcp({ standalone = false, baseUrl, apiKey } = {}) {
  ensureDataDirs();
  configureLogger({ dir: PATHS.logs, silent: true });

  const config = getConfig();
  let api;
  if (standalone) {
    loadJobs();
    api = createLocalApi();
  } else {
    const url = baseUrl ?? process.env.PRINTAGENT_URL ?? `http://127.0.0.1:${config.server.port}`;
    const key = apiKey ?? process.env.PRINTAGENT_API_KEY ?? config.auth.apiKeys[0]?.key ?? null;
    api = createRemoteApi({ baseUrl: url, apiKey: key });
  }

  const server = createMcpServer(api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
