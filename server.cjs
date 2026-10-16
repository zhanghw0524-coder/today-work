// A static-only local launcher; no application backend and no data is written to disk.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8765;
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : '/';
const base = '/' + baseArg.split('/').filter(Boolean).join('/') + (baseArg.split('/').filter(Boolean).length ? '/' : '');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let relative;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) { res.writeHead(404); res.end('Not found'); return; }
    relative = pathname.slice(base.length) || 'index.html';
  } catch { res.writeHead(400); res.end('Bad request'); return; }
  const filename = path.resolve(root, relative);
  const allowed = ['index.html', 'manifest.webmanifest', 'service-worker.js'].includes(relative) || /^(css|js|icons)\//.test(relative);
  if (!allowed || !filename.startsWith(root + path.sep)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(filename, (error, buffer) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buffer);
  });
});
server.on('error', error => { console.error(`Cannot start Today Work: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Today Work: http://127.0.0.1:${port}${base} — Ctrl+C to stop`));
