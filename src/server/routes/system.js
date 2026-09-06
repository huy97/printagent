import os from 'node:os';
import { Router } from 'express';
import { getConfig, publicConfig, saveConfig, updateConfig } from '../../core/config.js';
import { apiKeyValue, shortId } from '../../util/id.js';
import { recentLogs } from '../../util/logger.js';
import * as printers from '../../printers/index.js';
import { renderHealth } from '../../render/pdf.js';
import * as jobs from '../../core/jobs.js';
import * as tunnel from '../../core/tunnel.js';
import { AppError, badRequest, notFound } from '../../util/errors.js';
import { setLocale, localeFromRequest, LOCALES } from '../../i18n/index.js';
import { listTemplates } from '../../render/templates.js';
import { seedCatalog } from '../../render/seed.js';
import { PATHS } from '../../core/paths.js';
import {
  setupSummary,
  rememberTemplateChoice,
  stepPlan,
  startSetupRun,
  getSetupProgress,
  serviceStatus,
  installService,
  uninstallService,
} from '../../setup/index.js';

export const systemRouter = Router();

export function healthHandler(req, res) {
  const status = tunnel.getTunnelStatus();
  // Agent tự dò tunnel bằng cách gọi hostname công khai rồi đối chiếu nonce này.
  const probe = req.headers['x-printagent-probe'];
  if (probe) res.setHeader('x-printagent-probe', String(probe).slice(0, 64));
  if (!req.auth?.ok) {
    res.json({ ok: true, service: 'printagent', uptimeSeconds: Math.round(process.uptime()) });
    return;
  }
  res.json({
    ok: true,
    agent: getConfig().agent,
    version: process.env.npm_package_version ?? '1.0.0',
    uptimeSeconds: Math.round(process.uptime()),
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    printerDriver: printers.driverName,
    queue: jobs.stats(),
    tunnel: { status: status.status, url: status.url },
  });
}

systemRouter.get('/health', healthHandler);

