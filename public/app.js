import { submitWish } from './storage.js';
const $ = (id) => document.getElementById(id);
const form = $('wish-form');
const dialog = $('wish-dialog');
let pending = false;
let receiptId = null;
let lastPayload = null;
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function openWish() {
  $('open-stocking').classList.add('opening');
  setTimeout(() => $('open-stocking').classList.remove('opening'), 550);
  if (!$('success-panel').hidden) {
    form.reset(); receiptId = null; lastPayload = null;
    $('char-count').textContent = '0 / 500';
    $('success-panel').hidden = true; $('form-panel').hidden = false;
  }
  dialog.showModal();
  $('nickname').focus({ preventScroll: true });
}
$('open-stocking').addEventListener('click', openWish);
$('open-wish').addEventListener('click', openWish);
$('close-wish').addEventListener('click', () => { if (!pending) dialog.close(); });
dialog.addEventListener('cancel', (event) => { if (pending) event.preventDefault(); });
$('done').addEventListener('click', () => dialog.close());
$('gift').addEventListener('input', () => {
  $('char-count').textContent = `${$('gift').value.length} / 500`;
  $('gift').setCustomValidity('');
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending) return;
  const nickname = $('nickname').value.trim();
  const gift = $('gift').value.trim();
  if (!gift) { $('gift').setCustomValidity('写下一点心愿，再寄出吧。'); $('gift').reportValidity(); return; }
  const payloadKey = JSON.stringify({ nickname, gift });
  if (payloadKey !== lastPayload) { receiptId = crypto.randomUUID(); lastPayload = payloadKey; }
  pending = true;
  $('form-error').hidden = true;
  $('submit').disabled = true;
  $('close-wish').disabled = true;
  $('submit').textContent = '正在把心愿寄往北极…';
  // Freeze the submitted letter so a late reply cannot refer to edited fields.
  for (const el of form.elements) el.disabled = true;
  try {
    const result = await submitWish(window.WISH_CONFIG, { id: receiptId, nickname, gift, consent: true, website: $('website').value });
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
    $('submit').innerHTML = '把愿望放进袜子 <span aria-hidden="true">✧</span>';
  }
});
for (const id of ['privacy-open', 'form-privacy']) $(id).addEventListener('click', () => $('privacy-dialog').showModal());
$('privacy-close').addEventListener('click', () => $('privacy-dialog').close());
const shareUrl = () => new URL('./', location.href).href;
$('share').addEventListener('click', async () => {
  if (navigator.share) {
    try { await navigator.share({ title: '圣诞心愿邮局', text: '点击圣诞袜，把你的礼物愿望装进来。', url: shareUrl() }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  $('share-url').value = shareUrl();
  $('share-dialog').showModal();
  $('share-url').select();
});
$('share-close').addEventListener('click', () => $('share-dialog').close());
$('copy-share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl()); $('copy-share').textContent = '已复制，快发给朋友吧'; }
  catch { $('share-url').select(); $('copy-share').textContent = '请长按或按 Ctrl+C 复制链接'; }
});
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let snowOn = !reduceMotion.matches;
for (let i = 0; i < 25; i++) {
  const flake = document.createElement('i');
  const size = 2 + Math.random() * 4;
  Object.assign(flake.style, { left: `${Math.random() * 100}%`, width: `${size}px`, height: `${size}px`, animationDuration: `${12 + Math.random() * 17}s`, animationDelay: `${-Math.random() * 30}s` });
  $('snow').append(flake);
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
reduceMotion.addEventListener('change', () => { snowOn = !reduceMotion.matches; setSnow(); });
setSnow();
