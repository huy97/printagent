import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getConfig } from '../core/config.js';
import { PATHS, ensureDataDirs } from '../core/paths.js';
import { configureLogger, createLogger } from '../util/logger.js';
import { requireAuth, authorize } from './auth.js';
import { systemRouter, healthHandler } from './routes/system.js';
import { printersRouter } from './routes/printers.js';
import { templatesRouter } from './routes/templates.js';
import { jobsRouter } from './routes/jobs.js';
import { printRouter } from './routes/print.js';
import { attachWebSocket } from './ws.js';
import { createMcpHttpHandler } from '../mcp/http.js';
import { createLocalApi } from '../mcp/api.js';
import { buildOpenApi } from './openapi.js';
import * as printers from '../printers/index.js';
import * as jobs from '../core/jobs.js';
import { autoStartTunnel, stopTunnel } from '../core/tunnel.js';
import { closeBrowser } from '../render/pdf.js';
import { AppError, serializeError, toAppError } from '../util/errors.js';
import { t, localeFromRequest, setLocale, LOCALES, DEFAULT_LOCALE } from '../i18n/index.js';

const log = createLogger('server');
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const webDir = path.join(rootDir, 'web');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64mb' }));
  app.use(express.urlencoded({ extended: true, limit: '16mb' }));

  app.use((req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    next();
  });

  app.use((req, res, next) => {
    const origins = getConfig().server.corsOrigins ?? [];
    const origin = req.headers.origin;
    const allowed = origin && (origins.includes('*') || origins.includes(origin));
    if (allowed) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'content-type,x-api-key,x-locale,authorization,mcp-session-id');
      res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('access-control-expose-headers', 'mcp-session-id,content-language');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(allowed ? 204 : 403);
      return;
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    req.auth = authorize(req);
    healthHandler(req, res);
  });

  app.use('/api', requireAuth);
  app.use('/api', systemRouter);
  app.use('/api/printers', printersRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/print', printRouter);

  app.all('/mcp', requireAuth, createMcpHttpHandler(createLocalApi()));

  app.get('/llms.txt', (req, res) => {
    const locale = localeFromRequest(req);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('content-language', locale);
    res.setHeader('cache-control', 'no-store');
    res.sendFile(path.join(rootDir, locale === DEFAULT_LOCALE ? 'llms.txt' : `llms.${locale}.txt`));
  });

  app.get('/openapi.json', (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.json(buildOpenApi(`${req.protocol}://${req.get('host')}`));
  });

  // Discovery document for AI agents: one request tells what the agent offers and where to read next.
  app.get('/.well-known/printagent.json', (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    res.setHeader('cache-control', 'no-store');
    const locale = localeFromRequest(req);
    res.setHeader('content-language', locale);
    res.json({
      name: 'PrintAgent',
      description: t('discovery.description', null, locale),
      version: process.env.npm_package_version ?? '1.0.0',
      docs: {
        llms: `${base}/llms.txt`,
        openapi: `${base}/openapi.json`,
        llmsByLanguage: Object.fromEntries(LOCALES.map((item) => [item, `${base}/llms.txt?lang=${item}`])),
      },
      endpoints: { rest: `${base}/api`, websocket: `${base.replace(/^http/, 'ws')}/ws`, mcp: `${base}/mcp` },
      auth: { header: 'x-api-key', alternatives: ['Authorization: Bearer', '?apiKey='] },
      language: { current: locale, supported: LOCALES, select: ['x-locale', '?lang=', 'accept-language'] },
    });
  });

  app.use(
    express.static(webDir, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('cache-control', 'no-store');
      },
    }),
  );
  // SPA fallback: reloading or deep-linking a UI route still serves index.html.
  // API calls, static files and non-HTML requests fall through to the JSON 404.
  app.get('*', (req, res, next) => {
    if (/^\/(api|mcp)(\/|$)/.test(req.path) || path.extname(req.path) || !req.accepts('html')) {
      next();
      return;
    }
    res.setHeader('cache-control', 'no-store');
    res.sendFile(path.join(webDir, 'index.html'));
  });

  app.use((req, res) => {
    const locale = localeFromRequest(req);
    res.setHeader('content-language', locale);
    res.status(404).json({
      error: serializeError(new AppError('error.no_route', {
        status: 404,
        code: 'not_found',
        params: { method: req.method, path: req.path },
      }), locale),
    });
  });

  app.use((error, req, res, next) => {
    const appError = toAppError(error);
    const locale = localeFromRequest(req);
    if (appError.status >= 500) log.error(`${req.method} ${req.path} -> ${error?.message ?? error}`);
    res.setHeader('content-language', locale);
    res.status(appError.status).json({ error: serializeError(appError, locale) });
  });

  return app;
}

export async function startServer({ port, host } = {}) {
  ensureDataDirs();
  configureLogger({ dir: PATHS.logs });
  const config = getConfig();
  setLocale(config.agent.locale);
  const listenPort = port ?? (process.env.PORT ? Number(process.env.PORT) : config.server.port);
  const listenHost = host ?? config.server.host;

  jobs.loadJobs({ recoverInterrupted: true });
  jobs.cleanupFiles();

  const app = createApp();
  const server = http.createServer(app);
  attachWebSocket(server);

  await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new AppError('error.port_in_use', { status: 409, code: 'port_in_use', params: { port: listenPort } }));
        return;
      }
      reject(error);
    });
    server.listen(listenPort, listenHost, resolve);
  });

  printers.startAutoScan();
  printers.scanPrinters({ force: true }).catch(() => {});

  const cleanupTimer = setInterval(() => jobs.cleanupFiles(), 3600 * 1000);
  cleanupTimer.unref?.();

  const local = `http://127.0.0.1:${listenPort}`;
  log.info(`PrintAgent is running at ${local} (bind ${listenHost}:${listenPort})`);
  log.info(`Web UI: ${local}  |  REST: ${local}/api  |  WS: ws://127.0.0.1:${listenPort}/ws  |  MCP: ${local}/mcp`);

  autoStartTunnel().then((status) => {
    if (status?.url) log.info(`Public tunnel: ${status.url}`);
  });

  const shutdown = async () => {
    log.info('Shutting down PrintAgent...');
    printers.stopAutoScan();
    clearInterval(cleanupTimer);
    await stopTunnel().catch(() => {});
    await closeBrowser().catch(() => {});
    jobs.closeJobs();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref?.();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, app, port: listenPort, host: listenHost };
}
