import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PATHS, ensureDataDirs } from '../core/paths.js';
import { getConfig, updateConfig } from '../core/config.js';
import { apiKeyValue, shortId } from '../util/id.js';
import { tryRun } from '../util/exec.js';
import * as printers from '../printers/index.js';
import { renderHealth, findSystemChrome } from '../render/pdf.js';
import { detectBinaries } from '../core/tunnel.js';
import { serviceStatus, installService, entryScript } from './service.js';
import { hasCommand, runVisible, runBash, installPackage, detectPackageManager, sudo } from './tools.js';
import { t } from '../i18n/index.js';

const MIN_NODE_MAJOR = 20;
const NVM_VERSION = 'v0.40.3';

function ok(key, params, extra = {}) {
  return { status: 'ok', detailKey: key, detailParams: params, ...extra };
}

function warn(key, params, hintKey) {
  return { status: 'warn', detailKey: key, detailParams: params, hintKey };
}

function fail(key, params, hintKey) {
  return { status: 'error', detailKey: key, detailParams: params, hintKey };
}

function nvmDir() {
  return process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
}

function findNvmNode(major = MIN_NODE_MAJOR) {
  const versionsDir = path.join(nvmDir(), 'versions', 'node');
  if (!existsSync(versionsDir)) return null;
  const candidates = readdirSync(versionsDir)
    .filter((name) => Number(name.replace(/^v/, '').split('.')[0]) >= major)
    .sort((a, b) => Number(b.replace(/^v/, '').split('.')[0]) - Number(a.replace(/^v/, '').split('.')[0]));
  for (const version of candidates) {
    const binary = path.join(versionsDir, version, 'bin', 'node');
    if (existsSync(binary)) return binary;
  }
  return null;
}

