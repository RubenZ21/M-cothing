// Sharing an outfit as a picture (WhatsApp, Messages, email … via the phone's share menu).
import { SEASONS } from './constants.js';
import { makeCanvas, canvasToBlob } from './images.js';
import { drawOutfit } from './builder.js';

const W = 1080;
const BOARD_H = 1440;  // 3:4, same as the outfit board
const FOOTER = 190;

/** Outfit picture on a light background (WhatsApp shows see-through parts as black). */
export async function outfitImage(outfit, itemMap) {
  const c = makeCanvas(W, BOARD_H + FOOTER);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FDFCFA';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(40, 30); // small margin around the board
  await drawOutfit(ctx, outfit.pieces, itemMap, W - 80, (W - 80) * BOARD_H / W);
  ctx.restore();

  try { await document.fonts?.load('500 72px "Cormorant Garamond"'); } catch { /* fall back to Georgia */ }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2E2A2C';
  ctx.font = '500 72px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(outfit.name || 'My outfit', W / 2, BOARD_H + 70, W - 120);
  const seasons = SEASONS.filter((s) => outfit.seasons?.includes(s.id)).map((s) => s.label).join(' · ');
  if (seasons) {
    ctx.fillStyle = '#766C70';
    ctx.font = '500 34px Karla, system-ui, sans-serif';
    ctx.fillText(seasons, W / 2, BOARD_H + 130, W - 120);
  }
  return canvasToBlob(c, 'image/jpeg', 0.92);
}

// A picture made but not shared yet: the phone only allows the share menu right
// after a tap, so if drawing took too long the next tap shares this one.
let ready = null;

/**
 * Opens the share menu with the outfit picture. Returns 'shared', 'cancelled',
 * 'downloaded' (no share menu, e.g. on a computer) or 'again' (tap once more).
 */
export async function shareOutfit(outfit, itemMap) {
  const key = JSON.stringify([outfit.name, outfit.seasons, outfit.pieces]);
  let file = ready?.key === key ? ready.file : null;
  if (!file) {
    const blob = await outfitImage(outfit, itemMap);
    const plain = (outfit.name || 'outfit').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd');
    const slug = plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outfit';
    file = new File([blob], `${slug}.jpg`, { type: 'image/jpeg' });
  }
  ready = null;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: outfit.name, text: outfit.name });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      if (err.name === 'NotAllowedError') { ready = { key, file }; return 'again'; }
      console.warn('Share failed', err);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'downloaded';
}
