import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

export const DATA_DIR =
  process.env.PRINTAGENT_DATA_DIR || path.join(os.homedir(), '.printagent');

export const PATHS = {
  data: DATA_DIR,
  config: path.join(DATA_DIR, 'config.json'),
  templates: path.join(DATA_DIR, 'templates'),
  jobs: path.join(DATA_DIR, 'jobs'),
  files: path.join(DATA_DIR, 'files'),
  logs: path.join(DATA_DIR, 'logs'),
  jobsIndex: path.join(DATA_DIR, 'jobs', 'index.json'),
  db: path.join(DATA_DIR, 'printagent.db'),
};

export function ensureDataDirs() {
  for (const dir of [PATHS.data, PATHS.templates, PATHS.jobs, PATHS.files, PATHS.logs]) {
    mkdirSync(dir, { recursive: true });
  }
  return PATHS;
}
