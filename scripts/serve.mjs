import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const types = { html:'text/html', js:'text/javascript', css:'text/css', svg:'image/svg+xml' };
const allowed = new Set(['index.html','style.css','app.js','config.js','storage.js','favicon.svg']);
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404).end(); return; }
  try { const body = await readFile(new URL('../public/'+name,import.meta.url)); res.writeHead(200,{'Content-Type':types[name.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-store'});res.end(body); }
  catch { res.writeHead(500).end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
