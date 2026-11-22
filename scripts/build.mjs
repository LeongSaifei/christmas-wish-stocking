import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const text = ['index.html', 'style.css', 'app.js', 'stockings.js', 'storage.js', 'config.js', 'favicon.svg'];
const binary = ['fonts/title.woff2', 'fonts/hand.woff2', 'og.png'];
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png' };
const ext = (f) => f.split('.').pop();

// 1. 读入源文件
const src = {};
for (const f of text) src[f] = await readFile(`public/${f}`, 'utf8');

// 2. 给会变的资源加内容哈希（?v=xxxx），避免发版后一分钟内新旧文件混用
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const v = {};
v['storage.js'] = hash(src['storage.js']);
src['app.js'] = src['app.js'].replace("from './stockings.js'", `from './stockings.js?v=${hash(src['stockings.js'])}'`);
src['app.js'] = src['app.js'].replace("from './storage.js'", `from './storage.js?v=${v['storage.js']}'`);
for (const f of ['style.css', 'app.js', 'config.js']) v[f] = hash(src[f]);
for (const f of ['style.css', 'app.js', 'config.js']) src['index.html'] = src['index.html'].replace(`./${f}"`, `./${f}?v=${v[f]}"`);

// 3. 输出静态站点 dist/client（GitHub Pages / Vercel 都发布这个目录）
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist/client', { recursive: true });
for (const f of text) await writeFile(`dist/client/${f}`, src[f]);

// 4. 输出带 API 的 Worker
const assets = {};
for (const f of text) assets['/' + f] = { body: src[f], type: mime[ext(f)] };
for (const f of binary) assets['/' + f] = { body: (await readFile(`public/${f}`)).toString('base64'), type: mime[ext(f)], b64: true };
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
const api = await readFile('worker/api.js', 'utf8');
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co https://christmas-wish-stocking-7df218.adroitbun.chatgpt.site; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const server = `${api}
const assets = ${JSON.stringify(assets)};
const decoded = {};
function bodyOf(path, a) {
  if (!a.b64) return a.body;
  return decoded[path] ??= Uint8Array.from(atob(a.body), (c) => c.charCodeAt(0));
}
export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handleApi(request, env);
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const asset = assets[path];
  if (!asset) return new Response('Not found', { status: 404 });
  // 带 ?v= 的文件和字体内容不变，可长期缓存；HTML 每次都检查更新
  const immutable = url.searchParams.has('v') || path.startsWith('/fonts/');
  return new Response(request.method === 'HEAD' ? null : bodyOf(path, asset), { headers: {
    'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    'Content-Security-Policy': ${JSON.stringify(csp)}
  } });
} };
`;
await writeFile('dist/server/index.js', server);
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built dist/client (static site) and dist/server (Worker with API). Versions:', v);
