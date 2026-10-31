export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// One object URL per (key, blob); replaced when the blob changes.
const urls = new Map();
export function blobUrl(key, blob) {
  if (!blob) return '';
  let u = urls.get(key);
  if (!u || u.blob !== blob) {
    if (u) URL.revokeObjectURL(u.url);
    u = { blob, url: URL.createObjectURL(blob) };
    urls.set(key, u);
  }
  return u.url;
}
export function dropUrl(key) {
  const u = urls.get(key);
  if (u) { URL.revokeObjectURL(u.url); urls.delete(key); }
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
