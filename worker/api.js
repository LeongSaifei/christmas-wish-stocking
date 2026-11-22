const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAILY_TOTAL = 2000;          // 全站每日上限
// “每日”按北京时间 0 点切换。created_at 存 UTC，下面把北京时间当天 0 点换算回 UTC 再比较，仍能走索引。
const DAY_START_UTC = "datetime(date('now','+8 hours'),'-8 hours')";

export function validateWish(body) {
  if (!body || typeof body !== 'object' || !uuid.test(body.id ?? '') || body.consent !== true || typeof body.gift !== 'string' || typeof body.nickname !== 'string') return null;
  const gift = body.gift.trim(); const nickname = body.nickname.trim();
  if (gift.length < 1 || gift.length > 500 || nickname.length > 30 || (body.website ?? '') !== '') return null;
  if (body.stockingId != null && (typeof body.stockingId !== 'string' || !uuid.test(body.stockingId))) return null;
  return { id: body.id.toLowerCase(), nickname, gift, stockingId: body.stockingId?.toLowerCase() ?? null };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}

async function stockingRequest(route, data, db, cors) {
  const reply = (body, status) => json(body, status, cors);
  if (!data || typeof data.id !== 'string' || !uuid.test(data.id)) return reply({ error: 'invalid_stocking' }, 400);
  const id = data.id.toLowerCase();
  if (route === '/api/stockings/info') {
    const row = await db.prepare('SELECT name FROM stockings WHERE id = ?').bind(id).first();
    return row ? reply({ id, name: row.name }) : reply({ error: 'not_found' }, 404);
  }
  if (typeof data.key !== 'string' || !/^[a-f0-9]{64}$/.test(data.key)) return reply({ error: 'invalid_key' }, 403);
  const bytes = new TextEncoder().encode(data.key);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (route === '/api/stockings/create') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 24) return reply({ error: 'invalid_name' }, 400);
    const created = await db.prepare(`INSERT INTO stockings (id, owner_hash, name)
      SELECT ?, ?, ? WHERE (SELECT count(*) FROM stockings WHERE created_at >= ${DAY_START_UTC}) < 2000
      ON CONFLICT(id) DO NOTHING RETURNING name`).bind(id, hash, name).first();
    if (created) return reply({ id, name: created.name }, 201);
    const prior = await db.prepare('SELECT name FROM stockings WHERE id = ? AND owner_hash = ?').bind(id, hash).first();
    return prior ? reply({ id, name: prior.name }) : reply({ error: 'creation_unavailable' }, 429);
  }
  const owner = await db.prepare('SELECT name FROM stockings WHERE id = ? AND owner_hash = ?').bind(id, hash).first();
  if (!owner) return reply({ error: 'invalid_key' }, 403);
  const before = data.before ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before < 1) return reply({ error: 'invalid_cursor' }, 400);
  const { results } = await db.prepare(`SELECT rowid AS cursor, nickname, gift, created_at
    FROM wishes WHERE stocking_id = ? AND rowid < ? ORDER BY rowid DESC LIMIT 26`).bind(id, before).all();
  const items = results.slice(0, 25);
  return reply({ id, name: owner.name, items, next: results.length > 25 ? items[24].cursor : null });
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowed = new Set([url.origin, 'https://leongsaifei.github.io', ...(env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean)]);
  if (origin && !allowed.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' } });
  const personalWish = url.pathname === '/api/stockings/wish';
  if (!personalWish && !['/api/wishes', '/api/stockings/create', '/api/stockings/info', '/api/stockings/inbox'].includes(url.pathname)) return json({ error: 'not_found' }, 404, cors);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { ...cors, Allow: 'POST, OPTIONS' });
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'json_required' }, 415, cors);
  // Bound bytes while streaming; never buffer an arbitrarily large request.
  let body;
  try {
    if (Number(request.headers.get('Content-Length')) > 8192) return json({ error: 'too_large' }, 413, cors);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'invalid_body' }, 400, cors);
    const chunks = []; let bytes = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 8192) { await reader.cancel(); return json({ error: 'too_large' }, 413, cors); } chunks.push(value); }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(buffer));
  } catch { return json({ error: 'invalid_body' }, 400, cors); }
  if (!personalWish && url.pathname !== '/api/wishes') {
    try { return await stockingRequest(url.pathname, body, env.DB, cors); }
    catch { return json({ error: 'storage_unavailable' }, 503, cors); }
  }
  body = validateWish(body);
  if (!body || personalWish !== Boolean(body.stockingId)) return json({ error: 'invalid_wish' }, 400, cors);
  if (!env.DB) return json({ error: 'storage_unavailable' }, 503, cors);

  try {
    if (body.stockingId && !await env.DB.prepare('SELECT 1 FROM stockings WHERE id = ?').bind(body.stockingId).first()) {
      return json({ error: 'unknown_stocking' }, 404, cors);
    }
    const sameReceipt = async () => {
      const existing = await env.DB.prepare('SELECT nickname,gift,stocking_id FROM wishes WHERE id=?1').bind(body.id).first();
      if (!existing) return null;
      if (existing.stocking_id !== body.stockingId || existing.nickname !== body.nickname || existing.gift !== body.gift) return json({ error: 'receipt_conflict' }, 409, cors);
      return json({ ok: true, id: body.id }, 200, cors);
    };

    // One atomic SQL statement: a shared daily cap, with conflict handling for retries.
    const inserted = await env.DB.prepare(`INSERT INTO wishes (id,nickname,gift,stocking_id)
      SELECT ?,?,?,? WHERE (SELECT count(*) FROM wishes WHERE created_at >= ${DAY_START_UTC}) < ${DAILY_TOTAL}
      ON CONFLICT(id) DO NOTHING RETURNING id`).bind(body.id, body.nickname, body.gift, body.stockingId).first();
    if (inserted) {
      // 旧版本的临时计数按原保留期限过期。清理失败可以在下一次投递后重试。
      const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
      await env.DB.prepare('DELETE FROM submit_counts WHERE day < ?1').bind(day).first().catch(() => {});
      return json({ ok: true, id: inserted.id }, 201, cors);
    }
    return (await sameReceipt()) ?? json({ error: 'daily_capacity' }, 429, cors);
  } catch { return json({ error: 'storage_unavailable' }, 503, cors); }
}
