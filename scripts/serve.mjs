// Dependency-free static server for the demo. Serves only the demo files (never the course documents
// that live in the same folder) and moves to the next port if the preferred one is taken.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const ALLOWED = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/src/store.js', ['src/store.js', 'text/javascript; charset=utf-8']],
  ['/src/ui.js', ['src/ui.js', 'text/javascript; charset=utf-8']],
  ['/src/app.js', ['src/app.js', 'text/javascript; charset=utf-8']],
]);

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const entry = ALLOWED.get(pathname);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(entry[0], root)));
    response.writeHead(200, { 'content-type': entry[1], 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Could not read file');
  }
});

const preferred = Number(process.env.PORT) || 4173;
let port = preferred;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port < preferred + 20) {
    port += 1;
    server.listen(port, '127.0.0.1');
  } else {
    console.error(error.message);
    process.exit(1);
  }
});
server.on('listening', () => {
  console.log(`IPP demo running at http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
});
server.listen(port, '127.0.0.1');
