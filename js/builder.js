// Outfit builder: a 3:4 board where pieces are moved (drag), resized and
// rotated (pinch, or the corner handle), layered and mirrored.
import { CATEGORIES, SEASONS, PLACEMENT, currentSeason } from './constants.js';
import { esc, uid, blobUrl } from './util.js';
import { icon } from './icons.js';
import { makeCanvas, blobToImage, encodeTransparent } from './images.js';

const ASPECT = 4 / 3; // board height / width

export function renderBuilder(root, { outfit, items, startItemId, onSave, onDelete, onDuplicate, onClose }) {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  let pieces = (outfit?.pieces || []).filter((p) => itemMap.has(p.itemId)).map((p) => ({ ...p, key: uid() }));
  let selKey = null;
  let dirty = false;
  const cats = CATEGORIES.filter((c) => items.some((i) => i.category === c.id));
  let tab = cats[0]?.id;

  root.className = 'app no-tabbar builder-host';
  root.innerHTML = `
    <div class="builder">
      <div class="topbar">
        <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
        <h1>${outfit ? esc(outfit.name) : 'New outfit'}</h1>
        <button type="button" class="btn-small right" data-act="save">Save</button>
      </div>
      <div class="board-wrap" id="bw">
        <div class="board" id="board" aria-label="Outfit board">
          <p class="board-hint" id="hint">Tap clothes below to put them here</p>
          <div class="frame" id="frame" hidden><span class="handle" id="handle" aria-hidden="true"></span></div>
        </div>
        <div class="sel-tools" id="tools" role="toolbar" aria-label="Selected piece" hidden>
          <button type="button" data-act="front">${icon('front')} Front</button>
          <button type="button" data-act="backward">${icon('backLayer')} Back</button>
          <button type="button" data-act="mirror">${icon('mirror')} Mirror</button>
          <button type="button" data-act="remove">${icon('trash')} Remove</button>
        </div>
      </div>
      <div class="drawer">
        ${cats.length ? `<div class="chips scroll-x" role="tablist" aria-label="Category" id="tabs"></div>
        <div class="drawer-grid" id="dgrid"></div>` : `<p class="empty-drawer">Add some clothes first, then come back to build outfits.</p>`}
      </div>
    </div>`;

  const board = root.querySelector('#board');
  const wrap = root.querySelector('#bw');
  const frame = root.querySelector('#frame');
  const tools = root.querySelector('#tools');
  const hint = root.querySelector('#hint');
  const els = new Map(); // key -> <img>
  const alpha = new Map(); // itemId -> { w, h, data } for tapping through transparent parts

  // ---- sizing ----
  let W = 300, H = 400;
  function size() {
    const r = wrap.getBoundingClientRect();
    const availW = r.width - 24, availH = r.height - 16;
    W = Math.max(120, Math.min(availW, availH / ASPECT));
    H = W * ASPECT;
    board.style.width = `${W}px`;
    board.style.height = `${H}px`;
    layout();
  }
  const ro = new ResizeObserver(size);
  ro.observe(wrap);

  // ---- rendering ----
  function pieceBox(p) {
    const it = itemMap.get(p.itemId);
    const w = p.w * W;
    return { w, h: w * (it.h / it.w), cx: p.x * W, cy: p.y * H };
  }

  function ensureEls() {
    for (const p of pieces) {
      if (els.has(p.key)) continue;
      const it = itemMap.get(p.itemId);
      const img = document.createElement('img');
      img.className = 'piece';
      img.alt = it.name;
      img.draggable = false;
      img.src = blobUrl(`i:${it.id}`, it.image);
      board.insertBefore(img, frame);
      els.set(p.key, img);
      loadAlpha(it);
    }
    for (const [key, el] of els) {
      if (!pieces.some((p) => p.key === key)) { el.remove(); els.delete(key); }
    }
  }

  function layout() {
    ensureEls();
    pieces.forEach((p, i) => {
      const el = els.get(p.key);
      const b = pieceBox(p);
      Object.assign(el.style, {
        width: `${b.w}px`, height: `${b.h}px`, left: `${b.cx - b.w / 2}px`, top: `${b.cy - b.h / 2}px`,
        transform: `rotate(${p.rot || 0}rad) scaleX(${p.flip ? -1 : 1})`, zIndex: String(i + 1)
      });
    });
    const sel = pieces.find((p) => p.key === selKey);
    frame.hidden = !sel;
    tools.hidden = !sel;
    if (sel) {
      const b = pieceBox(sel);
      Object.assign(frame.style, {
        width: `${b.w}px`, height: `${b.h}px`, left: `${b.cx - b.w / 2}px`, top: `${b.cy - b.h / 2}px`,
        transform: `rotate(${sel.rot || 0}rad)`
      });
    }
    hint.hidden = pieces.length > 0;
  }

  function renderDrawer() {
    if (!cats.length) return;
    root.querySelector('#tabs').innerHTML = cats.map((c) =>
      `<button type="button" class="chip" role="tab" data-act="tab" data-id="${c.id}" aria-selected="${c.id === tab}">${c.label}</button>`).join('');
    const used = new Set(pieces.map((p) => p.itemId));
    root.querySelector('#dgrid').innerHTML = items.filter((i) => i.category === tab).map((i) =>
      `<button type="button" class="dtile${used.has(i.id) ? ' used' : ''}" data-act="add" data-id="${i.id}" aria-label="${esc(i.name)}${used.has(i.id) ? ' (in outfit)' : ''}">
        <img src="${blobUrl(`t:${i.id}`, i.thumb)}" alt="">
        ${used.has(i.id) ? `<span class="tick">${icon('check')}</span>` : ''}
      </button>`).join('');
  }

  async function loadAlpha(it) {
    if (alpha.has(it.id)) return;
    alpha.set(it.id, null);
    try {
      const img = await blobToImage(it.thumb);
      const c = makeCanvas(Math.min(96, img.naturalWidth), Math.min(96, img.naturalWidth) * img.naturalHeight / img.naturalWidth);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      alpha.set(it.id, { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data });
    } catch { /* fall back to box hit-testing */ }
  }

  // Board-local point -> piece-local (0..1) coordinates, or null when outside.
  function local(p, x, y) {
    const b = pieceBox(p);
    let dx = x - b.cx, dy = y - b.cy;
    const r = -(p.rot || 0);
    const lx = dx * Math.cos(r) - dy * Math.sin(r);
    const ly = dx * Math.sin(r) + dy * Math.cos(r);
    let u = lx / b.w + 0.5;
    const v = ly / b.h + 0.5;
    if (p.flip) u = 1 - u;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
  }

  function hitTest(x, y) {
    const sel = pieces.find((p) => p.key === selKey);
    if (sel && local(sel, x, y)) return sel;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      const l = local(p, x, y);
      if (!l) continue;
      const a = alpha.get(p.itemId);
      if (!a) return p;
      const px = Math.min(a.w - 1, Math.floor(l.u * a.w));
      const py = Math.min(a.h - 1, Math.floor(l.v * a.h));
      if (a.data[(py * a.w + px) * 4 + 3] > 24) return p;
    }
    return null;
  }

  function select(key) {
    selKey = key;
    layout();
  }

  function addPiece(itemId) {
    const existing = pieces.find((p) => p.itemId === itemId);
    if (existing) { select(existing.key); return; }
    const it = itemMap.get(itemId);
    const d = PLACEMENT[it.category] || { x: 0.5, y: 0.5, w: 0.4 };
    let w = d.w;
    const hFrac = (w * W * it.h / it.w) / H; // keep tall pieces from filling the board
    if (hFrac > 0.6) w *= 0.6 / hFrac;
    const same = pieces.filter((p) => itemMap.get(p.itemId).category === it.category).length;
    const p = { key: uid(), itemId, x: Math.min(0.9, d.x + same * 0.06), y: Math.min(0.92, d.y + same * 0.04), w, rot: 0, flip: false };
    pieces.push(p);
    dirty = true;
    select(p.key);
    renderDrawer();
  }

  // ---- gestures ----
  const pts = new Map();
  let g = null;
  const boardPoint = (e) => {
    const r = board.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function startPinch(p) {
    const [a, b] = [...pts.values()];
    g = { type: 'pinch', p, d0: dist(a, b) || 1, a0: angle(a, b), w0: p.w, r0: p.rot || 0,
      m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, x0: p.x, y0: p.y };
  }

  board.addEventListener('pointerdown', (e) => {
    const pt = boardPoint(e);
    board.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, pt);
    const sel = pieces.find((p) => p.key === selKey);
    if (pts.size === 2 && sel) { startPinch(sel); return; }
    if (pts.size > 1) return;
    if (e.target.closest('#handle') && sel) {
      const b = pieceBox(sel);
      g = { type: 'resize', p: sel, d0: Math.hypot(pt.x - b.cx, pt.y - b.cy) || 1, w0: sel.w };
      return;
    }
    const hit = hitTest(pt.x, pt.y);
    if (hit) {
      select(hit.key);
      g = { type: 'move', p: hit, s: pt, x0: hit.x, y0: hit.y };
    } else {
      select(null);
      g = null;
    }
  });

  board.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const pt = boardPoint(e);
    pts.set(e.pointerId, pt);
    if (!g) return;
    const p = g.p;
    if (g.type === 'move') {
      p.x = clamp(g.x0 + (pt.x - g.s.x) / W, 0, 1);
      p.y = clamp(g.y0 + (pt.y - g.s.y) / H, 0, 1);
    } else if (g.type === 'resize') {
      const b = pieceBox(p);
      p.w = clamp(g.w0 * Math.hypot(pt.x - b.cx, pt.y - b.cy) / g.d0, 0.06, 1.6);
    } else if (g.type === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      p.w = clamp(g.w0 * dist(a, b) / g.d0, 0.06, 1.6);
      p.rot = g.r0 + angle(a, b) - g.a0;
      p.x = clamp(g.x0 + ((a.x + b.x) / 2 - g.m0.x) / W, 0, 1);
      p.y = clamp(g.y0 + ((a.y + b.y) / 2 - g.m0.y) / H, 0, 1);
    }
    dirty = true;
    layout();
  });

  const up = (e) => {
    pts.delete(e.pointerId);
    if (g?.type === 'pinch' && pts.size === 1) {
      const [pt] = [...pts.values()];
      g = { type: 'move', p: g.p, s: pt, x0: g.p.x, y0: g.p.y };
    } else if (pts.size === 0) {
      g = null;
    }
  };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);

  // Snap small rotations back to straight so pieces don't end up slightly tilted.
  board.addEventListener('pointerup', () => {
    const p = pieces.find((q) => q.key === selKey);
    if (p && Math.abs(p.rot || 0) < 0.06) { p.rot = 0; layout(); }
  });

  // ---- actions ----
  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const i = pieces.findIndex((p) => p.key === selKey);
    if (act === 'back') {
      if (dirty && !confirm('Leave without saving this outfit?')) return;
      onClose();
    } else if (act === 'save') openSaveSheet();
    else if (act === 'tab') { tab = b.dataset.id; renderDrawer(); }
    else if (act === 'add') addPiece(b.dataset.id);
    else if (i >= 0 && act === 'front') { pieces.push(...pieces.splice(i, 1)); dirty = true; layout(); }
    else if (i >= 0 && act === 'backward') { pieces.unshift(...pieces.splice(i, 1)); dirty = true; layout(); }
    else if (i >= 0 && act === 'mirror') { pieces[i].flip = !pieces[i].flip; dirty = true; layout(); }
    else if (i >= 0 && act === 'remove') { pieces.splice(i, 1); selKey = null; dirty = true; layout(); renderDrawer(); }
  };

  function openSaveSheet() {
    if (!pieces.length) { alert('Add at least one piece to the outfit first.'); return; }
    const chosen = new Set(outfit?.seasons || [currentSeason()]);
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `
      <form method="dialog" class="sheet-body">
        <h2>${outfit ? 'Save outfit' : 'Save new outfit'}</h2>
        <div>
          <label class="field-label" for="o-name">Name</label>
          <input id="o-name" class="text-input" type="text" maxlength="60" autocomplete="off" value="${esc(outfit?.name || '')}" placeholder="e.g. Sunday market">
        </div>
        <div>
          <div class="field-label"><span id="o-seasons">Seasons</span><small>It shows under each one</small></div>
          <div class="seasons" role="group" aria-labelledby="o-seasons">
            ${SEASONS.map((s) => `<button type="button" class="chip" data-s="${s.id}" aria-pressed="${chosen.has(s.id)}">${s.label}</button>`).join('')}
          </div>
        </div>
        <button type="submit" class="btn-primary" value="save">Save outfit</button>
        ${outfit ? `<div class="sheet-row">
          <button type="button" class="btn-secondary" data-x="dup">${icon('copy')} Duplicate</button>
          <button type="button" class="btn-secondary danger" data-x="del">${icon('trash')} Delete</button>
        </div>` : ''}
        <button type="button" class="text-btn center" data-x="close">Keep editing</button>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const s = e.target.closest('[data-s]');
      if (s) { chosen.has(s.dataset.s) ? chosen.delete(s.dataset.s) : chosen.add(s.dataset.s); s.setAttribute('aria-pressed', String(chosen.has(s.dataset.s))); }
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'close') dlg.close();
      if (x === 'del' && confirm('Delete this outfit? The clothes stay in your closet.')) { dlg.close(); onDelete(outfit); }
      if (x === 'dup') { dlg.close(); await finish(true); }
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'save') finish(false);
      dlg.remove();
    });
    async function finish(asCopy) {
      let name = dlg.querySelector('#o-name').value.trim() || outfit?.name || 'My outfit';
      if (asCopy && name === outfit.name) name += ' (copy)';
      const clean = pieces.map(({ key, ...p }) => p);
      const thumb = await renderOutfitThumb({ pieces: clean }, itemMap);
      const now = Date.now();
      const o = {
        id: outfit && !asCopy ? outfit.id : uid(),
        name,
        seasons: SEASONS.map((s) => s.id).filter((s) => chosen.has(s)),
        pieces: clean,
        thumb,
        created: outfit && !asCopy ? outfit.created : now,
        updated: now
      };
      dirty = false;
      asCopy ? onDuplicate(o) : onSave(o);
    }
    dlg.showModal();
  }

  // ---- start ----
  renderDrawer();
  size();
  if (startItemId && itemMap.has(startItemId)) {
    tab = itemMap.get(startItemId).category;
    renderDrawer();
    requestAnimationFrame(() => addPiece(startItemId));
  }

  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    ro.disconnect();
    window.removeEventListener('beforeunload', beforeUnload);
    root.onclick = null;
  };
}

/** Draws the outfit (transparent background, 3:4) for the outfit cards. */
export async function renderOutfitThumb(outfit, itemMap, width = 600) {
  const W = width, H = width * ASPECT;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  for (const p of outfit.pieces) {
    const it = itemMap.get(p.itemId);
    if (!it) continue;
    const img = await blobToImage(it.image);
    const w = p.w * W, h = w * (it.h / it.w);
    ctx.save();
    ctx.translate(p.x * W, p.y * H);
    ctx.rotate(p.rot || 0);
    if (p.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  return encodeTransparent(c);
}
