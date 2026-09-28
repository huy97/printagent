#!/usr/bin/env node
import process from 'node:process';
import { startServer } from '../src/server/index.js';
import { startStdioMcp } from '../src/mcp/stdio.js';
import { getConfig, publicConfig, updateConfig } from '../src/core/config.js';
import * as printers from '../src/printers/index.js';
import { printTestPage } from '../src/core/printService.js';
import { PATHS } from '../src/core/paths.js';
import { t, setLocale } from '../src/i18n/index.js';
import { loadJobs } from '../src/core/jobs.js';
import { detectBinaries, startTunnel } from '../src/core/tunnel.js';
import { runSetupCli } from '../src/setup/cli.js';
import { openBrowser } from '../src/setup/tools.js';
import {
  installService,
  uninstallService,
  serviceStatus,
  setupSummary,
  isSetupComplete,
} from '../src/setup/index.js';

const [, , command = 'start', ...rest] = process.argv;

// i18n already honours PRINTAGENT_LANG; otherwise fall back to the configured locale.
if (!process.env.PRINTAGENT_LANG) setLocale(getConfig().agent.locale);

function flag(name) {
  const index = rest.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = rest[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

async function main() {
  switch (command) {
    case 'start': {
      // The web UI always starts first; any unfinished setup is completed from there.
      const firstRun = !isSetupComplete();
      const { port } = await startServer({
        port: typeof flag('port') === 'string' ? Number(flag('port')) : undefined,
        host: typeof flag('host') === 'string' ? flag('host') : undefined,
      });
      if (firstRun) {
        const url = `http://127.0.0.1:${port}`;
        console.log(`\n${t('cli.setup.incomplete', { url })}`);
        if (!flag('no-open') && process.stdout.isTTY) openBrowser(url);
      }
      break;
    }

    case 'setup': {
      const result = await runSetupCli({
        enableService: flag('service') === true ? true : flag('no-service') ? false : undefined,
        seedTemplates: flag('templates') === true ? true : flag('no-templates') ? false : undefined,
        autoFix: !flag('no-download'),
      });
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'service': {
      const action = rest[0] ?? 'status';
      if (action === 'install') {
        const result = await installService();
        console.log(t('cli.service.installed', { manager: result.manager, unit: result.unit }));
      } else if (action === 'uninstall') {
        const result = await uninstallService();
        console.log(t('cli.service.uninstalled', { manager: result.manager, unit: result.unit }));
      } else {
        console.log(JSON.stringify(await serviceStatus(), null, 2));
      }
      break;
    }

    case 'doctor': {
      console.log(JSON.stringify(setupSummary(), null, 2));
      break;
    }

    case 'mcp': {
      await startStdioMcp({
        standalone: Boolean(flag('standalone')),
        baseUrl: typeof flag('url') === 'string' ? flag('url') : undefined,
        apiKey: typeof flag('key') === 'string' ? flag('key') : undefined,
      });
      break;
    }

    case 'printers': {
      const { printers: list, driver } = await printers.scanPrinters({ force: true });
      console.log(`Driver: ${driver}`);
      if (list.length === 0) console.log(t('cli.printers.none'));
      for (const printer of list) {
        const tags = [
          printer.isSystemDefault ? t('cli.printers.system_default') : null,
          printer.isAgentDefault ? t('cli.printers.agent_default') : null,
        ].filter(Boolean);
        console.log(`- ${printer.name} [${printer.status}] ${printer.description ?? ''} ${tags.join(' ')}`.trim());
      }
      break;
    }

    case 'test': {
      loadJobs();
      const job = await printTestPage(typeof flag('printer') === 'string' ? flag('printer') : undefined);
      console.log(`Job ${job.id}: ${job.status}${job.error ? ` - ${job.error}` : ''}`);
      process.exit(job.status === 'completed' ? 0 : 1);
      break;
    }

    case 'config': {
      if (rest[0] === 'set-default-printer' && rest[1]) {
        updateConfig({ printing: { defaultPrinter: rest[1] } });
        console.log(t('cli.config.default_printer', { name: rest[1] }));
        break;
      }
      console.log(t('cli.config.data_dir', { path: PATHS.data }));
      console.log(JSON.stringify(publicConfig(), null, 2));
      break;
    }

    case 'key': {
      const keys = getConfig().auth.apiKeys;
      for (const item of keys) console.log(`${item.name}\t${item.key}`);
      break;
    }

    case 'tunnel': {
      if (rest[0] === 'check' || rest.length === 0) {
        console.log(JSON.stringify(await detectBinaries(), null, 2));
        break;
      }
      const status = await startTunnel({ provider: rest[0] });
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    default:
      console.log(`${t('cli.tagline')}\n\n${t('cli.usage')}`);
  }
}

main().catch((error) => {
  console.error(t('setup.error', { message: error.message }));
  process.exit(1);
});
