import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png' };
const allowed = new Set(['index.html', 'style.css', 'app.js', 'config.js', 'storage.js', 'stockings.js', 'favicon.svg', 'og.png', 'fonts/title.woff2', 'fonts/hand.woff2']);
const port = Number(process.env.PORT || 4173);
// HOST=0.0.0.0 npm run dev 可在手机上通过局域网 IP 预览
const host = process.env.HOST || '127.0.0.1';
createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(new URL('../public/' + name, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[name.split('.').pop()], 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500).end(); }
}).listen(port, host, () => console.log(`Local: http://${host}:${port}`));
