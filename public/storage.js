export async function submitWish(config, payload, fetcher = fetch) {
  let endpoint; let headers = { 'Content-Type': 'application/json' }; let body;
  if (config?.storage === 'api' && config.apiBase) {
    endpoint = new URL('/api/wishes', config.apiBase).href;
    body = payload;
  } else if (config?.storage === 'supabase' && config.supabaseUrl && config.supabasePublishableKey) {
    if (config.supabasePublishableKey.startsWith('sb_secret_')) throw new Error('网站配置有误，请联系分享链接的人。');
    endpoint = new URL('/rest/v1/rpc/submit_christmas_wish', config.supabaseUrl).href;
    headers.apikey = config.supabasePublishableKey;
    body = { p_id: payload.id, p_nickname: payload.nickname, p_gift: payload.gift, p_consent: payload.consent, p_website: payload.website };
  } else throw new Error('邮局还没有接通存储，请联系分享链接的人。你的愿望尚未提交。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, credentials: 'omit' });
    if (!response.ok) {
      if (response.status === 429) throw new Error('今天的邮袋暂时满了，请明天再试。');
      if (response.status === 400) throw new Error('心愿内容未通过检查，请确认填写后再试。');
      if (response.status === 409) throw new Error('这封信的内容发生了变化，请重新打开页面后提交。');
      throw new Error('暂时无法确认保存成功，请稍后重试或联系分享链接的人。');
    }
    const data = await response.json();
    if (data?.ok !== true || data.id !== payload.id) throw new Error('邮局未返回有效回执，暂时无法确认保存，请稍后重试。');
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('网络暂时没有送回回执。请保留此窗口，稍后重试；相同内容不会重复保存。');
    throw error;
  } finally { clearTimeout(timer); }
}
