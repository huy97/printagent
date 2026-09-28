import Database from 'better-sqlite3';
import { PATHS, ensureDataDirs } from './paths.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  printer TEXT,
  copies INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  templateId TEXT,
  data TEXT,
  templateSource TEXT,
  engine TEXT,
  page TEXT,
  fileName TEXT,
  filePath TEXT,
  bytes INTEGER,
  options TEXT,
  source TEXT,
  origin TEXT,
  clientId TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  nativeJobId TEXT,
  output TEXT,
  error TEXT,
  errorKey TEXT,
  errorParams TEXT,
  createdAt TEXT NOT NULL,
  startedAt TEXT,
  finishedAt TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_printer_idx ON jobs (printer);
CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs (createdAt);
`;

const ADDED_COLUMNS = [
  ['jobs', 'errorKey', 'TEXT'],
  ['jobs', 'errorParams', 'TEXT'],
];

function migrate(database) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const exists = database.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
    if (!exists) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

let db = null;
const statements = new Map();

export function getDb() {
  if (db) return db;
  ensureDataDirs();
  db = new Database(PATHS.db);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Prepared statements are bound to one connection; cache them by SQL to avoid recompiling on every write.
export function stmt(sql) {
  const database = getDb();
  let cached = statements.get(sql);
  if (!cached) {
    cached = database.prepare(sql);
    statements.set(sql, cached);
  }
  return cached;
}

export function closeDb() {
  statements.clear();
  if (!db) return;
  try {
    db.close();
  } catch (error) {
    log.warn(`Could not close the database: ${error.message}`);
  }
  db = null;
}
