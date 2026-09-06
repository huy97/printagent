import process from 'node:process';
import readline from 'node:readline/promises';
import { runSetup, readSetupState, rememberServiceChoice, localizeStep } from './index.js';
import { t } from '../i18n/index.js';
import { getConfig } from '../core/config.js';
import { configureLogger } from '../util/logger.js';

const ICON = { ok: '[ok]', warn: '[!]', error: '[x]' };

async function confirm(question, fallback = true, nonInteractive = false) {
  // Không có terminal thật (script, launchd, node --watch nền): không tự quyết thay người dùng.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return nonInteractive;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} ${fallback ? '[Y/n]' : '[y/N]'} `)).trim().toLowerCase();
    if (!answer) return fallback;
    return answer === 'y' || answer === 'yes' || answer === 'c' || answer === 'co';
  } finally {
    rl.close();
  }
}

/**
 * Wizard chạy trong terminal: tuần tự, dừng ngay khi có bước lỗi.
 */
export async function runSetupCli({ enableService, autoFix = true, quiet = false, ask = true } = {}) {
  if (!quiet) console.log(`${t('cli.setup.title')}\n`);
  configureLogger({ silent: true });

  let useService = enableService;
  if (useService === undefined) {
    const remembered = readSetupState().enableService;
    // node --watch khởi động lại liên tục, không hỏi lại lựa chọn đã trả lời.
    if (typeof remembered === 'boolean' || !ask) {
      useService = remembered ?? false;
    } else {
      useService = await confirm(t('cli.setup.ask_service'), true, false);
      if (process.stdin.isTTY) rememberServiceChoice(useService);
    }
  }

  const result = await runSetup({
    enableService: useService,
    autoFix,
    allowRestart: true,
    onLog: (message) => console.log(`      ${message}`),
    onStep: (event) => {
      const shown = localizeStep(event);
      if (event.phase === 'start') {
        if (process.stdout.isTTY) process.stdout.write(`  ... ${shown.title}`);
        return;
      }
      if (event.phase === 'fix') {
        if (process.stdout.isTTY) process.stdout.write('\r\u001b[K');
        process.stdout.write(`  ... ${shown.title}: ${t('cli.setup.fixing')}\n`);
        return;
      }
      if (process.stdout.isTTY) process.stdout.write('\r\u001b[K');
      process.stdout.write(`  ${ICON[event.status] ?? '[?]'} ${shown.title}: ${shown.detail}\n`);
      if (event.status === 'warn' && shown.hint) console.log(`      -> ${shown.hint}`);
    },
  });

  if (!result.ok) {
    configureLogger({ silent: false });
    const failed = localizeStep(result.failed);
    console.error(`\n${t('cli.setup.stopped', { title: failed.title })}`);
    if (failed.hint) console.error(t('cli.setup.fix_hint', { hint: failed.hint }));
    return result;
  }

  configureLogger({ silent: false });
  const config = getConfig();
  const key = config.auth.apiKeys[0];
  const warnings = result.warnings ?? [];
  if (warnings.length > 0) {
    console.log(`\n${t('cli.setup.warnings', { count: warnings.length })}`);
    for (const item of warnings) {
      const shown = localizeStep(item);
      console.log(`  - ${shown.title}: ${shown.detail}`);
    }
  }
  console.log(`\n${t('cli.setup.done', { port: config.server.port })}`);
  if (key) console.log(t('cli.setup.key', { name: key.name, key: key.key }));
  return result;
}
