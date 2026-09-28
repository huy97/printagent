import process from 'node:process';
import readline from 'node:readline/promises';
import { runSetup, readSetupState, rememberServiceChoice, rememberTemplateChoice, localizeStep } from './index.js';
import { t, LOCALES, getLocale, setLocale } from '../i18n/index.js';
import { getConfig, updateConfig } from '../core/config.js';
import { configureLogger } from '../util/logger.js';

const ICON = { ok: '[ok]', warn: '[!]', error: '[x]' };

async function confirm(question, fallback = true, nonInteractive = false) {
  // No real terminal (script, launchd, background node --watch): do not decide for the user.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return nonInteractive;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} ${fallback ? '[Y/n]' : '[y/N]'} `)).trim().toLowerCase();
    if (!answer) return fallback;
    return answer === 'y' || answer === 'yes' || answer === 'c' || answer === 'co';
  } catch {
    // Ctrl+D or stdin closed midway: use the default instead of aborting the wizard.
    return fallback;
  } finally {
    rl.close();
  }
}

const LOCALE_LABEL = { vi: 'Tiếng Việt', en: 'English' };

async function askLocale() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return getLocale();
  const current = getLocale();
  const options = LOCALES.map((code, index) => `${index + 1}) ${LOCALE_LABEL[code] ?? code}`).join('   ');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${t('cli.setup.ask_locale')} ${options} [${LOCALES.indexOf(current) + 1}] `))
      .trim()
      .toLowerCase();
    if (!answer) return current;
    const byIndex = LOCALES[Number(answer) - 1];
    const byCode = LOCALES.find((code) => code === answer.slice(0, 2));
    return byIndex ?? byCode ?? current;
  } catch {
    return current;
  } finally {
    rl.close();
  }
}

/**
 * Terminal wizard: runs sequentially and stops at the first failing step.
 */
export async function runSetupCli({ enableService, seedTemplates, autoFix = true, quiet = false, ask = true } = {}) {
  if (!quiet) console.log(`${t('cli.setup.title')}\n`);

  if (ask && process.stdin.isTTY) {
    const chosen = await askLocale();
    if (chosen !== getLocale()) {
      setLocale(chosen);
      updateConfig({ agent: { locale: chosen } });
      console.log(`${t('cli.setup.locale_set', { language: LOCALE_LABEL[chosen] ?? chosen })}\n`);
    }
  }

  configureLogger({ silent: true });

  let useService = enableService;
  if (useService === undefined) {
    const remembered = readSetupState().enableService;
    // node --watch restarts constantly; do not ask again for an answered choice.
    if (typeof remembered === 'boolean' || !ask) {
      useService = remembered ?? false;
    } else {
      useService = await confirm(t('cli.setup.ask_service'), true, false);
      if (process.stdin.isTTY) rememberServiceChoice(useService);
    }
  }

  let useTemplates = seedTemplates;
  if (useTemplates === undefined) {
    const remembered = readSetupState().seedTemplates;
    if (typeof remembered === 'boolean' || !ask) {
      useTemplates = remembered ?? false;
    } else {
      useTemplates = await confirm(t('cli.setup.ask_templates', { count: 6 }), true, false);
      if (process.stdin.isTTY) rememberTemplateChoice(useTemplates);
    }
  }

  const result = await runSetup({
    enableService: useService,
    seedTemplates: useTemplates,
    locale: getLocale(),
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
