/** 随机 v4 UUID。crypto.randomUUID 只在 https / localhost 可用，局域网 http 调试时回退到 getRandomValues。 */
export function newReceiptId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') {
    try { return cryptoImpl.randomUUID(); } catch { /* 非安全上下文 */ }
  }
  const b = cryptoImpl.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

class NetworkError extends Error {}

export async function submitWish(config, payload, fetcher = fetch) {
  let endpoint; let headers = { 'Content-Type': 'application/json' }; let body;
  if (config?.storage === 'api' && config.apiBase) {
    const path = payload.stockingId == null ? '/api/wishes' : '/api/stockings/wish';
    endpoint = new URL(path, config.apiBase).href;
    body = payload;
  } else if (config?.storage === 'supabase' && config.supabaseUrl && config.supabasePublishableKey) {
    if (payload.stockingId != null) throw new Error('此收集方式只支持原邮局，请检查邀请链接。');
    if (config.supabasePublishableKey.startsWith('sb_secret_')) throw new Error('网站配置有误，请联系分享链接的人。');
    endpoint = new URL('/rest/v1/rpc/submit_christmas_wish', config.supabaseUrl).href;
    headers.apikey = config.supabasePublishableKey;
    body = { p_id: payload.id, p_nickname: payload.nickname, p_gift: payload.gift, p_consent: payload.consent, p_website: payload.website };
  } else throw new Error('邮局还没有接通存储，请联系分享链接的人。你的愿望尚未提交。');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const offline = '网络暂时没有送回回执。请保留此窗口，稍后重试；相同内容不会重复保存。';
  try {
    let response;
    // 只有 fetch 本身抛出的异常才算“网络问题”，代码错误不会被误报成断网
    try {
      response = await fetcher(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, credentials: 'omit' });
    } catch { throw new NetworkError(offline); }
    if (!response.ok) {
      if (response.status === 429) throw new Error('今天的邮袋暂时满了，请明天再试。');
      if (response.status === 400) throw new Error('心愿内容未通过检查，请确认填写后再试。');
      if (response.status === 409) throw new Error('这封信的内容发生了变化，请重新打开页面后提交。');
      throw new Error('暂时无法确认保存成功，请稍后重试或联系分享链接的人。');
    }
    let data;
    // 被运营商/代理劫持成 HTML 时，不把英文 SyntaxError 抛给用户
    try { data = await response.json(); } catch { data = null; }
    if (data?.ok !== true || data.id !== payload.id) throw new Error('邮局未返回有效回执，暂时无法确认保存，请稍后重试。');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(offline);
    throw error;
  } finally { clearTimeout(timer); }
}