systemRouter.get('/info', async (req, res, next) => {
  try {
    const config = getConfig();
    res.json({
      agent: config.agent,
      dataDir: PATHS.data,
      platform: { os: os.platform(), release: os.release(), arch: os.arch(), hostname: os.hostname() },
      node: process.version,
      printerDriver: printers.driverName,
      printingAvailable: await printers.isPrintingAvailable(),
      renderer: await renderHealth(),
      endpoints: {
        rest: `http://${config.server.host}:${config.server.port}/api`,
        websocket: `ws://${config.server.host}:${config.server.port}/ws`,
        mcp: `http://${config.server.host}:${config.server.port}/mcp`,
      },
    });
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/logs', (req, res) => {
  res.json({ logs: recentLogs(Number(req.query.limit) || 200) });
});

systemRouter.get('/settings', (req, res) => {
  res.json(publicConfig());
});

/**
 * Các trường dưới đây quyết định binary nào được agent spawn, hoặc tắt hẳn xác thực,
 * nên chỉ nhận khi request đến trực tiếp từ máy chạy agent (không qua tunnel/trang web khác).
 */
const LOCAL_ONLY_FIELDS = [
  ['render', 'chromePath'],
  ['printing', 'sumatraPath'],
  ['printing', 'allowLocalFilePath'],
  ['printing', 'allowedFileRoots'],
  ['printing', 'allowRemoteUrl'],
  ['printing', 'allowPrivateNetworkUrl'],
  ['printing', 'rawShareName'],
  ['auth', 'enabled'],
  ['auth', 'allowLocalhostWithoutKey'],
  ['server', 'corsOrigins'],
  ['server', 'host'],
  ['server', 'port'],
  ['tunnel', 'cloudflare', 'binPath'],
  ['tunnel', 'ngrok', 'binPath'],
];

function stripLocalOnly(patch) {
  const removed = [];
  for (const pathParts of LOCAL_ONLY_FIELDS) {
    let node = patch;
    for (let index = 0; index < pathParts.length - 1; index += 1) {
      node = node?.[pathParts[index]];
      if (!node || typeof node !== 'object') break;
    }
    const leaf = pathParts.at(-1);
    if (node && typeof node === 'object' && leaf in node) {
      delete node[leaf];
      removed.push(pathParts.join('.'));
    }
  }
  return removed;
}

systemRouter.put('/settings', (req, res, next) => {
  try {
    const patch = { ...req.body };
    if (patch.agent?.locale && !LOCALES.includes(patch.agent.locale)) {
      throw badRequest('error.locale_unsupported', { locale: patch.agent.locale, supported: LOCALES.join(', ') });
    }
    if (patch.auth) delete patch.auth.apiKeys;
    if (patch.auth?.enabled === false && tunnel.getTunnelStatus().status === 'running') {
      throw badRequest('error.auth_off_while_tunnel');
    }
    if (patch.agent) delete patch.agent.id;
    if (patch.tunnel?.cloudflare?.token === '***') delete patch.tunnel.cloudflare.token;
    if (patch.tunnel?.ngrok?.authtoken === '***') delete patch.tunnel.ngrok.authtoken;
    const rejected = req.auth?.local ? [] : stripLocalOnly(patch);
    updateConfig(patch);
    if (patch.agent?.locale) setLocale(getConfig().agent.locale);
    printers.startAutoScan();
    res.json({ ...publicConfig(), rejectedFields: rejected });
  } catch (error) {
    next(error);
  }
});

function requireLocal(req) {
  if (!req.auth?.local) {
    throw new AppError('Thao tác với API key chỉ thực hiện được từ máy đang chạy agent', {
      status: 403,
      code: 'local_only',
    });
  }
}

systemRouter.get('/apikeys', (req, res) => {
  res.json({ apiKeys: publicConfig().auth.apiKeys });
});

systemRouter.post('/apikeys', (req, res, next) => {
  try {
    requireLocal(req);
    const name = String(req.body?.name ?? '').trim() || 'key';
    const config = getConfig();
    const entry = {
      id: shortId('key'),
      name,
      key: apiKeyValue(),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    config.auth.apiKeys.push(entry);
    saveConfig(config);
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/apikeys/:id/reveal', (req, res, next) => {
  try {
    requireLocal(req);
    const entry = getConfig().auth.apiKeys.find((item) => item.id === req.params.id);
    if (!entry) throw notFound('error.apikey_not_found');
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete('/apikeys/:id', (req, res, next) => {
  try {
    requireLocal(req);
    const config = getConfig();
    const index = config.auth.apiKeys.findIndex((item) => item.id === req.params.id);
    if (index < 0) throw notFound('error.apikey_not_found');
    if (config.auth.apiKeys.length === 1) throw badRequest('error.apikey_last_one');
    config.auth.apiKeys.splice(index, 1);
    saveConfig(config);
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/setup', async (req, res, next) => {
  try {
    const locale = localeFromRequest(req);
    const summary = setupSummary(locale);
    const local = Boolean(req.auth?.local);
    const service = await serviceStatus();
    res.json({
      ...summary,
      local,
      templates: { count: listTemplates().length, catalog: seedCatalog(locale) },
      plan: stepPlan(locale),
      steps: local
        ? summary.steps
        : summary.steps.map(({ id, title, status }) => ({ id, title, status })),
      service: local ? service : { installed: service.installed, running: service.running, supported: service.supported },
    });
  } catch (error) {
    next(error);
  }
});

systemRouter.post('/setup/run', (req, res, next) => {
  try {
    requireLocal(req);
    // Các bước có thể tải Chromium hoặc Node nên chạy nền, UI hỏi tiến độ qua /setup/progress.
    const wantTemplates = req.body?.seedTemplates === true;
    const locale = LOCALES.includes(req.body?.locale) ? req.body.locale : localeFromRequest(req);
    rememberTemplateChoice(wantTemplates);
    // Ngôn ngữ chọn ở màn cài đặt là ngôn ngữ của cả agent: log, CLI và bộ mẫu đều theo nó.
    if (req.body?.locale && locale !== getConfig().agent.locale) {
      updateConfig({ agent: { locale } });
      setLocale(locale);
    }
    startSetupRun({
      enableService: req.body?.enableService === true,
      seedTemplates: wantTemplates,
      locale,
      autoFix: req.body?.autoFix !== false,
    });
    res.status(202).json(getSetupProgress(localeFromRequest(req)));
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/setup/progress', async (req, res, next) => {
  try {
    requireLocal(req);
    const locale = localeFromRequest(req);
    const progress = getSetupProgress(locale);
    res.json({
      ...progress,
      summary: progress.running ? null : setupSummary(locale),
      service: progress.running ? null : await serviceStatus(),
    });
  } catch (error) {
    next(error);
  }
});

systemRouter.post('/setup/service', async (req, res, next) => {
  try {
    requireLocal(req);
    const action = String(req.body?.action ?? 'install');
    if (action === 'uninstall') await uninstallService();
    else if (action === 'install') await installService();
    else throw badRequest('error.service_action_invalid');
    res.json(await serviceStatus());
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/tunnel', async (req, res, next) => {
  try {
    res.json({
      status: tunnel.getTunnelStatus(),
      config: publicConfig().tunnel,
      binaries: await tunnel.detectBinaries(),
    });
  } catch (error) {
    next(error);
  }
});

systemRouter.post('/tunnel/start', async (req, res, next) => {
  try {
    res.json(await tunnel.startTunnel({ provider: req.body?.provider }));
  } catch (error) {
    next(error);
  }
});

systemRouter.post('/tunnel/stop', async (req, res, next) => {
  try {
    res.json(await tunnel.stopTunnel());
  } catch (error) {
    next(error);
  }
});
