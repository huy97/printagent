import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PATHS, ensureDataDirs } from './paths.js';
import { getConfig } from './config.js';
import { shortId } from '../util/id.js';
import { createLogger } from '../util/logger.js';
import * as printers from '../printers/index.js';
import { notFound } from '../util/errors.js';
import { t } from '../i18n/index.js';

const log = createLogger('queue');
export const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(0);

let jobs = [];
const pending = [];
let running = 0;
let persistTimer = null;

export function loadJobs() {
  ensureDataDirs();
  if (!existsSync(PATHS.jobsIndex)) return;
  try {
    const parsed = JSON.parse(readFileSync(PATHS.jobsIndex, 'utf8'));
    jobs = Array.isArray(parsed) ? parsed : [];
    for (const job of jobs) {
      if (job.status === 'queued' || job.status === 'rendering' || job.status === 'printing') {
        job.status = 'failed';
        job.error = t('error.job_interrupted');
        job.finishedAt = job.finishedAt ?? new Date().toISOString();
      }
    }
  } catch {
    jobs = [];
  }
}

function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      writeFileSync(PATHS.jobsIndex, JSON.stringify(jobs, null, 2));
    } catch (error) {
      log.warn(`Không ghi được jobs index: ${error.message}`);
    }
  }, 300);
  persistTimer.unref?.();
}

function emit(event, job) {
  jobEvents.emit(event, job);
  jobEvents.emit('job', { event, job });
}

export function listJobs({ limit = 50, status, printer } = {}) {
  return jobs
    .filter((job) => (status ? job.status === status : true))
    .filter((job) => (printer ? job.printer === printer : true))
    .slice(0, Number(limit) || 50);
}

export function findJob(id) {
  return jobs.find((item) => item.id === id) ?? null;
}

export function getJob(id) {
  const job = findJob(id);
  if (!job) throw notFound('error.job_not_found', { id });
  return job;
}

export function stats() {
  const counts = jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] ?? 0) + 1;
    return acc;
  }, {});
  return { total: jobs.length, running, queued: pending.length, counts };
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
  jobs.unshift(job);
  trimJobs();
  persist();
  emit('created', job);
  return job;
}

export function updateJob(job, patch) {
  Object.assign(job, patch);
  persist();
  emit('updated', job);
  return job;
}

const ACTIVE_STATUSES = new Set(['queued', 'rendering', 'printing']);

function trimJobs() {
  const keep = getConfig().queue.keepJobs || 300;
  if (jobs.length <= keep) return;
  const keepList = jobs.slice(0, keep);
  const candidates = jobs.slice(keep);
  const removed = candidates.filter((job) => !ACTIVE_STATUSES.has(job.status));
  jobs = keepList.concat(candidates.filter((job) => ACTIVE_STATUSES.has(job.status)));
  for (const job of removed) {
    if (job.filePath && job.filePath.startsWith(`${PATHS.files}${path.sep}`) && existsSync(job.filePath)) {
      rmSync(job.filePath, { force: true });
    }
  }
}

export function cleanupFiles() {
  const hours = getConfig().queue.keepFilesHours || 48;
  const cutoff = Date.now() - hours * 3600 * 1000;
  if (!existsSync(PATHS.files)) return 0;
  let removed = 0;
  const inUse = new Set(
    jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).map((job) => job.filePath).filter(Boolean),
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
      // bỏ qua file đang bị khoá
    }
  }
  if (removed > 0) log.info(`Đã dọn ${removed} file tạm`);
  return removed;
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
      .catch((error) => log.error(`Lỗi xử lý job: ${error.message}`))
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
      error: t('error.prepare_failed', { message: error.message }),
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
        error: null,
        finishedAt: new Date().toISOString(),
      });
      log.info(`Job ${job.id} đã gửi tới máy in ${job.printer}`, { nativeJobId: result.nativeJobId });
      return;
    } catch (error) {
      const message = error.stderr?.trim() || error.message;
      log.warn(`Job ${job.id} in lỗi (lần ${attempt}): ${message}`);
      if (attempt > (config.maxRetries || 0)) {
        updateJob(job, {
          status: 'failed',
          error: message,
          finishedAt: new Date().toISOString(),
        });
        return;
      }
      await delay(config.retryDelayMs || 3000);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

export async function cancelJob(id) {
  const job = getJob(id);
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
    return job;
  }
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
    if (['completed', 'failed', 'canceled'].includes(job.status)) {
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
      if (['completed', 'failed', 'canceled'].includes(updated.status)) {
        clearTimeout(timer);
        jobEvents.off('updated', onUpdate);
        resolve(updated);
      }
    }
    jobEvents.on('updated', onUpdate);
  });
}
