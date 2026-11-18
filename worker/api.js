const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAILY_TOTAL = 2000;          // 全站每日上限
const DAILY_PER_SOURCE = 5;        // 同一网络来源每日上限（可用 env.PER_SOURCE_LIMIT 覆盖）
// “每日”按北京时间 0 点切换。created_at 存 UTC，下面把北京时间当天 0 点换算回 UTC 再比较，仍能走索引。
const DAY_START_UTC = "datetime(date('now','+8 hours'),'-8 hours')";

export function validateWish(body) {
  if (!body || typeof body !== 'object' || !uuid.test(body.id ?? '') || body.consent !== true || typeof body.gift !== 'string' || typeof body.nickname !== 'string') return null;
  const gift = body.gift.trim(); const nickname = body.nickname.trim();
  if (gift.length < 1 || gift.length > 500 || nickname.length > 30 || (body.website ?? '') !== '') return null;
  return { id: body.id.toLowerCase(), nickname, gift };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}

/** 加盐 SHA-256，原始 IP 不落库；盐每天变化，摘要无法跨天关联。 */
async function sourceKey(request, env, day) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return null;
  const data = new TextEncoder().encode(`${env.IP_SALT ?? 'christmas-post'}|${day}|${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowed = new Set([url.origin, 'https://leongsaifei.github.io', ...(env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean)]);
  if (origin && !allowed.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' } });
  if (url.pathname !== '/api/wishes') return json({ error: 'not_found' }, 404, cors);
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
    body = validateWish(JSON.parse(new TextDecoder().decode(buffer)));
  } catch { return json({ error: 'invalid_body' }, 400, cors); }
  if (!body) return json({ error: 'invalid_wish' }, 400, cors);
  if (!env.DB) return json({ error: 'storage_unavailable' }, 503, cors);

  try {
    const sameReceipt = async () => {
      const existing = await env.DB.prepare('SELECT nickname,gift FROM wishes WHERE id=?1').bind(body.id).first();
      if (!existing) return null;
      if (existing.nickname !== body.nickname || existing.gift !== body.gift) return json({ error: 'receipt_conflict' }, 409, cors);
      return json({ ok: true, id: body.id }, 200, cors);
    };

    // 同一来源当天配额。重试同一张回执不占配额。
    const limit = Number(env.PER_SOURCE_LIMIT) || DAILY_PER_SOURCE;
    const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const key = await sourceKey(request, env, day);
    if (key) {
      const row = await env.DB.prepare('SELECT n FROM submit_counts WHERE day=?1 AND source=?2').bind(day, key).first();
      if (row && row.n >= limit) return (await sameReceipt()) ?? json({ error: 'source_daily_limit' }, 429, cors);
    }

    // One atomic SQL statement: a shared daily cap, with conflict handling for retries.
    const inserted = await env.DB.prepare(`INSERT INTO wishes (id,nickname,gift)
      SELECT ?1,?2,?3 WHERE (SELECT count(*) FROM wishes WHERE created_at >= ${DAY_START_UTC}) < ${DAILY_TOTAL}
      ON CONFLICT(id) DO NOTHING RETURNING id`).bind(body.id, body.nickname, body.gift).first();
    if (inserted) {
      if (key) {
        await env.DB.prepare(`INSERT INTO submit_counts (day,source,n) VALUES (?1,?2,1)
          ON CONFLICT(day,source) DO UPDATE SET n = n + 1`).bind(day, key).first();
        // 顺手清掉前一天以前的计数，表始终很小
        await env.DB.prepare('DELETE FROM submit_counts WHERE day < ?1').bind(day).first();
      }
      return json({ ok: true, id: inserted.id }, 201, cors);
    }
    return (await sameReceipt()) ?? json({ error: 'daily_capacity' }, 429, cors);
  } catch { return json({ error: 'storage_unavailable' }, 503, cors); }
}
