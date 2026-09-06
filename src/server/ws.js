import { WebSocketServer } from 'ws';
import { URL } from 'node:url';
import { authorize, verifyKey, isSameOrigin, isSelfServedOrigin } from './auth.js';
import { blockedFor, recordAuthFailure, recordAuthSuccess } from './guard.js';
import * as jobs from '../core/jobs.js';
import * as printers from '../printers/index.js';
import { submitPdfJob, submitTemplateJob, previewTemplate } from '../core/printService.js';
import { listTemplates, getTemplate } from '../render/templates.js';
import { getConfig } from '../core/config.js';
import { getTunnelStatus, tunnelEvents } from '../core/tunnel.js';
import { t } from '../i18n/index.js';
import { logEvents } from '../util/logger.js';
import { createLogger } from '../util/logger.js';
import { shortId } from '../util/id.js';

const log = createLogger('ws');

const HANDLERS = {
  ping: async () => ({ pong: Date.now() }),
  'printers.list': async (payload) => printers.scanPrinters({ force: Boolean(payload?.refresh) }),
  'printers.scan': async () => printers.scanPrinters({ force: true }),
  'templates.list': async () => ({ templates: listTemplates() }),
  'templates.get': async (payload) => getTemplate(payload.id),
  'jobs.list': async (payload) => ({ jobs: jobs.listJobs(payload ?? {}), stats: jobs.stats() }),
  'job.get': async (payload) => jobs.getJob(payload.id),
  'job.cancel': async (payload) => jobs.cancelJob(payload.id),
  'print.pdf': async (payload, context) =>
    submitPdfJob({ ...payload, origin: context.origin, clientId: context.clientId }),
  'print.template': async (payload, context) =>
    submitTemplateJob({ ...payload, origin: context.origin, clientId: context.clientId }),
  'render.template': async (payload) => {
    const rendered = await previewTemplate(payload ?? {});
    return {
      contentType: rendered.contentType,
      base64: rendered.buffer.toString('base64'),
      engine: rendered.engine,
    };
  },
  'tunnel.status': async () => getTunnelStatus(),
  status: async () => ({
    agent: getConfig().agent,
    queue: jobs.stats(),
    printers: printers.getCachedPrinters(),
    tunnel: getTunnelStatus(),
  }),
};

export function attachWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: ({ req }, done) => {
      if (blockedFor(req) > 0) {
        done(false, 429, 'too many attempts');
        return;
      }
      const origins = getConfig().server.corsOrigins ?? [];
      const origin = req.headers.origin;
      // Trình duyệt gắn Origin: chỉ nhận same-origin hoặc origin đã khai báo.
      if (!origin || isSameOrigin(req) || isSelfServedOrigin(req) || origins.includes('*') || origins.includes(origin)) {
        done(true);
        return;
      }
      log.warn(t('ws.origin_rejected', { origin }));
      done(false, 403, 'origin not allowed');
    },
  });
  const clients = new Set();

  // Lỗi của http server được ws phát lại; không bắt sẽ làm sập tiến trình.
  wss.on('error', (error) => log.error(`WebSocket: ${error.message}`));

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const fakeReq = {
      headers: request.headers,
      socket: request.socket,
      query: { apiKey: url.searchParams.get('apiKey') ?? url.searchParams.get('api_key') },
    };
    const auth = authorize(fakeReq);

    const client = {
      id: shortId('ws'),
      socket,
      authorized: auth.ok,
      subscriptions: new Set(['job', 'printer', 'tunnel']),
      keyName: auth.key?.name ?? null,
    };
    clients.add(client);

    if (!auth.ok) {
      send(socket, { type: 'auth_required', message: t('ws.auth_required') });
      setTimeout(() => {
        if (!client.authorized) {
          send(socket, { type: 'error', payload: { message: t('ws.unauthorized') } });
          socket.close(4401, 'unauthorized');
        }
      }, 10000).unref?.();
    } else {
      send(socket, {
        type: 'welcome',
        payload: {
          clientId: client.id,
          agent: getConfig().agent,
          printers: printers.getCachedPrinters(),
          queue: jobs.stats(),
        },
      });
    }

    socket.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        send(socket, { type: 'error', payload: { message: t('ws.bad_json') } });
        return;
      }

      if (message.type === 'auth') {
        const entry = verifyKey(message.payload?.apiKey);
        if (entry) {
          recordAuthSuccess(request);
          client.authorized = true;
          client.keyName = entry.name;
          send(socket, { id: message.id, type: 'result', payload: { authorized: true, clientId: client.id } });
        } else {
          recordAuthFailure(request);
          send(socket, { id: message.id, type: 'error', payload: { message: t('ws.key_invalid') } });
          socket.close(4401, 'unauthorized');
        }
        return;
      }

      if (!client.authorized) {
        send(socket, { id: message.id, type: 'error', payload: { message: t('ws.unauthorized') } });
        return;
      }

      if (message.type === 'subscribe') {
        client.subscriptions = new Set(message.payload?.events ?? ['job', 'printer', 'tunnel']);
        send(socket, { id: message.id, type: 'result', payload: { subscriptions: [...client.subscriptions] } });
        return;
      }

      const handler = HANDLERS[message.type];
      if (!handler) {
        send(socket, {
          id: message.id,
          type: 'error',
          payload: { message: `Lệnh không hỗ trợ: ${message.type}`, supported: Object.keys(HANDLERS) },
        });
        return;
      }

      try {
        const result = await handler(message.payload ?? {}, {
          origin: `ws:${client.keyName ?? 'local'}`,
          clientId: client.id,
        });
        send(socket, { id: message.id, type: 'result', payload: result });
      } catch (error) {
        send(socket, {
          id: message.id,
          type: 'error',
          payload: { message: error.message, code: error.code ?? 'error' },
        });
      }
    });

    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
  });

  function broadcast(channel, event, payload) {
    const message = JSON.stringify({ type: 'event', event, payload, at: new Date().toISOString() });
    for (const client of clients) {
      if (!client.authorized || !client.subscriptions.has(channel)) continue;
      if (client.socket.readyState === client.socket.OPEN) client.socket.send(message);
    }
  }

  jobs.jobEvents.on('job', ({ event, job }) => broadcast('job', `job.${event}`, job));
  printers.printerEvents.on('changed', (payload) => broadcast('printer', 'printer.changed', payload));
  tunnelEvents.on('changed', (payload) => broadcast('tunnel', 'tunnel.changed', payload));
  logEvents.on('log', (entry) => broadcast('log', 'log', entry));

  log.info('WebSocket sẵn sàng tại /ws');
  return { wss, broadcast, clients };
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}
