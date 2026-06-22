const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const wsPort = 3001;

// 启动独立WebSocket服务器
console.log('🔌 启动 WebSocket 服务器...');
const { createStandaloneWebSocketServer } = require('./standalone-websocket');
const websocketServer = createStandaloneWebSocketServer(wsPort);

// 启动Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🌐 Next.js ready on http://${hostname}:${port}`);
    console.log(`🔌 WebSocket ready on ws://${hostname}:${wsPort}/ws`);
    console.log('\n✅ 开发环境已启动！按 Ctrl+C 停止服务器');
  });

  // 优雅关闭
  let isShuttingDown = false;
  const cleanup = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n🛑 正在关闭服务器...');

    const forceExitTimer = setTimeout(() => {
      console.warn('关闭超时，强制退出进程');
      process.exit(0);
    }, 1500);

    const exit = () => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    };

    try {
      websocketServer.clients.forEach((client) => {
        try {
          client.terminate();
        } catch {
          // ignore
        }
      });
      websocketServer.close();
    } catch (error) {
      console.warn('关闭 WebSocket 服务器失败:', error);
    }

    server.close(exit);
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
});





