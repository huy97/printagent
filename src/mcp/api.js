import * as printers from '../printers/index.js';
import * as jobs from '../core/jobs.js';
import { submitPdfJob, submitTemplateJob, previewTemplate, printTestPage } from '../core/printService.js';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../render/templates.js';
import { getConfig } from '../core/config.js';
import { getTunnelStatus } from '../core/tunnel.js';

export function createLocalApi() {
  return {
    mode: 'local',
    listPrinters: (input = {}) => printers.scanPrinters({ force: Boolean(input.refresh) }),
    printTest: (input = {}) => printTestPage(input.printer),
    printPdf: (input) => submitPdfJob({ ...input, origin: 'mcp' }),
    printTemplate: (input) => submitTemplateJob({ ...input, origin: 'mcp' }),
    renderTemplate: async (input) => {
      const rendered = await previewTemplate(input);
      return {
        engine: rendered.engine,
        contentType: rendered.contentType,
        bytes: rendered.buffer.length,
        base64: input.includeBase64 ? rendered.buffer.toString('base64') : undefined,
      };
    },
    listTemplates: async () => ({ templates: listTemplates() }),
    getTemplate: async (input) => getTemplate(input.id),
    createTemplate: async (input) => createTemplate(input),
    updateTemplate: async (input) => updateTemplate(input.id, input),
    deleteTemplate: async (input) => deleteTemplate(input.id),
    listJobs: async (input = {}) => ({ jobs: jobs.listJobs(input), stats: jobs.stats() }),
    getJob: async (input) => jobs.getJob(input.id),
    cancelJob: (input) => jobs.cancelJob(input.id),
    status: async () => ({
      agent: getConfig().agent,
      queue: jobs.stats(),
      printers: printers.getCachedPrinters(),
      tunnel: getTunnelStatus(),
      defaultPrinter: getConfig().printing.defaultPrinter,
    }),
  };
}

export function createRemoteApi({ baseUrl, apiKey }) {
  const root = baseUrl.replace(/\/$/, '');

  async function call(method, path, body, query) {
    const url = new URL(`${root}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      const error = new Error(parsed?.error?.message ?? `HTTP ${response.status}`);
      error.details = parsed;
      throw error;
    }
    return parsed;
  }

  return {
    mode: 'remote',
    baseUrl: root,
    listPrinters: (input = {}) => call('GET', '/api/printers', null, { refresh: input.refresh ? 1 : 0 }),
    printTest: async (input = {}) => {
      let printer = input.printer;
      if (!printer) {
        const result = await call('GET', '/api/printers');
        printer =
          result.defaultPrinter ??
          result.printers?.find((item) => item.isSystemDefault)?.name ??
          result.printers?.[0]?.name;
        if (!printer) throw new Error('Agent chưa có máy in nào để in thử');
      }
      return call('POST', `/api/printers/${encodeURIComponent(printer)}/test`);
    },
    printPdf: (input) => call('POST', '/api/print/pdf', input),
    printTemplate: (input) => call('POST', '/api/print/template', input),
    renderTemplate: async (input) => {
      const result = await call('POST', '/api/print/render', input, { format: 'base64' });
      return {
        engine: input.engine ?? 'html',
        contentType: result.contentType,
        bytes: result.base64 ? Buffer.from(result.base64, 'base64').length : 0,
        base64: input.includeBase64 ? result.base64 : undefined,
      };
    },
    listTemplates: () => call('GET', '/api/templates'),
    getTemplate: (input) => call('GET', `/api/templates/${encodeURIComponent(input.id)}`),
    createTemplate: (input) => call('POST', '/api/templates', input),
    updateTemplate: (input) => call('PUT', `/api/templates/${encodeURIComponent(input.id)}`, input),
    deleteTemplate: (input) => call('DELETE', `/api/templates/${encodeURIComponent(input.id)}`),
    listJobs: (input = {}) => call('GET', '/api/jobs', null, input),
    getJob: (input) => call('GET', `/api/jobs/${encodeURIComponent(input.id)}`),
    cancelJob: (input) => call('POST', `/api/jobs/${encodeURIComponent(input.id)}/cancel`),
    status: async () => {
      const [health, printers] = await Promise.all([
        call('GET', '/api/health'),
        call('GET', '/api/printers').catch(() => ({ printers: [] })),
      ]);
      return { ...health, printers, defaultPrinter: printers.defaultPrinter ?? null };
    },
  };
}
