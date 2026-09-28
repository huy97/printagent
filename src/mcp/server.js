import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { t } from '../i18n/index.js';
import { serializeError } from '../util/errors.js';

const printOptionsSchema = z
  .object({
    duplex: z.enum(['none', 'long', 'short']).optional(),
    paperSize: z.string().optional(),
    orientation: z.enum(['portrait', 'landscape']).optional(),
    fitToPage: z.boolean().optional(),
    raw: z.boolean().optional(),
    extraOptions: z.array(z.string()).optional(),
  })
  .optional();

const pageSchema = z
  .object({
    format: z.string().optional(),
    landscape: z.boolean().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    marginTop: z.string().optional(),
    marginRight: z.string().optional(),
    marginBottom: z.string().optional(),
    marginLeft: z.string().optional(),
  })
  .optional();

function text(payload) {
  return {
    content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }],
  };
}

function wrap(handler) {
  return async (args) => {
    try {
      return text(await handler(args ?? {}));
    } catch (error) {
      const payload = serializeError(error);
      return {
        isError: true,
        content: [
          { type: 'text', text: t('mcp.error', { message: payload.message }) },
          { type: 'text', text: JSON.stringify({ error: payload }) },
        ],
      };
    }
  };
}

export function createMcpServer(api) {
  const server = new McpServer(
    { name: 'printagent', version: '1.0.0' },
    {
      instructions: t('mcp.instructions'),
    },
  );

  server.registerTool(
    'list_printers',
    {
      title: t('mcp.list_printers.title'),
      description: t('mcp.list_printers.description'),
      inputSchema: { refresh: z.boolean().optional().describe(t('mcp.arg.refresh')) },
    },
    wrap((args) => api.listPrinters(args)),
  );

  server.registerTool(
    'agent_status',
    {
      title: t('mcp.agent_status.title'),
      description: t('mcp.agent_status.description'),
      inputSchema: {},
    },
    wrap(() => api.status()),
  );

  server.registerTool(
    'print_pdf',
    {
      title: t('mcp.print_pdf.title'),
      description: t('mcp.print_pdf.description'),
      inputSchema: {
        content: z.string().optional().describe(t('mcp.arg.content')),
        url: z.string().url().optional().describe(t('mcp.arg.url')),
        filePath: z.string().optional().describe(t('mcp.arg.file_path')),
        fileName: z.string().optional(),
        printer: z.string().optional().describe(t('mcp.arg.printer')),
        copies: z.number().int().min(1).max(99).optional(),
        title: z.string().optional(),
        options: printOptionsSchema,
        wait: z.boolean().optional().describe(t('mcp.arg.wait')),
      },
    },
    wrap((args) => api.printPdf(args)),
  );

  server.registerTool(
    'print_template',
    {
      title: t('mcp.print_template.title'),
      description: t('mcp.print_template.description'),
      inputSchema: {
        templateId: z.string().optional(),
        template: z.string().optional().describe(t('mcp.arg.template')),
        engine: z.enum(['html', 'text']).optional(),
        data: z.record(z.any()).optional().describe(t('mcp.arg.data')),
        page: pageSchema,
        printer: z.string().optional(),
        copies: z.number().int().min(1).max(99).optional(),
        title: z.string().optional(),
        options: printOptionsSchema,
        wait: z.boolean().optional(),
      },
    },
    wrap((args) => api.printTemplate(args)),
  );

  server.registerTool(
    'render_template',
    {
      title: t('mcp.render_template.title'),
      description: t('mcp.render_template.description'),
      inputSchema: {
        templateId: z.string().optional(),
        template: z.string().optional(),
        engine: z.enum(['html', 'text']).optional(),
        data: z.record(z.any()).optional(),
        page: pageSchema,
        includeBase64: z.boolean().optional().describe(t('mcp.arg.include_base64')),
      },
    },
    wrap((args) => api.renderTemplate(args)),
  );

  server.registerTool(
    'list_templates',
    { title: t('mcp.list_templates.title'), description: t('mcp.list_templates.description'), inputSchema: {} },
    wrap(() => api.listTemplates()),
  );

  server.registerTool(
    'get_template',
    {
      title: t('mcp.get_template.title'),
      description: t('mcp.get_template.description'),
      inputSchema: { id: z.string() },
    },
    wrap((args) => api.getTemplate(args)),
  );

  server.registerTool(
    'save_template',
    {
      title: t('mcp.save_template.title'),
      description: t('mcp.save_template.description'),
      inputSchema: {
        id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        engine: z.enum(['html', 'text']).optional(),
        content: z.string().optional(),
        page: pageSchema,
        sampleData: z.record(z.any()).optional(),
      },
    },
    wrap(async (args) => {
      if (args.id) {
        try {
          await api.getTemplate({ id: args.id });
          return api.updateTemplate(args);
        } catch {
          return api.createTemplate(args);
        }
      }
      return api.createTemplate(args);
    }),
  );

  server.registerTool(
    'delete_template',
    { title: t('mcp.delete_template.title'), description: t('mcp.delete_template.description'), inputSchema: { id: z.string() } },
    wrap((args) => api.deleteTemplate(args)),
  );

  server.registerTool(
    'list_jobs',
    {
      title: t('mcp.list_jobs.title'),
      description: t('mcp.list_jobs.description'),
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        status: z.enum(['queued', 'rendering', 'printing', 'completed', 'failed', 'canceled']).optional(),
        printer: z.string().optional(),
      },
    },
    wrap((args) => api.listJobs(args)),
  );

  server.registerTool(
    'get_job',
    { title: t('mcp.get_job.title'), description: t('mcp.get_job.description'), inputSchema: { id: z.string() } },
    wrap((args) => api.getJob(args)),
  );

  server.registerTool(
    'cancel_job',
    { title: t('mcp.cancel_job.title'), description: t('mcp.cancel_job.description'), inputSchema: { id: z.string() } },
    wrap((args) => api.cancelJob(args)),
  );

  server.registerTool(
    'print_test_page',
    {
      title: t('mcp.print_test_page.title'),
      description: t('mcp.print_test_page.description'),
      inputSchema: { printer: z.string().optional() },
    },
    wrap((args) => api.printTest(args)),
  );

  return server;
}
