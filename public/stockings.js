const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keyPattern = /^[a-f0-9]{64}$/;

export function inviteAddress(address, id) {
  const url = new URL('./', address);
  if (id !== null) url.searchParams.set('sock', id);
  return url.href;
}

function parseCode(code) {
  const parts = code.trim().split('.');
  if (parts.length !== 2 || !idPattern.test(parts[0]) || !keyPattern.test(parts[1])) {
    throw new Error('请粘贴完整的查看口令。');
  }
  return { id: parts[0], key: parts[1] };
}

async function api(action, payload) {
  const endpoint = new URL('/api/stockings/' + action, window.WISH_CONFIG.apiBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(endpoint, { method: 'POST', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal });
    if (res.status === 403) throw new Error('查看口令不正确，请重新复制。');
    if (res.status === 404) throw new Error('找不到这只圣诞袜，请向朋友确认邀请链接。');
    if (res.status === 429) throw new Error('今天新建的圣诞袜已满，请明天再试。');
    if (!res.ok) throw new Error('邮局暂时无法连接，请稍后重试。');
    const data = await res.json();
    if (data?.id !== payload.id || typeof data.name !== 'string') throw new Error('未收到有效回执，请重试。');
    return data;
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof TypeError || err instanceof SyntaxError) throw new Error('暂时未收到邮局回复，请稍后再试。');
    throw err;
  } finally { clearTimeout(timer); }
}

