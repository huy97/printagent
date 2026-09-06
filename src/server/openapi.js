import { getConfig } from '../core/config.js';

const ERROR_RESPONSE = {
  description: 'Lỗi',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
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
            enum: ['bad_request', 'unauthorized', 'not_found', 'internal_error'],
          },
          message: { type: 'string', description: 'Mô tả lỗi bằng tiếng Việt' },
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
      printer: { type: ['string', 'null'], description: 'null nghĩa là dùng máy in mặc định của agent' },
      copies: { type: 'integer' },
      title: { type: 'string' },
      templateId: { type: ['string', 'null'] },
      data: { type: ['object', 'null'] },
      engine: { type: ['string', 'null'], enum: ['html', 'text', null] },
      fileName: { type: ['string', 'null'] },
      bytes: { type: ['integer', 'null'] },
      attempts: { type: 'integer' },
      origin: { type: 'string', example: 'api:pos-terminal' },
      error: { type: ['string', 'null'] },
      createdAt: { type: 'string', format: 'date-time' },
      startedAt: { type: ['string', 'null'], format: 'date-time' },
      finishedAt: { type: ['string', 'null'], format: 'date-time' },
    },
  },
  Printer: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Tên hệ thống, dùng làm giá trị cho trường printer' },
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
    description: 'Khổ giấy khi render HTML thành PDF',
    properties: {
      format: { type: 'string', example: 'A4' },
      width: { type: 'string', example: '80mm' },
      height: { type: 'string', example: 'auto', description: 'auto để cắt theo chiều cao nội dung (giấy cuộn)' },
      landscape: { type: 'boolean' },
      marginTop: { type: 'string', example: '10mm' },
      marginRight: { type: 'string' },
      marginBottom: { type: 'string' },
      marginLeft: { type: 'string' },
    },
  },
  PrintOptions: {
    type: 'object',
    properties: {
      duplex: { type: 'string', enum: ['none', 'long', 'short'] },
      paperSize: { type: 'string', example: 'A4' },
      orientation: { type: 'string', enum: ['portrait', 'landscape'] },
      fitToPage: { type: 'boolean' },
      raw: { type: 'boolean', description: 'Gửi thẳng byte tới máy in, dùng cho ESC/POS' },
      extraOptions: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
  Template: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'vat-invoice-a4' },
      name: { type: 'string' },
      description: { type: 'string' },
      engine: { type: 'string', enum: ['html', 'text'] },
      content: { type: 'string', description: 'Mã Handlebars' },
      sampleData: { type: 'object', description: 'Khuôn dữ liệu đúng để truyền vào trường data' },
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
      tags: ['Hệ thống'],
      summary: 'Trạng thái agent',
      description: 'Không cần API key. Có key sẽ trả thêm hàng đợi, nền tảng và tunnel.',
      security: [],
      responses: {
        200: jsonResponse('Trạng thái', {
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
      tags: ['Hệ thống'],
      summary: 'Thông tin agent và tình trạng bộ render',
      responses: { 200: jsonResponse('Thông tin', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/print/pdf': {
    post: {
      tags: ['In'],
      summary: 'In một file PDF',
      description:
        'Chọn đúng một nguồn tài liệu: content (base64), url, filePath, hoặc upload multipart field file. Trả về ngay với status queued, trừ khi đặt wait: true.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                content: { type: 'string', format: 'byte', description: 'Nội dung PDF mã hoá base64' },
                url: { type: 'string', format: 'uri', description: 'Chỉ http/https, chặn dải mạng nội bộ' },
                filePath: { type: 'string', description: 'Mặc định bị tắt, bật trong cấu hình printing' },
                fileName: { type: 'string' },
                printer: { type: 'string' },
                copies: { type: 'integer', default: 1 },
                title: { type: 'string' },
                options: { $ref: '#/components/schemas/PrintOptions' },
                wait: { type: 'boolean', default: false, description: 'Chờ in xong mới trả về' },
                waitTimeoutMs: { type: 'integer', default: 60000 },
                clientId: { type: 'string' },
              },
            },
          },
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary', description: 'Tối đa 64MB' },
                printer: { type: 'string' },
                copies: { type: 'integer' },
                wait: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        202: jsonResponse('Job đã vào hàng đợi', { $ref: '#/components/schemas/Job' }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/print/template': {
    post: {
      tags: ['In'],
      summary: 'In từ template và biến JSON',
      description:
        'Dùng templateId của mẫu đã lưu, hoặc truyền template inline kèm engine. Lấy khuôn dữ liệu đúng bằng GET /api/templates/{id} rồi đọc sampleData.',
      requestBody: jsonBody({
        type: 'object',
        properties: {
          templateId: { type: 'string', example: 'vat-invoice-a4' },
          template: { type: 'string', description: 'Mã Handlebars inline, thay cho templateId' },
          engine: { type: 'string', enum: ['html', 'text'] },
          data: { type: 'object', description: 'Biến truyền vào template' },
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
        202: jsonResponse('Job đã vào hàng đợi', { $ref: '#/components/schemas/Job' }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/print/render': {
    post: {
      tags: ['In'],
      summary: 'Render template nhưng không in',
      parameters: [
        {
          name: 'format',
          in: 'query',
          schema: { type: 'string', enum: ['pdf', 'html', 'base64'] },
          description: 'Bỏ trống trả PDF nhị phân; html trả mã HTML; base64 trả JSON kèm chuỗi base64',
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
          description: 'Tài liệu đã render',
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
      tags: ['Máy in'],
      summary: 'Danh sách máy in đang kết nối',
      parameters: [
        { name: 'refresh', in: 'query', schema: { type: 'string', enum: ['1', 'true'] }, description: 'Quét lại thay vì lấy cache' },
      ],
      responses: {
        200: jsonResponse('Danh sách', {
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
      tags: ['Máy in'],
      summary: 'Quét lại máy in',
      responses: { 200: jsonResponse('Kết quả quét', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/printers/{name}': {
    get: {
      tags: ['Máy in'],
      summary: 'Chi tiết máy in kèm tuỳ chọn driver',
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: jsonResponse('Chi tiết', { $ref: '#/components/schemas/Printer' }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/printers/{name}/default': {
    post: {
      tags: ['Máy in'],
      summary: 'Đặt làm máy in mặc định của agent',
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: jsonResponse('Đã đặt', { type: 'object', properties: { defaultPrinter: { type: 'string' } } }),
        default: ERROR_RESPONSE,
      },
    },
  },
  '/api/printers/{name}/test': {
    post: {
      tags: ['Máy in'],
      summary: 'In trang thử',
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Job in thử', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/templates': {
    get: {
      tags: ['Template'],
      summary: 'Danh sách template',
      responses: {
        200: jsonResponse('Danh sách', {
          type: 'object',
          properties: { templates: { type: 'array', items: { $ref: '#/components/schemas/Template' } } },
        }),
      },
    },
    post: {
      tags: ['Template'],
      summary: 'Tạo template',
      requestBody: jsonBody({ $ref: '#/components/schemas/Template' }),
      responses: { 201: jsonResponse('Đã tạo', { $ref: '#/components/schemas/Template' }), default: ERROR_RESPONSE },
    },
  },
  '/api/templates/{id}': {
    get: {
      tags: ['Template'],
      summary: 'Chi tiết template kèm sampleData',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Chi tiết', { $ref: '#/components/schemas/Template' }), default: ERROR_RESPONSE },
    },
    put: {
      tags: ['Template'],
      summary: 'Sửa template',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody({ $ref: '#/components/schemas/Template' }),
      responses: { 200: jsonResponse('Đã lưu', { $ref: '#/components/schemas/Template' }), default: ERROR_RESPONSE },
    },
    delete: {
      tags: ['Template'],
      summary: 'Xoá template',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Đã xoá', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/templates/{id}/preview': {
    post: {
      tags: ['Template'],
      summary: 'Render thử template đã lưu',
      description: 'Không truyền data thì dùng sampleData của chính template đó.',
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
          description: 'Tài liệu đã render',
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
      summary: 'Danh sách job',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'rendering', 'printing', 'completed', 'failed', 'canceled'] } },
        { name: 'printer', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        200: jsonResponse('Danh sách', {
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
      summary: 'Chi tiết job',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Chi tiết', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/jobs/{id}/file': {
    get: {
      tags: ['Job'],
      summary: 'Tải file tài liệu của job',
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
      summary: 'Huỷ job đang chờ',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Job sau khi huỷ', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/jobs/{id}/retry': {
    post: {
      tags: ['Job'],
      summary: 'In lại job đã chạy',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Job mới', { $ref: '#/components/schemas/Job' }), default: ERROR_RESPONSE },
    },
  },
  '/api/settings': {
    get: {
      tags: ['Hệ thống'],
      summary: 'Cấu hình hiện tại',
      responses: { 200: jsonResponse('Cấu hình', { type: 'object' }) },
    },
    put: {
      tags: ['Hệ thống'],
      summary: 'Sửa cấu hình',
      description: 'Một số trường nhạy cảm (đường dẫn binary, tắt xác thực) chỉ nhận request đến trực tiếp từ máy chạy agent.',
      requestBody: jsonBody({ type: 'object' }),
      responses: { 200: jsonResponse('Đã lưu', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/logs': {
    get: {
      tags: ['Hệ thống'],
      summary: 'Nhật ký gần đây',
      parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } }],
      responses: { 200: jsonResponse('Nhật ký', { type: 'object' }) },
    },
  },
  '/api/tunnel': {
    get: {
      tags: ['Tunnel'],
      summary: 'Trạng thái tunnel công khai',
      responses: { 200: jsonResponse('Trạng thái', { type: 'object' }) },
    },
  },
  '/api/tunnel/start': {
    post: {
      tags: ['Tunnel'],
      summary: 'Bật tunnel',
      requestBody: jsonBody(
        { type: 'object', properties: { provider: { type: 'string', enum: ['cloudflare', 'ngrok'] } } },
        false,
      ),
      responses: { 200: jsonResponse('Trạng thái sau khi bật', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/tunnel/stop': {
    post: {
      tags: ['Tunnel'],
      summary: 'Tắt tunnel',
      responses: { 200: jsonResponse('Trạng thái sau khi tắt', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/setup': {
    get: {
      tags: ['Hệ thống'],
      summary: 'Kết quả kiểm tra cài đặt',
      responses: { 200: jsonResponse('Tình trạng từng bước', { type: 'object' }) },
    },
  },
  '/api/setup/progress': {
    get: {
      tags: ['Hệ thống'],
      summary: 'Tiến độ lần chạy cài đặt hiện tại',
      responses: { 200: jsonResponse('Tiến độ', { type: 'object' }) },
    },
  },
  '/api/setup/run': {
    post: {
      tags: ['Hệ thống'],
      summary: 'Chạy cài đặt',
      description: 'Chỉ nhận request đến trực tiếp từ máy chạy agent.',
      requestBody: jsonBody({ type: 'object', properties: { enableService: { type: 'boolean' } } }, false),
      responses: { 200: jsonResponse('Kết quả', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/setup/service': {
    post: {
      tags: ['Hệ thống'],
      summary: 'Đăng ký hoặc gỡ chạy nền',
      description: 'Chỉ nhận request đến trực tiếp từ máy chạy agent.',
      requestBody: jsonBody({
        type: 'object',
        properties: { action: { type: 'string', enum: ['install', 'uninstall'] } },
      }),
      responses: { 200: jsonResponse('Trạng thái dịch vụ', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/apikeys': {
    get: {
      tags: ['Hệ thống'],
      summary: 'Danh sách API key',
      description: 'Chỉ xem được khi request đến trực tiếp từ máy chạy agent, không qua tunnel. Giá trị khoá bị che.',
      responses: { 200: jsonResponse('Danh sách', { type: 'object' }), default: ERROR_RESPONSE },
    },
    post: {
      tags: ['Hệ thống'],
      summary: 'Tạo API key',
      description: 'Chỉ tạo được từ máy chạy agent. Giá trị khoá đầy đủ chỉ trả về đúng một lần này.',
      requestBody: jsonBody({ type: 'object', properties: { name: { type: 'string' } } }),
      responses: { 200: jsonResponse('Khoá vừa tạo', { type: 'object' }), default: ERROR_RESPONSE },
    },
  },
  '/api/apikeys/{id}': {
    delete: {
      tags: ['Hệ thống'],
      summary: 'Xoá API key',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: jsonResponse('Đã xoá', { type: 'object' }), default: ERROR_RESPONSE },
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
              : { ...operation.responses, 401: { ...ERROR_RESPONSE, description: 'Thiếu hoặc sai API key' } },
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
        'Agent in ấn chạy trên máy local: nhận PDF hoặc template kèm biến JSON rồi in ra máy in đang kết nối. Bản rút gọn cho tác nhân AI: /llms.txt (thêm ?lang=en cho bản tiếng Anh). Ngoài REST còn có WebSocket tại /ws và MCP tại /mcp. Thông báo lỗi trả về theo ngôn ngữ của header x-locale, query ?lang= hoặc accept-language; mỗi lỗi kèm trường key ổn định để client tự dịch.',
    },
    servers: [{ url: baseUrl, description: `Agent ${config.agent.name}` }],
    security: [{ apiKey: [] }, { bearer: [] }],
    tags: [
      { name: 'In', description: 'Gửi lệnh in' },
      { name: 'Máy in', description: 'Máy in đang kết nối' },
      { name: 'Template', description: 'Mẫu in Handlebars' },
      { name: 'Job', description: 'Hàng đợi và lịch sử in' },
      { name: 'Tunnel', description: 'Mở agent ra Internet' },
      { name: 'Hệ thống', description: 'Trạng thái và cấu hình' },
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
