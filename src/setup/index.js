import path from 'node:path';
import process from 'node:process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PATHS, ensureDataDirs } from '../core/paths.js';
import { createLogger } from '../util/logger.js';
import { STEPS } from './steps.js';
import { t } from '../i18n/index.js';

export { installService, uninstallService, serviceStatus } from './service.js';

const log = createLogger('setup');
const STATE_FILE = path.join(PATHS.data, 'setup.json');
export const SETUP_VERSION = 1;

/**
 * Bước được lưu và truyền đi dưới dạng key + tham số, chỉ dịch ở biên:
 * terminal dùng ngôn ngữ của agent, còn API dịch theo ngôn ngữ của người gọi.
 */
export function localizeStep(step, locale) {
  if (!step) return step;
  const { titleKey, detailKey, detailParams, hintKey, hintParams, ...rest } = step;
  return {
    ...rest,
    title: titleKey ? t(titleKey, null, locale) : rest.title,
    detail: detailKey ? t(detailKey, detailParams, locale) : rest.detail,
    hint: hintKey ? t(hintKey, hintParams, locale) : rest.hint,
  };
}

export function readSetupState() {
  if (!existsSync(STATE_FILE)) {
    return { version: 0, completedAt: null, platform: process.platform, steps: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { version: 0, completedAt: null, platform: process.platform, steps: [], ...parsed };
  } catch {
    return { version: 0, completedAt: null, platform: process.platform, steps: [] };
  }
}

function writeSetupState(state) {
  ensureDataDirs();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

export function rememberServiceChoice(enableService) {
  const state = readSetupState();
  return writeSetupState({ ...state, enableService: Boolean(enableService) });
}

export function isSetupComplete() {
  const state = readSetupState();
  return state.version >= SETUP_VERSION && Boolean(state.completedAt);
}

/**
 * Chạy tuần tự các bước, dừng ngay ở bước lỗi đầu tiên.
 */
/**
 * Chạy tuần tự các bước. Bước lỗi sẽ được tự sửa nếu có cách; chỉ dừng khi
 * một bước bắt buộc vẫn hỏng sau khi đã thử sửa.
 */
export async function runSetup({ enableService = false, autoFix = true, allowRestart = false, onStep, onLog } = {}) {
  const results = [];
  let failed = null;

  for (const step of STEPS) {
    onStep?.({ phase: 'start', id: step.id, titleKey: step.titleKey });
    const context = { enableService, autoFix, allowRestart, log: onLog };
    let result = await safeCheck(step, context);

    if (result.status === 'error' && autoFix && step.fix) {
      onStep?.({ phase: 'fix', id: step.id, titleKey: step.titleKey });
      let fixed = false;
      try {
        fixed = await step.fix(context);
      } catch (error) {
        onLog?.(t('setup.fix_failed', { message: error.message }));
      }
      if (fixed) result = await safeCheck(step, context);
    }

    if (result.status === 'error') {
      const hintKey = context.hintKey ?? result.hintKey ?? step.hintKey;
      const hintParams = context.hintKey ? context.hintParams : result.hintParams;
      result = step.required
        ? { ...result, hintKey, hintParams }
        : { ...result, status: 'warn', hintKey, hintParams };
    }

    const entry = { id: step.id, titleKey: step.titleKey, required: Boolean(step.required), ...result };
    results.push(entry);
    onStep?.({ phase: 'done', ...entry });
    if (entry.status === 'error') {
      failed = entry;
      break;
    }
  }

  const okAll = !failed;
  const previous = readSetupState();
  const state = writeSetupState({
    ...previous,
    version: SETUP_VERSION,
    platform: process.platform,
    completedAt: okAll ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    steps: results,
  });

  if (okAll) log.info(t('setup.complete'));
  else {
    const shown = localizeStep(failed);
    log.warn(t('setup.stopped', { title: shown.title, detail: shown.detail }));
  }

  return { ok: okAll, failed, steps: results, state, warnings: results.filter((item) => item.status === 'warn') };
}

async function safeCheck(step, context) {
  try {
    return await step.check(context);
  } catch (error) {
    return { status: 'error', detail: error.message };
  }
}

/**
 * Danh sách bước để UI dựng sẵn khung trước khi chạy.
 */
export function stepPlan(locale) {
  return STEPS.map((step) => ({
    id: step.id,
    title: t(step.titleKey, null, locale),
    required: Boolean(step.required),
  }));
}

const MAX_LOGS = 200;
let progress = idleProgress();

function idleProgress() {
  return {
    running: false,
    ok: null,
    startedAt: null,
    finishedAt: null,
    current: null,
    phase: null,
    steps: [],
    logs: [],
    failed: null,
  };
}

export function getSetupProgress(locale) {
  return {
    ...progress,
    plan: stepPlan(locale),
    current: localizeStep(progress.current, locale),
    failed: localizeStep(progress.failed, locale),
    steps: progress.steps.map((step) => localizeStep(step, locale)),
    logs: [...progress.logs],
  };
}

/**
 * Chạy wizard trong nền và ghi tiến độ để web UI hỏi lại bằng polling.
 * Gọi lại khi đang chạy sẽ chỉ trả về tiến độ hiện tại.
 */
export function startSetupRun({ enableService = false, autoFix = true } = {}) {
  if (progress.running) return getSetupProgress();

  progress = { ...idleProgress(), running: true, startedAt: new Date().toISOString() };
  const current = progress;
  const push = (message) => {
    current.logs.push({ at: new Date().toISOString(), message });
    if (current.logs.length > MAX_LOGS) current.logs.shift();
  };

  runSetup({
    enableService,
    autoFix,
    onLog: push,
    onStep: (event) => {
      if (event.phase === 'start') {
        current.current = { id: event.id, titleKey: event.titleKey };
        current.phase = 'check';
        return;
      }
      if (event.phase === 'fix') {
        current.current = { id: event.id, titleKey: event.titleKey };
        current.phase = 'fix';
        push(t('setup.fixing', { title: t(event.titleKey) }));
        return;
      }
      const { phase: _phase, ...entry } = event;
      current.steps.push(entry);
      current.current = null;
      current.phase = null;
    },
  })
    .then((result) => {
      current.ok = result.ok;
      current.failed = result.failed;
    })
    .catch((error) => {
      current.ok = false;
      current.failed = { id: 'runner', titleKey: 'setup.runner', status: 'error', detail: error.message };
      push(t('setup.error', { message: error.message }));
    })
    .finally(() => {
      current.running = false;
      current.finishedAt = new Date().toISOString();
      current.current = null;
      current.phase = null;
    });

  return getSetupProgress();
}

export function setupSummary(locale) {
  const state = readSetupState();
  return {
    complete: isSetupComplete(),
    version: state.version,
    currentVersion: SETUP_VERSION,
    completedAt: state.completedAt,
    updatedAt: state.updatedAt ?? null,
    platform: state.platform,
    steps: (state.steps ?? []).map((step) => localizeStep(step, locale)),
  };
}