export function setupStockings({ $, newReceiptId, openModal, closeModal, resetLetter }) {
  const enabled = window.WISH_CONFIG?.storage === 'api';
  let target = new URL(location.href).searchParams.get('sock');
  let ready = false;
  let owner = null;
  let draftKey = null;
  let next = null;
  let loading = false;
  const baseName = '圣诞心愿邮局的发起人';

  function recipient(name, error = '') {
    ready = Boolean(name);
    $('recipient').textContent = error || (target ? '这封愿望会寄给「' + name + '」。' : '这封愿望会寄给' + name + '。');
    $('letter-recipient').textContent = name ? '收件人 · ' + name : '';
    $('open-stocking').disabled = !ready;
    $('open-wish').disabled = !ready;
  }
  function showOwner(credentials, name) {
    owner = credentials;
    target = owner.id;
    history.replaceState(null, '', inviteAddress(location.href, target));
    resetLetter();
    recipient(name);
    $('share-label').textContent = '分享我的圣诞袜';
    $('after-create').hidden = true;
  }
  async function initialize() {
    $('open-inbox').hidden = !enabled;
    $('after-create').hidden = !enabled;
    if (!enabled) $('share-label').textContent = '分享';
    if (target === null) { recipient(baseName); return; }
    if (!enabled || !idPattern.test(target)) { recipient('', '这条圣诞袜邀请链接无效，请向朋友重新获取。'); return; }
    const requested = target;
    recipient('', '正在确认这只圣诞袜的收件人…');
    try {
      const info = await api('info', { id: requested });
      if (target === requested) recipient(info.name);
    } catch (err) { if (target === requested) recipient('', err.message + ' 可刷新页面重试。'); }
  }
  function openCreate() {
    $('create-status').textContent = '';
    openModal($('create-dialog'));
  }
  $('after-create').addEventListener('click', () => { closeModal($('wish-dialog')); openCreate(); });
  $('create-close').addEventListener('click', () => closeModal($('create-dialog')));
  $('create-dialog').addEventListener('cancel', event => { if ($('create-close').disabled) event.preventDefault(); });
  $('create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = $('create-form').querySelector('button');
    if (submit.disabled) return;
    const name = $('collector-name').value.trim();
    if (!name) { $('create-status').textContent = '请写下朋友能认出的昵称。'; return; }
    submit.disabled = true;
    $('create-close').disabled = true;
    $('collector-name').disabled = true;
    $('create-status').textContent = '正在挂起你的圣诞袜…';
    try {
      if (!draftKey) {
        const random = crypto.getRandomValues(new Uint8Array(32));
        draftKey = { id: newReceiptId(), key: Array.from(random, b => b.toString(16).padStart(2, '0')).join('') };
      }
      const result = await api('create', { ...draftKey, name });
      showOwner(draftKey, result.name);
      $('owner-code').value = owner.id + '.' + owner.key;
      $('invite-url').value = inviteAddress(location.href, owner.id);
      $('create-form').hidden = true;
      $('created-panel').hidden = false;
      $('create-status').textContent = '';
    } catch (err) { $('create-status').textContent = err.message; }
    finally { submit.disabled = false; $('collector-name').disabled = false; $('create-close').disabled = false; }
  });
  async function copyField(field, status, message) {
    try { await navigator.clipboard.writeText(field.value); status.textContent = message; }
    catch { field.focus(); field.select(); status.textContent = '已选中文字，请长按复制，或按 Ctrl+C。'; }
  }
  $('copy-key').addEventListener('click', () => copyField($('owner-code'), $('create-status'), '查看口令已复制，请私下保存。'));
  $('copy-invite').addEventListener('click', () => copyField($('invite-url'), $('create-status'), '邀请链接已复制，可以发给朋友。'));
  const timeFormat = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  function appendWish(item) {
    const row = document.createElement('li');
    const from = document.createElement('strong');
    const time = document.createElement('small');
    const gift = document.createElement('p');
    from.textContent = item.nickname || '匿名朋友';
    time.textContent = timeFormat.format(new Date(item.created_at.replace(' ', 'T') + 'Z')) + ' 北京时间';
    gift.textContent = item.gift;
    row.append(from, time, gift);
    $('inbox-items').append(row);
  }
  async function readInbox(credentials, more = false) {
    if (loading) return;
    loading = true;
    $('inbox-status').textContent = '正在收信…';
    $('more-wishes').disabled = true;
    try {
      const data = await api('inbox', { ...credentials, before: more ? next : undefined });
      if (!Array.isArray(data.items)) throw new Error('暂时无法显示愿望，请重试。');
      if (!more) {
        showOwner(credentials, data.name);
        $('inbox-items').replaceChildren();
      }
      $('inbox-title').textContent = data.name + '的收件箱';
      $('inbox-body').hidden = false;
      $('unlock-form').hidden = true;
      $('unlock-key').value = '';
      $('inbox-invitation').value = inviteAddress(location.href, credentials.id);
      $('inbox-recovery').value = credentials.id + '.' + credentials.key;
      next = data.next;
      data.items.forEach(appendWish);
      $('more-wishes').hidden = next === null;
      $('inbox-status').textContent = $('inbox-items').children.length ? '' : '还没有来信。把邀请链接发给朋友吧。';
    } catch (err) { $('inbox-status').textContent = err.message; }
    finally { loading = false; $('more-wishes').disabled = false; }
  }
  function openInbox() {
    $('inbox-status').textContent = '';
    openModal($('inbox-dialog'));
    if (owner) readInbox(owner);
  }
  $('open-inbox').addEventListener('click', openInbox);
  $('owner-done').addEventListener('click', () => { closeModal($('create-dialog')); openInbox(); });
  $('inbox-close').addEventListener('click', () => closeModal($('inbox-dialog')));
  $('unlock-form').addEventListener('submit', event => {
    event.preventDefault();
    try { readInbox(parseCode($('unlock-key').value)); }
    catch (err) { $('inbox-status').textContent = err.message; }
  });
  $('more-wishes').addEventListener('click', () => readInbox(owner, true));
  $('inbox-invite').addEventListener('click', () => copyField($('inbox-invitation'), $('inbox-status'), '邀请链接已复制。'));
  $('inbox-key').addEventListener('click', () => copyField($('inbox-recovery'), $('inbox-status'), '查看口令已复制，请私下保存。'));
  initialize();
  return { enabled, ready: () => ready, target: () => target,
    isOwner: () => Boolean(owner && target === owner.id), openCreate,
    invite: () => inviteAddress(location.href, target) };
}
