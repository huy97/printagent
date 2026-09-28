import { getConfig } from '../core/config.js';

const ERROR_RESPONSE = {
  description: 'Error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
};

const RENDER_HEADERS = {
  'X-Render-Width-Mm': { description: 'Actual PDF page width in mm', schema: { type: 'number' } },
  'X-Render-Height-Mm': { description: 'Actual PDF page height in mm', schema: { type: 'number' } },
  'X-Render-Pages': { description: 'PDF page count; more than 1 means the content overflows the configured page', schema: { type: 'integer' } },
};

const SCHEMAS = {
  Error: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            enum: [
              'bad_request',
              'unauthorized',
              'local_only',
              'not_found',
              'payload_too_large',
              'too_many_attempts',
              'internal_error',
            ],
          },
          key: { type: 'string', example: 'error.printer_not_found', description: 'Stable i18n key for client-side translation' },
          params: { type: ['object', 'null'], description: 'Values interpolated into the message for this key' },
          message: { type: 'string', description: 'Message translated into the request locale (x-locale, ?lang=, accept-language)' },
          details: { type: ['object', 'null'] },
        },
      },
    },
  },
  Job: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'job_9f2c1a44' },
      type: { type: 'string', enum: ['pdf', 'template'] },
      status: {
        type: 'string',
        enum: ['queued', 'rendering', 'printing', 'completed', 'failed', 'canceled'],
      },
      printer: { type: ['string', 'null'], description: 'null means the agent default printer' },
      copies: { type: 'integer' },
      title: { type: 'string' },
      templateId: { type: ['string', 'null'] },
      data: { type: ['object', 'null'] },
      engine: { type: ['string', 'null'], enum: ['html', 'text', null] },
      fileName: { type: ['string', 'null'] },
      bytes: { type: ['integer', 'null'] },
      attempts: { type: 'integer' },
      origin: { type: 'string', example: 'api:pos-terminal' },
      error: { type: ['string', 'null'], description: 'Error message translated into the request locale' },
      errorKey: { type: ['string', 'null'], example: 'error.print_failed', description: 'Stable i18n key of the error' },
      errorParams: { type: ['object', 'null'], description: 'Values interpolated into the error message' },
      createdAt: { type: 'string', format: 'date-time' },
      startedAt: { type: ['string', 'null'], format: 'date-time' },
      finishedAt: { type: ['string', 'null'], format: 'date-time' },
    },
  },
  Printer: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'System name, use it as the printer field value' },
      description: { type: 'string' },
      location: { type: ['string', 'null'] },
      status: { type: 'string', enum: ['ready', 'paused', 'offline', 'unknown'] },
      driver: { type: ['string', 'null'] },
      connection: { type: ['string', 'null'] },
      isSystemDefault: { type: 'boolean' },
      isAgentDefault: { type: 'boolean' },
    },
  },
  PageSetup: {
    type: 'object',
    description: 'Page setup used when rendering HTML to PDF',
    properties: {
      format: { type: 'string', example: 'A4' },
      width: { type: 'string', example: '80mm' },
      height: { type: 'string', example: 'auto', description: 'auto cuts at the content height (roll paper)' },
      landscape: { type: 'boolean' },
      marginTop: { type: 'string', example: '10mm' },
      marginRight: { type: 'string' },
      marginBottom: { type: 'string' },
      marginLeft: { type: 'string' },
      frame: {
        type: 'boolean',
        description: 'Defaults to true: with a custom size the agent injects a doctype and frame CSS (no default browser margin, box-sizing: border-box). Set false if the template handles everything itself',
      },
    },
  },
  PrintOptions: {
    type: 'object',
    properties: {
      duplex: { type: 'string', enum: ['none', 'long', 'short'] },
      paperSize: { type: 'string', example: 'A4' },
      orientation: { type: 'string', enum: ['portrait', 'landscape'] },
      fitToPage: { type: 'boolean' },
      raw: { type: 'boolean', description: 'Send raw bytes straight to the printer, for ESC/POS' },
      extraOptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'CUPS -o parameters, each written as "key=value" (Linux/macOS only, ignored on Windows)',
        example: ['print-quality=5', 'ColorModel=Gray'],
      },
    },
  },
  Template: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'vat-invoice-a4' },
      name: { type: 'string' },
      description: { type: 'string' },
      engine: { type: 'string', enum: ['html', 'text'] },
      content: { type: 'string', description: 'Handlebars source' },
      sampleData: { type: 'object', description: 'Example of the exact shape to pass in the data field' },
      page: { $ref: '#/components/schemas/PageSetup' },
      printing: { type: 'object', properties: { raw: { type: 'boolean' }, copies: { type: 'integer' } } },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
};

