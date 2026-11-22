import { submitWish, newReceiptId } from './storage.js';
import { setupStockings } from './stockings.js';

const $ = (id) => document.getElementById(id);
const form = $('wish-form');
const dialog = $('wish-dialog');
const stocking = $('open-stocking');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

let pending = false;
let receiptId = null;
let lastPayload = null;
let toastTimer;

/* ───────── <dialog> 兼容：旧版 iOS / 微信没有 showModal ───────── */
const nativeDialog = typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype;
function openModal(el) {
  if (nativeDialog) { if (!el.open) el.showModal(); return; }
  el.classList.add('fallback');
  el.setAttribute('open', '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const backdrop = document.createElement('div');
  backdrop.className = 'fallback-backdrop';
  backdrop.dataset.for = el.id;
  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
}
function closeModal(el) {
  if (nativeDialog) { if (el.open) el.close(); return; }
  el.removeAttribute('open');
  document.querySelector(`.fallback-backdrop[data-for="${el.id}"]`)?.remove();
  if (!document.querySelector('dialog[open]')) document.body.style.overflow = '';
  el.dispatchEvent(new Event('close'));
}
if (!nativeDialog) {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = [...document.querySelectorAll('dialog[open]')].pop();
    if (top && top.dispatchEvent(new Event('cancel', { cancelable: true }))) closeModal(top);
  });
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/* ───────── 许愿弹窗 ───────── */
function resetLetter() {
  form.reset();
  receiptId = null; lastPayload = null;
  $('char-count').textContent = '0 / 500';
  $('form-error').hidden = true;
  $('success-panel').hidden = true;
  $('form-panel').hidden = false;
}
function openWish() {
  if (!boxes.ready()) return;
  stocking.classList.remove('opening');
  void stocking.offsetWidth;
  stocking.classList.add('opening');
  setTimeout(() => stocking.classList.remove('opening'), 550);
  if (!$('success-panel').hidden) resetLetter();
  openModal(dialog);
  // 手机上自动聚焦会立刻弹出键盘挡住信纸，只在有鼠标的设备上聚焦
  if (finePointer.matches) $('nickname').focus({ preventScroll: true });
}
stocking.addEventListener('click', openWish);
$('open-wish').addEventListener('click', openWish);
$('close-wish').addEventListener('click', () => { if (!pending) closeModal(dialog); });
dialog.addEventListener('cancel', (event) => { if (pending) event.preventDefault(); });

// 点遮罩关闭；已经写了字就不关，免得误触丢掉心愿
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog || pending) return;
  const r = dialog.getBoundingClientRect();
  const outside = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  if (!outside) return;
  const drafted = $('form-panel').hidden === false && ($('gift').value.trim() || $('nickname').value.trim());
  if (drafted) { toast('信还没寄出，点右上角 × 才会关闭'); return; }
  closeModal(dialog);
});

$('gift').addEventListener('input', () => {
  $('char-count').textContent = `${$('gift').value.length} / 500`;
  $('gift').setCustomValidity('');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || !boxes.ready()) return;
  const nickname = $('nickname').value.trim();
  const gift = $('gift').value.trim();
  if (!gift) { $('gift').setCustomValidity('写下一点心愿，再寄出吧。'); $('gift').reportValidity(); return; }
  if (!$('consent').checked) { $('consent').setCustomValidity('勾选同意后才能寄出。'); $('consent').reportValidity(); $('consent').addEventListener('change', () => $('consent').setCustomValidity(''), { once: true }); return; }

  const payloadKey = JSON.stringify({ nickname, gift });
  if (payloadKey !== lastPayload) { receiptId = newReceiptId(); lastPayload = payloadKey; }

  pending = true;
  $('form-error').hidden = true;
  $('close-wish').disabled = true;
  $('submit-label').textContent = '正在寄往北极…';
  // 冻结信纸，迟到的回执不会对应到被改过的内容
  for (const el of form.elements) el.disabled = true;
  try {
    const result = await submitWish(window.WISH_CONFIG, { id: receiptId, nickname, gift, stockingId: boxes.target(), consent: true, website: $('website').value });
    $('receipt').textContent = result.id;
    $('form-panel').hidden = true;
    $('success-panel').hidden = false;
    $('success-title').focus();
  } catch (error) {
    $('form-error').textContent = error.message;
    $('form-error').hidden = false;
  } finally {
    pending = false;
    for (const el of form.elements) el.disabled = false;
    $('close-wish').disabled = false;
    $('submit-label').textContent = lastPayload && $('form-error').hidden === false ? '再寄一次' : '把愿望放进袜子';
  }
});

$('copy-receipt').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('receipt').textContent); toast('回执已复制'); }
  catch { toast('请长按回执编号复制，或直接截图'); }
});

/* ───────── 寄信：信封从按钮飞进袜口 ───────── */
const LETTER_SVG = '<svg viewBox="0 0 64 46"><rect x="1" y="1" width="62" height="44" rx="3" fill="#fffaf0" stroke="#c9a25e" stroke-width="1.5"/><path d="m2 3 30 22L62 3" fill="none" stroke="#c9a25e" stroke-width="1.5"/><circle cx="32" cy="27" r="6" fill="#a8343c"/><path d="m29.5 27 2 2 3.5-4" fill="none" stroke="#fff6e6" stroke-width="1.4" stroke-linecap="round"/></svg>';

