import { EventEmitter } from 'node:events';
import { readFileSync, existsSync, renameSync, rmSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PATHS, ensureDataDirs } from './paths.js';
import { getDb, closeDb, stmt } from './db.js';
import { getConfig } from './config.js';
import { shortId } from '../util/id.js';
import { createLogger } from '../util/logger.js';
import * as printers from '../printers/index.js';
import { AppError, notFound } from '../util/errors.js';
import { t } from '../i18n/index.js';

const log = createLogger('queue');
export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(0);

const pending = [];
let running = 0;

// Running jobs keep a shared reference in `live` so the runner, cancelJob and
// prepare() mutate the same object; the DB remains the source of truth.
const live = new Map();

const ACTIVE_STATUSES = new Set(['queued', 'rendering', 'printing']);
const ACTIVE_LIST = [...ACTIVE_STATUSES];
const FINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);

const COLUMNS = [
  'id', 'type', 'status', 'printer', 'copies', 'title', 'templateId', 'data', 'templateSource',
  'engine', 'page', 'fileName', 'filePath', 'bytes', 'options', 'source', 'origin', 'clientId',
  'attempts', 'nativeJobId', 'output', 'error', 'errorKey', 'errorParams', 'createdAt', 'startedAt', 'finishedAt',
];
const JSON_COLUMNS = new Set(['data', 'page', 'options', 'source', 'errorParams']);