function nodeMajorOf(binary) {
  const result = spawnSync(binary, ['-v'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return 0;
  return Number(String(result.stdout).trim().replace(/^v/, '').split('.')[0]) || 0;
}

/**
 * Trên Windows không có nvm nên phải dò các vị trí cài đặt chuẩn: bản vừa cài
 * chưa nằm trong PATH của tiến trình đang chạy.
 */
function findWindowsNode(major = MIN_NODE_MAJOR) {
  const nvmHome = process.env.NVM_HOME || path.join(process.env.APPDATA ?? '', 'nvm');
  const candidates = [];

  if (existsSync(nvmHome)) {
    for (const name of readdirSync(nvmHome).filter((item) => /^v\d+/.test(item))) {
      candidates.push(path.join(nvmHome, name, 'node.exe'));
    }
  }
  for (const root of [
    process.env['ProgramFiles'],
    process.env['ProgramW6432'],
    process.env['ProgramFiles(x86)'],
    path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs'),
  ]) {
    if (root) candidates.push(path.join(root, 'nodejs', 'node.exe'));
  }

  const usable = candidates
    .filter((binary) => existsSync(binary) && path.resolve(binary) !== path.resolve(process.execPath))
    .map((binary) => ({ binary, major: nodeMajorOf(binary) }))
    .filter((item) => item.major >= major)
    .sort((a, b) => b.major - a.major);
  return usable[0]?.binary ?? null;
}

function findNewerNode(major = MIN_NODE_MAJOR) {
  return process.platform === 'win32' ? findWindowsNode(major) : findNvmNode(major);
}

/**
 * Chạy lại chính wizard bằng Node mới vừa cài rồi thoát tiến trình cũ.
 */
function restartWith(nodeBinary) {
  const args = process.argv.slice(2);
  const result = spawnSync(nodeBinary, [entryScript(), ...args], { stdio: 'inherit', windowsHide: true });
  process.exit(result.status ?? 0);
}

/**
 * Chỉ tự khởi động lại khi wizard chạy trong terminal. Gọi từ web UI mà thoát
 * tiến trình thì giết luôn server đang phục vụ giao diện đó.
 */
function useNode(binary, context) {
  if (!context.allowRestart) {
    context.hintKey = 'setup.step.node.found';
    context.hintParams = { min: MIN_NODE_MAJOR, binary };
    context.log?.(t('setup.step.node.found', context.hintParams));
    return false;
  }
  context.log?.(t('setup.step.node.restart', { binary }));
  restartWith(binary);
  return true;
}

const STEP_LIST = [
  {
    id: 'node',
    titleKey: 'setup.step.node',
    required: true,
    async check() {
      const major = Number(process.versions.node.split('.')[0]);
      if (major < MIN_NODE_MAJOR) {
        return fail('setup.step.node.too_old', { version: process.versions.node, min: MIN_NODE_MAJOR });
      }
      return ok('setup.step.node.ok', {
        version: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      });
    },
    async fix(context) {
      const { log } = context;
      const existing = findNewerNode();
      if (existing) return useNode(existing, context);

      if (process.platform === 'win32') {
        log?.(t('setup.step.node.installing'));
        const result = await installPackage({ winget: 'OpenJS.NodeJS.LTS', choco: 'nodejs-lts' }, { log });
        if (!result.ok) return false;
        const installed = findWindowsNode();
        if (!installed) {
          context.hintKey = 'setup.step.node.installed_reopen';
          return false;
        }
        return useNode(installed, context);
      }

      if (!existsSync(path.join(nvmDir(), 'nvm.sh'))) {
        log?.(t('setup.step.node.installing_nvm'));
        const installed = await runBash(
          `curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash`,
          { log },
        );
        if (!installed) return false;
      }

      log?.(t('setup.step.node.installing_via_nvm', { version: MIN_NODE_MAJOR }));
      const installed = await runBash(
        `export NVM_DIR="${nvmDir()}"; . "$NVM_DIR/nvm.sh"; nvm install ${MIN_NODE_MAJOR} && nvm alias default ${MIN_NODE_MAJOR}`,
        { log },
      );
      if (!installed) return false;

      const binary = findNvmNode();
      if (!binary) return false;
      return useNode(binary, context);
    },
    hintKey: 'setup.step.node.hint',
  },
  {
    id: 'data-dir',
    titleKey: 'setup.step.data_dir',
    required: true,
    async check() {
      try {
        ensureDataDirs();
        accessSync(PATHS.data, constants.W_OK);
      } catch (error) {
        return fail('setup.step.data_dir.failed', { path: PATHS.data, message: error.message });
      }
      return ok('setup.step.data_dir.ok', { path: PATHS.data });
    },
    hintKey: 'setup.step.data_dir.hint',
  },
  {
    id: 'printer-driver',
    titleKey: 'setup.step.printer_driver',
    required: false,
    async check() {
      const available = await printers.isPrintingAvailable();
      if (!available) return fail('setup.step.printer_driver.failed', { driver: printers.driverName });
      return ok('setup.step.printer_driver.ok', { driver: printers.driverName });
    },
    async fix({ log }) {
      if (process.platform !== 'linux') return false;
      log?.(t('setup.step.printer_driver.installing'));
      const result = await installPackage({ linux: ['cups', 'cups-client'] }, { log });
      if (!result.ok) return false;
      await sudo(['systemctl', 'enable', '--now', 'cups']);
      return true;
    },
    hintKey: 'setup.step.printer_driver.hint',
  },
  {
    id: 'printers',
    titleKey: 'setup.step.printers',
    required: false,
    async check() {
      const { printers: list } = await printers.scanPrinters({ force: true });
      if (list.length === 0) return fail('setup.step.printers.none');
      const config = getConfig().printing;
      let chosen = config.defaultPrinter;
      if (!chosen || !list.some((item) => item.name === chosen)) {
        chosen = (list.find((item) => item.isSystemDefault) ?? list[0]).name;
        updateConfig({ printing: { defaultPrinter: chosen } });
      }
      return ok(
        'setup.step.printers.ok',
        { count: list.length, name: chosen },
        { printers: list.map((item) => item.name) },
      );
    },
    async fix({ log }) {
      if (process.platform === 'win32') return false;
      log?.(t('setup.step.printers.scanning'));
      const found = await discoverNetworkPrinters();
      if (found.length === 0) return false;
      for (const printer of found) {
        log?.(t('setup.step.printers.adding', { name: printer.name, uri: printer.uri }));
        await tryRun('lpadmin', ['-p', printer.name, '-E', '-v', printer.uri, '-m', 'everywhere']);
      }
      return true;
    },
    hintKey: 'setup.step.printers.hint',
  },
  {
    id: 'pdf-engine',
    titleKey: 'setup.step.pdf_engine',
    required: false,
    async check() {
      const health = await renderHealth();
      if (health.ok) {
        return health.executablePath
          ? ok('setup.step.pdf_engine.ok_path', { version: health.version, path: health.executablePath })
          : ok('setup.step.pdf_engine.ok', { version: health.version });
      }
      // Puppeteer chưa có Chromium: dò trình duyệt sẵn có rồi ghi vào cấu hình.
      const found = findSystemChrome();
      if (found) {
        updateConfig({ render: { chromePath: found } });
        const retry = await renderHealth();
        if (retry.ok) return ok('setup.step.pdf_engine.ok_path', { version: retry.version, path: found });
      }
      return fail('setup.step.pdf_engine.failed', { message: health.error });
    },
    async fix({ log }) {
      const found = findSystemChrome();
      if (found) {
        log?.(t('setup.step.pdf_engine.found_browser', { path: found }));
        updateConfig({ render: { chromePath: found } });
        if ((await renderHealth()).ok) return true;
        log?.(t('setup.step.pdf_engine.browser_unusable'));
        updateConfig({ render: { chromePath: null } });
      }
      log?.(t('setup.step.pdf_engine.downloading'));
      const installed = await runVisible(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['puppeteer', 'browsers', 'install', 'chrome'],
        { log },
      );
      if (installed) return true;
      log?.(t('setup.step.pdf_engine.download_failed'));
      const result = await installPackage(
        {
          brew: 'google-chrome',
          brewCask: true,
          winget: 'Google.Chrome',
          choco: 'googlechrome',
          linux: ['chromium'],
        },
        { log },
      );
      return result.ok;
    },
    hintKey: 'setup.step.pdf_engine.hint',
  },
  {
    id: 'print-tool',
    titleKey: 'setup.step.print_tool',
    required: false,
    async check() {
      if (process.platform !== 'win32') return ok('setup.step.print_tool.cups');
      const found = findSumatra();
      if (!found) return fail('setup.step.print_tool.missing');
      if (!getConfig().printing.sumatraPath) updateConfig({ printing: { sumatraPath: found } });
      return ok('setup.step.print_tool.found', { path: found });
    },
    async fix({ log }) {
      if (process.platform !== 'win32') return false;
      log?.(t('setup.step.print_tool.installing'));
      const result = await installPackage({ winget: 'SumatraPDF.SumatraPDF', choco: 'sumatrapdf' }, { log });
      return result.ok;
    },
    hintKey: 'setup.step.print_tool.hint',
  },
  {
    id: 'api-key',
    titleKey: 'setup.step.api_key',
    required: true,
    async check() {
      const config = getConfig();
      if (config.auth.apiKeys.length > 0) {
        return ok('setup.step.api_key.existing', { count: config.auth.apiKeys.length });
      }
      const key = {
        id: shortId('key'),
        name: 'default',
        key: apiKeyValue(),
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      updateConfig({ auth: { apiKeys: [key] } });
      return ok('setup.step.api_key.created', { key: key.key }, { created: true });
    },
  },
  {
    id: 'tunnel-tools',
    titleKey: 'setup.step.tunnel_tools',
    required: false,
    async check() {
      const provider = getConfig().tunnel.provider;
      const binaries = await detectBinaries();
      const installed = Object.entries(binaries)
        .filter(([, item]) => item.installed)
        .map(([name]) => name);
      if (provider !== 'none' && !installed.includes(provider)) {
        return fail('setup.step.tunnel_tools.missing', { provider });
      }
      if (installed.length === 0) {
        return ok('setup.step.tunnel_tools.not_needed');
      }
      return ok('setup.step.tunnel_tools.ready', { list: installed.join(', ') });
    },
    async fix({ log }) {
      const provider = getConfig().tunnel.provider;
      if (provider === 'none') return false;
      log?.(t('setup.step.tunnel_tools.installing', { provider }));
      const packages =
        provider === 'cloudflare'
          ? { brew: 'cloudflared', winget: 'Cloudflare.cloudflared', choco: 'cloudflared', linux: ['cloudflared'] }
          : { brew: 'ngrok', winget: 'Ngrok.Ngrok', choco: 'ngrok', linux: ['ngrok'] };
      const result = await installPackage(packages, { log });
      return result.ok;
    },
    hintKey: 'setup.step.tunnel_tools.hint',
  },
  {
    id: 'service',
    titleKey: 'setup.step.service',
    required: false,
    async check({ enableService } = {}) {
      const current = await serviceStatus();
      if (!current.supported) return warn('setup.step.service.unsupported', { platform: process.platform });
      if (current.installed) {
        return ok('setup.step.service.installed', {
          manager: current.manager,
          running: current.running ? t('setup.step.service.running_suffix') : '',
        });
      }
      if (!enableService) return warn('setup.step.service.skipped', null, 'setup.step.service.skipped_hint');
      const result = await installService();
      return ok('setup.step.service.ok', { manager: result.manager, unit: result.unit });
    },
  },
];

function findSumatra() {
  const candidates = [
    getConfig().printing.sumatraPath,
    process.env.SUMATRA_PATH,
    path.join(process.env['ProgramFiles'] ?? 'C:/Program Files', 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(process.env['LOCALAPPDATA'] ?? '', 'SumatraPDF', 'SumatraPDF.exe'),
  ].filter(Boolean);
  return candidates.find((item) => existsSync(item)) ?? null;
}

/**
 * Dò máy in IPP quảng bá qua mDNS để tự thêm vào CUPS.
 */
async function discoverNetworkPrinters() {
  if (process.platform === 'darwin') {
    const result = await tryRun('dns-sd', ['-t', '4', '-B', '_ipp._tcp'], { timeout: 6000 });
    const names = [...new Set(
      String(result.stdout)
        .split('\n')
        .slice(4)
        .map((line) => line.split(/\s+_ipp\._tcp\.?\s+/)[1]?.trim())
        .filter(Boolean),
    )];
    return names.map((name) => ({
      name: name.replace(/[^A-Za-z0-9_-]/g, '_'),
      uri: `ipp://${name.replace(/ /g, '\\ ')}._ipp._tcp.local/`,
    }));
  }
  if (!hasCommand('avahi-browse')) return [];
  const result = await tryRun('avahi-browse', ['-rtp', '_ipp._tcp'], { timeout: 8000 });
  const found = new Map();
  for (const line of String(result.stdout).split('\n')) {
    const parts = line.split(';');
    if (parts[0] !== '=' || parts.length < 9) continue;
    const name = parts[3].replace(/[^A-Za-z0-9_-]/g, '_');
    found.set(name, { name, uri: `ipp://${parts[7]}:${parts[8]}/ipp/print` });
  }
  return [...found.values()];
}

export const STEPS = STEP_LIST;

export function stepById(id) {
  return STEPS.find((step) => step.id === id) ?? null;
}

export { detectPackageManager };