function jsonBody(schema, required = true) {
  return { required, content: { 'application/json': { schema } } };
}

function jsonResponse(description, schema) {
  return { description, content: { 'application/json': { schema } } };
}

const PATHS = {
  '/api/health': {
    get: {
      tags: ['System'],
      summary: 'Agent status',
      description: 'No API key required. With a key the response also includes the queue, platform and tunnel.',
      security: [],
      responses: {
        200: jsonResponse('Status', {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            version: { type: 'string' },
            uptimeSeconds: { type: 'integer' },
            platform: { type: 'string' },
            printerDriver: { type: 'string', example: 'cups-macos' },
            queue: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                running: { type: 'integer' },
                queued: { type: 'integer' },
              },
            },
          },
        }),
      },
    },
  },
  '/api/info': {
    get: {
      tags: ['System'],
      summary: 'Agent info and renderer health',
      responses: { 200: jsonResponse('Info', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/print/pdf': {
    post: {
      tags: ['Print'],
      summary: 'Print a PDF file',
      description:
        'Pick exactly one source: content (base64), url, filePath, or a multipart upload in the file field. Returns immediately with status queued unless wait: true is set.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                content: { type: 'string', format: 'byte', description: 'Base64-encoded PDF content' },
                url: { type: 'string', format: 'uri', description: 'http/https only; private network ranges are blocked' },
                filePath: { type: 'string', description: 'Disabled by default, enable it in the printing config' },
                fileName: { type: 'string' },
                printer: { type: 'string' },
                copies: { type: 'integer', default: 1 },
                title: { type: 'string' },
                options: { $ref: '#/components/schemas/PrintOptions' },
                wait: { type: 'boolean', default: false, description: 'Wait for the print to finish before responding' },
                waitTimeoutMs: { type: 'integer', default: 60000 },
                clientId: { type: 'string' },
              },
            },
          },
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary', description: 'Up to 64MB' },
                printer: { type: 'string' },
                copies: { type: 'integer' },
                wait: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        202: jsonResponse('Job queued', { $ref: '#/components/schemas/Job' }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/print/template': {
    post: {
      tags: ['Print'],
      summary: 'Print from a template and JSON variables',
      description:
        'Use the templateId of a saved template, or pass an inline template with its engine. Get the exact data shape from GET /api/templates/{id} and read sampleData.',
      requestBody: jsonBody({
        type: 'object',
        properties: {
          templateId: { type: 'string', example: 'vat-invoice-a4' },
          template: { type: 'string', description: 'Inline Handlebars source, instead of templateId' },
          engine: { type: 'string', enum: ['html', 'text'] },
          data: { type: 'object', description: 'Variables passed to the template' },
          page: { $ref: '#/components/schemas/PageSetup' },
          printer: { type: 'string' },
          copies: { type: 'integer', default: 1 },
          title: { type: 'string' },
          options: { $ref: '#/components/schemas/PrintOptions' },
          wait: { type: 'boolean', default: false },
          waitTimeoutMs: { type: 'integer' },
          clientId: { type: 'string' },
        },
      }),
      responses: {
        202: jsonResponse('Job queued', { $ref: '#/components/schemas/Job' }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/print/render': {
    post: {
      tags: ['Print'],
      summary: 'Render a template without printing',
      parameters: [
        {
          name: 'format',
          in: 'query',
          schema: { type: 'string', enum: ['pdf', 'html', 'base64'] },
          description: 'Empty returns binary PDF; html returns the HTML source; base64 returns JSON with a base64 string',
        },
      ],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          template: { type: 'string' },
          engine: { type: 'string', enum: ['html', 'text'] },
          data: { type: 'object' },
          page: { $ref: '#/components/schemas/PageSetup' },
        },
      }),
      responses: {
        200: {
          description: 'Rendered document',
          headers: RENDER_HEADERS,
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'text/plain': { schema: { type: 'string' } },
            'application/json': {
              schema: {
                type: 'object',
                properties: { contentType: { type: 'string' }, base64: { type: 'string' } },
              },
            },
          },
        },
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/printers': {
    get: {
      tags: ['Printers'],
      summary: 'List connected printers',
      parameters: [
        { name: 'refresh', in: 'query', schema: { type: 'string', enum: ['1', 'true'] }, description: 'Rescan instead of using the cache' },
      ],
      responses: {
        200: jsonResponse('List', {
          type: 'object',
          properties: {
            printers: { type: 'array', items: { $ref: '#/components/schemas/Printer' } },
            lastScanAt: { type: ['integer', 'null'] },
            driver: { type: 'string' },
            defaultPrinter: { type: ['string', 'null'] },
          },
        }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/printers/scan': {
    post: {
      tags: ['Printers'],
      summary: 'Rescan printers',
      responses: { 200: jsonResponse('Scan result', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/printers/{name}': {
    get: {
      tags: ['Printers'],
      summary: 'Printer details with driver options',
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: jsonResponse('Details', { $ref: '#/components/schemas/Printer' }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/printers/{name}/default': {
    post: {
      tags: ['Printers'],
      summary: 'Set as the agent default printer',
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: jsonResponse('Updated', { type: 'object', properties: { defaultPrinter: { type: 'string' } } }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/printers/{name}/test': {
    post: {
      tags: ['Printers'],
      summary: 'Print a test page',
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Test job', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/templates': {
    get: {
      tags: ['Template'],
      summary: 'List templates',
      responses: {
        200: jsonResponse('List', {
          type: 'object',
          properties: { templates: { type: 'array', items: { $ref: '#/components/schemas/Template' } } },
        }),
      },
    },
    post: {
      tags: ['Template'],
      summary: 'Create a template',
      requestBody: jsonBody({ $ref: '#/components/schemas/Template' }),
      responses: { 201: jsonResponse('Created', { $ref: '#/components/schemas/Template' }), default: ERROR_RESPONSE },
    },
  },
  '/api/templates/seeds': {
    get: {
      tags: ['Template'],
      summary: 'List the starter templates for a language',
      parameters: [{ name: 'lang', in: 'query', schema: { type: 'string', enum: ['vi', 'en'] } }],
      responses: {
        200: jsonResponse('Starter set', {
          type: 'object',
          properties: {
            locale: { type: 'string' },
            seeds: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  engine: { type: 'string', enum: ['html', 'text'] },
                },
              },
            },
          },
        }),
      },
    },
  },
  '/api/templates/seed': {
    post: {
      tags: ['Template'],
      summary: 'Create the starter templates for a language, keeping existing ones',
      requestBody: jsonBody({
        type: 'object',
        properties: { locale: { type: 'string', enum: ['vi', 'en'] } },
      }),
      responses: {
        201: jsonResponse('Creation result', {
          type: 'object',
          properties: {
            locale: { type: 'string' },
            created: { type: 'integer' },
            skipped: { type: 'integer' },
            total: { type: 'integer' },
          },
        }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/templates/{id}': {
    get: {
      tags: ['Template'],
      summary: 'Template details with sampleData',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Details', { $ref: '#/components/schemas/Template' }), default: ERROR_RESPONSE },
    },
    put: {
      tags: ['Template'],
      summary: 'Update a template',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody({ $ref: '#/components/schemas/Template' }),
      responses: { 200: jsonResponse('Saved', { $ref: '#/components/schemas/Template' }), default: ERROR_RESPONSE },
    },
    delete: {
      tags: ['Template'],
      summary: 'Delete a template',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Deleted', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/templates/{id}/preview': {
    post: {
      tags: ['Template'],
      summary: 'Preview a saved template',
      description: 'Without data, the template sampleData is used.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['pdf', 'html'] } },
      ],
      requestBody: jsonBody(
        {
          type: 'object',
          properties: { data: { type: 'object' }, page: { $ref: '#/components/schemas/PageSetup' }, engine: { type: 'string' } },
        },
        false,
      ),
      responses: {
        200: {
          description: 'Rendered document',
          headers: RENDER_HEADERS,
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'text/plain': { schema: { type: 'string' } },
          },
        },
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/jobs': {
    get: {
      tags: ['Job'],
      summary: 'List jobs',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'rendering', 'printing', 'completed', 'failed', 'canceled'] } },
        { name: 'printer', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        200: jsonResponse('List', {
          type: 'object',
          properties: {
            jobs: { type: 'array', items: { $ref: '#/components/schemas/Job' } },
            stats: { type: 'object' },
          },
        }),
      },
    },
  },
  '/api/jobs/{id}': {
    get: {
      tags: ['Job'],
      summary: 'Job details',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Details', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/jobs/{id}/file': {
    get: {
      tags: ['Job'],
      summary: 'Download the job document',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'File', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/jobs/{id}/cancel': {
    post: {
      tags: ['Job'],
      summary: 'Cancel a pending job',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Canceled job', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/jobs/{id}/retry': {
    post: {
      tags: ['Job'],
      summary: 'Reprint a finished job',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('New job', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/settings': {
    get: {
      tags: ['System'],
      summary: 'Current configuration',
      responses: { 200: jsonResponse('Configuration', { type: 'object' }) },
    },
    put: {
      tags: ['System'],
      summary: 'Update the configuration',
      description: 'Some sensitive fields (binary paths, disabling authentication) are only accepted from the agent machine itself.',
      requestBody: jsonBody({ type: 'object' }),
      responses: { 200: jsonResponse('Saved', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/logs': {
    get: {
      tags: ['System'],
      summary: 'Recent logs',
      parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } }],
      responses: { 200: jsonResponse('Logs', { type: 'object' }) },
    },
  },
  '/api/tunnel': {
    get: {
      tags: ['Tunnel'],
      summary: 'Public tunnel status',
      responses: { 200: jsonResponse('Status', { type: 'object' }) },
    },
  },
  '/api/tunnel/start': {
    post: {
      tags: ['Tunnel'],
      summary: 'Start the tunnel',
      requestBody: jsonBody(
        { type: 'object', properties: { provider: { type: 'string', enum: ['cloudflare', 'ngrok'] } } },
        false,
      ),
      responses: { 200: jsonResponse('Status after start', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/tunnel/stop': {
    post: {
      tags: ['Tunnel'],
      summary: 'Stop the tunnel',
      responses: { 200: jsonResponse('Status after stop', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/setup': {
    get: {
      tags: ['System'],
      summary: 'Setup check result',
      responses: { 200: jsonResponse('Per-step status', { type: 'object' }) },
    },
  },
  '/api/setup/progress': {
    get: {
      tags: ['System'],
      summary: 'Progress of the current setup run',
      responses: { 200: jsonResponse('Progress', { type: 'object' }) },
    },
  },
  '/api/setup/run': {
    post: {
      tags: ['System'],
      summary: 'Run setup',
      description: 'Only accepted from the agent machine itself.',
      requestBody: jsonBody({ type: 'object', properties: { enableService: { type: 'boolean' } } }, false),
      responses: { 200: jsonResponse('Result', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/setup/service': {
    post: {
      tags: ['System'],
      summary: 'Install or remove the background service',
      description: 'Only accepted from the agent machine itself.',
      requestBody: jsonBody({
        type: 'object',
        properties: { action: { type: 'string', enum: ['install', 'uninstall'] } },
      }),
      responses: { 200: jsonResponse('Service status', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/apikeys': {
    get: {
      tags: ['System'],
      summary: 'List API keys',
      description: 'Only visible from the agent machine itself, not through a tunnel. Key values are masked.',
      responses: { 200: jsonResponse('List', { type: 'object' }), default: ERROR_RESPONSE },
    },
    post: {
      tags: ['System'],
      summary: 'Create an API key',
      description: 'Only from the agent machine itself. The full key value is returned this one time only.',
      requestBody: jsonBody({ type: 'object', properties: { name: { type: 'string' } } }),
      responses: { 200: jsonResponse('Created key', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/apikeys/{id}': {
    delete: {
      tags: ['System'],
      summary: 'Delete an API key',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Deleted', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
};

const OPERATION_IDS = {
  'get /api/health': 'getHealth',
  'get /api/info': 'getInfo',
  'post /api/print/pdf': 'printPdf',
  'post /api/print/template': 'printTemplate',
  'post /api/print/render': 'renderTemplate',
  'get /api/printers': 'listPrinters',
  'post /api/printers/scan': 'scanPrinters',
  'get /api/printers/{name}': 'getPrinter',
  'post /api/printers/{name}/default': 'setDefaultPrinter',
  'post /api/printers/{name}/test': 'printTestPage',
  'get /api/templates': 'listTemplates',
  'post /api/templates': 'createTemplate',
  'get /api/templates/{id}': 'getTemplate',
  'put /api/templates/{id}': 'updateTemplate',
  'delete /api/templates/{id}': 'deleteTemplate',
  'post /api/templates/{id}/preview': 'previewTemplate',
  'get /api/jobs': 'listJobs',
  'get /api/jobs/{id}': 'getJob',
  'get /api/jobs/{id}/file': 'getJobFile',
  'post /api/jobs/{id}/cancel': 'cancelJob',
  'post /api/jobs/{id}/retry': 'retryJob',
  'get /api/settings': 'getSettings',
  'put /api/settings': 'updateSettings',
  'get /api/logs': 'getLogs',
  'get /api/tunnel': 'getTunnel',
  'post /api/tunnel/start': 'startTunnel',
  'post /api/tunnel/stop': 'stopTunnel',
  'get /api/setup': 'getSetup',
  'get /api/setup/progress': 'getSetupProgress',
  'post /api/setup/run': 'runSetup',
  'post /api/setup/service': 'manageService',
  'get /api/apikeys': 'listApiKeys',
  'post /api/apikeys': 'createApiKey',
  'delete /api/apikeys/{id}': 'deleteApiKey',
};

function withOperationIds(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([route, methods]) => [
      route,
      Object.fromEntries(
        Object.entries(methods).map(([method, operation]) => [
          method,
          {
            operationId: OPERATION_IDS[`${method} ${route}`],
            ...operation,
            responses: operation.security?.length === 0
              ? operation.responses
              : { ...operation.responses, 401: { ...ERROR_RESPONSE, description: 'Missing or invalid API key' } },
          },
        ]),
      ),
    ]),
  );
}

export function buildOpenApi(baseUrl) {
  const config = getConfig();
  return {
    openapi: '3.1.0',
    info: {
      title: 'PrintAgent API',
      version: process.env.npm_package_version ?? '1.0.0',
      description:
        'A print agent running on the local machine: it takes a PDF, or a template with JSON variables, and prints to a connected printer. Condensed docs for AI agents: /llms.txt (add ?lang=vi for Vietnamese). Besides REST there is a WebSocket at /ws and MCP at /mcp. Error messages follow the x-locale header, the ?lang= query or accept-language (default en); every error carries a stable key and params so clients can translate it themselves.',
    },
    servers: [{ url: baseUrl, description: `Agent ${config.agent.name}` }],
    security: [{ apiKey: [] }, { bearer: [] }],
    tags: [
      { name: 'Print', description: 'Submit print jobs' },
      { name: 'Printers', description: 'Connected printers' },
      { name: 'Template', description: 'Handlebars print templates' },
      { name: 'Job', description: 'Print queue and history' },
      { name: 'Tunnel', description: 'Expose the agent to the Internet' },
      { name: 'System', description: 'Status and configuration' },
    ],
    paths: withOperationIds(PATHS),
    components: {
      schemas: SCHEMAS,
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        bearer: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}