function deliverToStocking(fromRect) {
  const cuff = stocking.querySelector('.sock-cuff').getBoundingClientRect();
  const to = { x: cuff.left + cuff.width / 2 - 32, y: cuff.top + cuff.height * 0.25 - 23 };
  const from = { x: fromRect.left + fromRect.width / 2 - 32, y: fromRect.top + fromRect.height / 2 - 23 };
  const letter = document.createElement('div');
  letter.className = 'flying-letter';
  letter.innerHTML = LETTER_SVG;
  document.body.append(letter);
  const lift = Math.min(from.y, to.y) - 140;
  const mid = { x: (from.x + to.x) / 2 + 40, y: lift };
  const anim = letter.animate([
    { transform: `translate(${from.x}px, ${from.y}px) rotate(-8deg) scale(1)`, opacity: 0 },
    { transform: `translate(${from.x}px, ${from.y - 10}px) rotate(-8deg) scale(1)`, opacity: 1, offset: .1 },
    { transform: `translate(${mid.x}px, ${mid.y}px) rotate(12deg) scale(.9)`, offset: .55 },
    { transform: `translate(${to.x}px, ${to.y - 30}px) rotate(78deg) scale(.7)`, offset: .85 },
    { transform: `translate(${to.x}px, ${to.y + 10}px) rotate(90deg) scale(.55)`, opacity: 0 }
  ], { duration: 1150, easing: 'cubic-bezier(.45,.05,.4,1)' });
  anim.onfinish = () => {
    letter.remove();
    stocking.classList.remove('receiving');
    void stocking.offsetWidth;
    stocking.classList.add('receiving');
    setTimeout(() => stocking.classList.remove('receiving'), 1200);
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('div');
      s.className = 'burst';
      s.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%"><use href="#i-spark"/></svg>';
      document.body.append(s);
      const angle = -Math.PI / 2 + (i - 3) * 0.42;
      const dist = 46 + Math.random() * 26;
      const x0 = cuff.left + cuff.width / 2 - 7, y0 = cuff.top + 4;
      s.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(.3)`, opacity: 1 },
        { transform: `translate(${x0 + Math.cos(angle) * dist}px, ${y0 + Math.sin(angle) * dist}px) scale(1) rotate(90deg)`, opacity: 0 }
      ], { duration: 800 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => s.remove();
    }
  };
}

$('done').addEventListener('click', () => {
  const from = $('done').getBoundingClientRect();
  closeModal(dialog);
  if (reduceMotion.matches || typeof Element.prototype.animate !== 'function') { toast('心愿已放进袜子'); return; }
  stocking.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => deliverToStocking(from), 260);
});

/* ───────── 隐私 & 分享 ───────── */
for (const id of ['privacy-open', 'form-privacy']) $(id).addEventListener('click', () => openModal($('privacy-dialog')));
$('privacy-close').addEventListener('click', () => closeModal($('privacy-dialog')));

const boxes = setupStockings({ $, newReceiptId, openModal, closeModal, resetLetter });
const shareUrl = () => boxes.invite();
$('share').addEventListener('click', async () => {
  if (boxes.enabled && !boxes.isOwner()) { boxes.openCreate(); return; }
  if (isWeChat) { $('wechat-hint').hidden = false; return; }
  if (navigator.share) {
    try { await navigator.share({ title: '圣诞心愿邮局', text: '点击圣诞袜，把你的礼物愿望装进来。', url: shareUrl() }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  $('share-url').value = shareUrl();
  $('copy-share').querySelector('span').textContent = '复制链接';
  openModal($('share-dialog'));
  $('share-url').select();
});
$('wechat-close').addEventListener('click', () => { $('wechat-hint').hidden = true; });
$('wechat-hint').addEventListener('click', (e) => { if (e.target === $('wechat-hint')) $('wechat-hint').hidden = true; });
$('share-close').addEventListener('click', () => closeModal($('share-dialog')));
$('copy-share').addEventListener('click', async () => {
  const label = $('copy-share').querySelector('span');
  try { await navigator.clipboard.writeText(shareUrl()); label.textContent = '已复制，快发给朋友吧'; }
  catch { $('share-url').select(); label.textContent = '请长按或按 Ctrl+C 复制'; }
});

/* ───────── 雪：远/中/近三层 ───────── */
let snowOn = !reduceMotion.matches;
const layers = [
  { cls: 'far', n: 16, size: [2, 3.5], dur: [22, 32] },
  { cls: 'mid', n: 12, size: [4, 6], dur: [14, 22] },
  { cls: 'near', n: 5, size: [7, 10], dur: [9, 14] }
];
const rand = (a, b) => a + Math.random() * (b - a);
for (const layer of layers) {
  for (let i = 0; i < layer.n; i++) {
    const flake = document.createElement('i');
    const size = rand(...layer.size);
    flake.className = layer.cls;
    Object.assign(flake.style, {
      left: `${rand(-5, 100)}%`, width: `${size}px`, height: `${size}px`,
      animationDuration: `${rand(...layer.dur)}s`, animationDelay: `${-rand(0, 30)}s`
    });
    flake.style.setProperty('--drift', `${rand(-30, 70).toFixed(0)}px`);
    $('snow').append(flake);
  }
}
function setSnow() {
  $('snow').classList.toggle('paused', !snowOn);
  $('snow-toggle').setAttribute('aria-pressed', String(snowOn));
  $('snow-label').textContent = snowOn ? '雪花已开启' : '雪花已关闭';
  $('snow-toggle').setAttribute('aria-label', snowOn ? '关闭雪花' : '开启雪花');
}
$('snow-toggle').addEventListener('click', () => {
  if (reduceMotion.matches) { toast('已根据你的系统设置减少动效'); return; }
  snowOn = !snowOn; setSnow();
});
reduceMotion.addEventListener?.('change', () => { snowOn = !reduceMotion.matches; setSnow(); });
setSnow();
