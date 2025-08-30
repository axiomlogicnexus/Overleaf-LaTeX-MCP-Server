import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { McpTool } from './ToolRegistry';

export function startMcpWsServer(httpServer: HttpServer, tools: McpTool[], path = '/mcp/ws') {
  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (data: RawData, isBinary: boolean) => {
      try {
        const msg = JSON.parse(data.toString());
        const { id, method, params } = msg;
        if (method === 'mcp.list_tools') {
          const list = tools.map(t => ({ name: t.name, description: t.description }));
          ws.send(JSON.stringify({ id, result: { tools: list } }));
          return;
        }
        if (method === 'mcp.invoke') {
          const name = params?.tool;
          const input = params?.input ?? {};
          const tool = tools.find(t => t.name === name);
          if (!tool) {
            ws.send(JSON.stringify({ id, error: { code: 'tool_not_found', message: `No such tool: ${name}` } }));
            return;
          }
          let parsed = input;
          try {
            if (tool.inputSchema && typeof tool.inputSchema.parse === 'function') {
              parsed = tool.inputSchema.parse(input);
            }
          } catch (e: any) {
            ws.send(JSON.stringify({ id, error: { code: 'invalid_request', message: String(e?.message || e) } }));
            return;
          }
          const result = await tool.handler(parsed);
          ws.send(JSON.stringify({ id, result }));
          return;
        }
        ws.send(JSON.stringify({ id, error: { code: 'method_not_found', message: `Unknown method: ${method}` } }));
      } catch (e: any) {
        try { ws.send(JSON.stringify({ error: { code: 'parse_error', message: String(e?.message || e) } })); } catch {}
      }
    });
  });

  return wss;
}