function toRow(job) {
  const row = {};
  for (const column of COLUMNS) {
    const value = job[column];
    if (value === undefined || value === null) {
      row[column] = null;
    } else if (JSON_COLUMNS.has(column)) {
      row[column] = JSON.stringify(value);
    } else {
      row[column] = value;
    }
  }
  // NOT NULL columns: jobs imported from the legacy index.json may lack these fields.
  row.copies = Number(row.copies) || 1;
  row.attempts = Number(row.attempts) || 0;
  row.createdAt = row.createdAt ?? new Date().toISOString();
  return row;
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    printer: row.printer,
    copies: row.copies,
    title: row.title,
    templateId: row.templateId,
    data: parseJson(row.data),
    templateSource: row.templateSource,
    engine: row.engine,
    page: parseJson(row.page),
    fileName: row.fileName,
    filePath: row.filePath,
    bytes: row.bytes,
    options: parseJson(row.options) ?? {},
    source: parseJson(row.source),
    origin: row.origin,
    clientId: row.clientId,
    attempts: row.attempts,
    nativeJobId: row.nativeJobId,
    output: row.output,
    error: row.error,
    errorKey: row.errorKey,
    errorParams: parseJson(row.errorParams),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

const INSERT_SQL = `INSERT INTO jobs (${COLUMNS.join(', ')})
  VALUES (${COLUMNS.map((column) => `:${column}`).join(', ')})`;

// Write every column rather than just the patch: some callers (e.g. prepare() setting
// options.raw) mutate the job in place before calling updateJob with another patch.
const UPDATE_SQL = `UPDATE jobs SET ${COLUMNS.filter((column) => column !== 'id')
  .map((column) => `${column} = :${column}`)
  .join(', ')} WHERE id = :id`;

function insert(job) {
  stmt(INSERT_SQL).run(toRow(job));
}

// Plain UPDATE, no upsert: a job removed by trimJobs must not come back when the
// runner still holds a reference and calls updateJob late.
function save(job) {
  stmt(UPDATE_SQL).run(toRow(job));
}

/**
 * The DB is shared by every process, so only the queue owner (the `start` command)
 * may mark unfinished jobs as failed. A CLI or MCP stdio process running alongside
 * must not conclude that the server's jobs are dead.
 */
export function loadJobs({ recoverInterrupted = false } = {}) {
  ensureDataDirs();
  importLegacyIndex(getDb());
  live.clear();
  if (!recoverInterrupted) return;
  const info = stmt(
    `UPDATE jobs SET status = 'failed', error = ?, errorKey = ?, errorParams = NULL,
       finishedAt = COALESCE(finishedAt, ?)
     WHERE status IN (${ACTIVE_LIST.map(() => '?').join(', ')})`,
  ).run(t('error.job_interrupted'), 'error.job_interrupted', new Date().toISOString(), ...ACTIVE_LIST);
  if (info.changes > 0) {
    log.warn(`Marked ${info.changes} interrupted job(s) as failed`);
  }
}

// Older versions kept job history in jobs/index.json; import it once, then rename the file.
function importLegacyIndex(db) {
  if (!existsSync(PATHS.jobsIndex)) return;
  const backup = `${PATHS.jobsIndex}.migrated`;
  try {
    if (stmt('SELECT COUNT(*) AS total FROM jobs').get().total === 0) {
      const parsed = JSON.parse(readFileSync(PATHS.jobsIndex, 'utf8'));
      // index.json lists the newest job first; insert in reverse so seq grows over time.
      const legacy = Array.isArray(parsed) ? parsed.slice().reverse() : [];
      db.transaction(() => {
        for (const job of legacy) {
          if (job?.id && job.type && job.status) insert(job);
        }
      })();
      if (legacy.length > 0) log.info(`Migrated ${legacy.length} job(s) from index.json to SQLite`);
    }
    renameSync(PATHS.jobsIndex, backup);
  } catch (error) {
    log.warn(`Could not migrate jobs/index.json: ${error.message}`);
  }
}

function emit(event, job) {
  jobEvents.emit(event, job);
  jobEvents.emit('job', { event, job });
}

export function listJobs({ limit = 50, status, printer } = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (printer) {
    clauses.push('printer = ?');
    params.push(printer);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Number(limit) || 50);
  return stmt(`SELECT * FROM jobs ${where} ORDER BY seq DESC LIMIT ?`)
    .all(...params)
    .map((row) => live.get(row.id) ?? rowToJob(row));
}

export function findJob(id) {
  const active = live.get(id);
  if (active) return active;
  return rowToJob(stmt('SELECT * FROM jobs WHERE id = ?').get(id));
}

export function getJob(id) {
  const job = findJob(id);
  if (!job) throw notFound('error.job_not_found', { id });
  return job;
}

export function stats() {
  const counts = {};
  let total = 0;
  for (const row of stmt('SELECT status, COUNT(*) AS total FROM jobs GROUP BY status').all()) {
    counts[row.status] = row.total;
    total += row.total;
  }
  return { total, running, queued: pending.length, counts };
}

export function createJob(input) {
  const job = {
    id: shortId('job'),
    type: input.type,
    status: 'queued',
    printer: input.printer ?? null,
    copies: Number(input.copies) || 1,
    title: input.title ?? 'PrintAgent job',
    templateId: input.templateId ?? null,
    data: input.data ?? null,
    templateSource: input.templateSource ?? null,
    engine: input.engine ?? null,
    page: input.page ?? null,
    fileName: input.fileName ?? null,
    filePath: input.filePath ?? null,
    bytes: input.bytes ?? null,
    options: input.options ?? {},
    source: input.source ?? null,
    origin: input.origin ?? 'api',
    clientId: input.clientId ?? null,
    attempts: 0,
    nativeJobId: null,
    output: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  live.set(job.id, job);
  insert(job);
  trimJobs();
  emit('created', job);
  return job;
}

export function updateJob(job, patch) {
  Object.assign(job, patch);
  if (ACTIVE_STATUSES.has(job.status)) live.set(job.id, job);
  else live.delete(job.id);
  save(job);
  emit('updated', job);
  return job;
}

function trimJobs() {
  const keep = getConfig().queue.keepJobs || 300;
  if (stmt('SELECT COUNT(*) AS total FROM jobs').get().total <= keep) return;
  const removed = stmt(
    `SELECT id, filePath FROM jobs
     WHERE status NOT IN (${ACTIVE_LIST.map(() => '?').join(', ')})
       AND seq < (SELECT MIN(seq) FROM (SELECT seq FROM jobs ORDER BY seq DESC LIMIT ?))`,
  ).all(...ACTIVE_LIST, keep);
  if (removed.length === 0) return;
  const remove = stmt('DELETE FROM jobs WHERE id = ?');
  getDb().transaction(() => {
    for (const row of removed) remove.run(row.id);
  })();
  for (const row of removed) {
    live.delete(row.id);
    if (row.filePath && row.filePath.startsWith(`${PATHS.files}${path.sep}`) && existsSync(row.filePath)) {
      rmSync(row.filePath, { force: true });
    }
  }
}

export function cleanupFiles() {
  const hours = getConfig().queue.keepFilesHours || 48;
  const cutoff = Date.now() - hours * 3600 * 1000;
  if (!existsSync(PATHS.files)) return 0;
  let removed = 0;
  const inUse = new Set(
    stmt(`SELECT filePath FROM jobs WHERE status IN (${ACTIVE_LIST.map(() => '?').join(', ')})`)
      .all(...ACTIVE_LIST)
      .map((row) => row.filePath)
      .filter(Boolean),
  );
  for (const entry of readdirSync(PATHS.files)) {
    const file = path.join(PATHS.files, entry);
    if (inUse.has(file)) continue;
    try {
      if (statSync(file).mtimeMs < cutoff) {
        rmSync(file, { force: true });
        removed += 1;
      }
    } catch {
      // skip files that are still locked
    }
  }
  if (removed > 0) log.info(`Removed ${removed} temporary file(s)`);
  return removed;
}

export function closeJobs() {
  closeDb();
}

/**
 * @param {object} job
 * @param {(job: object) => Promise<{filePath: string, bytes?: number, fileName?: string}>} prepare
 */
export function enqueue(job, prepare) {
  pending.push({ job, prepare });
  drain();
  return job;
}

function drain() {
  const concurrency = Math.max(1, getConfig().queue.concurrency || 1);
  while (running < concurrency && pending.length > 0) {
    const task = pending.shift();
    running += 1;
    runJob(task)
      .catch((error) => log.error(`Job runner error: ${error.message}`))
      .finally(() => {
        running -= 1;
        drain();
      });
  }
}

async function runJob({ job, prepare }) {
  if (job.status === 'canceled') return;
  const config = getConfig().queue;
  updateJob(job, { status: 'rendering', startedAt: new Date().toISOString() });

  try {
    if (prepare) {
      const prepared = await prepare(job);
      updateJob(job, {
        filePath: prepared.filePath ?? job.filePath,
        fileName: prepared.fileName ?? job.fileName,
        bytes: prepared.bytes ?? job.bytes,
      });
    }
  } catch (error) {
    updateJob(job, {
      status: 'failed',
      ...(error instanceof AppError
        ? failure(error.key, error.params)
        : failure('error.prepare_failed', { message: error.message })),
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  if (job.status === 'canceled') return;

  for (let attempt = 1; attempt <= (config.maxRetries || 0) + 1; attempt += 1) {
    if (job.status === 'canceled') return;
    updateJob(job, { status: 'printing', attempts: attempt });
    try {
      const result = await printers.printFile(job.filePath, {
        printer: job.printer,
        copies: job.copies,
        title: job.title,
        duplex: job.options.duplex,
        paperSize: job.options.paperSize,
        orientation: job.options.orientation,
        media: job.options.media,
        extraOptions: job.options.extraOptions,
        fitToPage: job.options.fitToPage,
        raw: job.options.raw,
        rawShareName: job.options.rawShareName,
      });
      updateJob(job, {
        status: 'completed',
        nativeJobId: result.nativeJobId,
        output: result.output,
        ...failure(null),
        finishedAt: new Date().toISOString(),
      });
      log.info(`Job ${job.id} sent to printer ${job.printer}`, { nativeJobId: result.nativeJobId });
      return;
    } catch (error) {
      const message = error.stderr?.trim() || error.message;
      log.warn(`Job ${job.id} failed to print (attempt ${attempt}): ${message}`);
      if (attempt > (config.maxRetries || 0)) {
        updateJob(job, {
          status: 'failed',
          ...failure('error.print_failed', { message }),
          finishedAt: new Date().toISOString(),
        });
        return;
      }
      await delay(config.retryDelayMs || 3000);
    }
  }
}

function failure(key, params) {
  if (!key) return { error: null, errorKey: null, errorParams: null };
  return { error: t(key, params), errorKey: key, errorParams: params ?? null };
}

/** Renders the stored error in the caller's locale; the raw key and params stay on the job. */
export function localizeJob(job, locale) {
  if (!job?.errorKey) return job;
  return { ...job, error: t(job.errorKey, job.errorParams ?? undefined, locale) };
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

export async function cancelJob(id) {
  const job = getJob(id);
  if (FINAL_STATUSES.has(job.status)) return job;
  const index = pending.findIndex((task) => task.job.id === id);
  if (index >= 0) pending.splice(index, 1);
  if (job.nativeJobId) await printers.cancelNativeJob(job.nativeJobId).catch(() => false);
  updateJob(job, { status: 'canceled', finishedAt: new Date().toISOString() });
  return job;
}

export function waitForJob(id, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const job = findJob(id);
    if (!job) {
      resolve(null);
      return;
    }
    if (FINAL_STATUSES.has(job.status)) {
      resolve(job);
      return;
    }
    const timer = setTimeout(() => {
      jobEvents.off('updated', onUpdate);
      resolve(findJob(id) ?? job);
    }, timeoutMs);
    timer.unref?.();
    function onUpdate(updated) {
      if (updated.id !== id) return;
      if (FINAL_STATUSES.has(updated.status)) {
        clearTimeout(timer);
        jobEvents.off('updated', onUpdate);
        resolve(updated);
      }
    }
    jobEvents.on('updated', onUpdate);
  });
}
