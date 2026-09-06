import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('mcp');

export function createMcpHttpHandler(api) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Endpoint MCP chỉ hỗ trợ POST (streamable HTTP, chế độ stateless)' },
        id: null,
      });
      return;
    }
    const server = createMcpServer(api);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error(`Lỗi xử lý MCP request: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message },
          id: null,
        });
      }
    }
  };
}
