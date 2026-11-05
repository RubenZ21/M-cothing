// Palette tab: photos of her colour palette cards (e.g. from John Kitchener),
// each with a name. Tap a card to see it full screen, zoom in, rename or delete it.
//
// Stored as { id: 'main', photos: [{ id, name, image, thumb, w, h }] }. Older
// versions also saved colour groups, notes etc. in this record; those are kept
// untouched (and in the backup) but no longer shown.
import { esc, uid, blobUrl, toast, plural } from './util.js';
import { icon } from './icons.js';
import { fileToCanvas, fitCanvas, canvasToBlob } from './images.js';

export function emptyPalette() {
  return { id: 'main', photos: [], updated: 0 };
}

export function renderPalette(root, { palette, save, tabbar }) {
  root.className = 'app';
  palette.photos = palette.photos || [];

  const persist = async (msg) => {
    palette.updated = Date.now();
    await save(palette);
    if (msg) toast(msg);
  };

  // Cards from older versions were sorted into categories: use that as their name.
  let named = false;
  for (const p of palette.photos) {
    if (!p.name && p.groupId) {
      const g = (palette.groups || []).find((x) => x.id === p.groupId);
      if (g) { p.name = g.name; named = true; }
    }
  }
  if (named) persist();

  const cardName = (p) => p.name || 'Palette card';

  function render() {
    const y = window.scrollY;
    root.innerHTML = `
      <header class="page-head">
        <h1>Palette</h1>
        <div class="head-actions"><span>${plural(palette.photos.length, 'card')}</span></div>
      </header>
      <div class="palette">
        <label class="btn-primary" id="add-card">${icon('camera')} Add palette card<input type="file" id="p-photos" accept="image/*" multiple class="visually-hidden"></label>
        ${palette.photos.length ? `<div class="pal-cards">
          ${palette.photos.map((p) => `<button type="button" class="pal-card" data-act="open" data-id="${p.id}">
              <span class="pal-card-img"><img src="${blobUrl(`p:${p.id}`, p.thumb)}" alt=""></span>
              <span class="pal-card-name">${esc(cardName(p))}</span>
            </button>`).join('')}
        </div>` : `<div class="empty">
          <h2>No palette cards yet</h2>
          <p>Take a photo of each of your colour palette cards, straight from above and in daylight, and give it a name.</p>
        </div>`}
      </div>
      ${tabbar}`;
    window.scrollTo(0, y);
    root.querySelector('#p-photos').addEventListener('change', (e) => addCards([...e.target.files]));
  }

  async function addCards(files) {
    if (!files.length) return;
    for (const f of files) {
      let card;
      try {
        const c = await fileToCanvas(f, 2400);
        card = {
          id: uid(),
          name: '',
          image: await canvasToBlob(c, 'image/jpeg', 0.92),
          thumb: await canvasToBlob(fitCanvas(c, 600), 'image/jpeg', 0.86),
          w: c.width,
          h: c.height
        };
      } catch (err) {
        console.error(err);
        alert('One of the photos could not be opened.');
        continue;
      }
      palette.photos.push(card);
      await persist();
      render();
      await askName(card, true);
    }
  }

  /** Name sheet, used after adding a card and from the card view. */
  function askName(card, isNew = false) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'sheet';
      dlg.innerHTML = `<form method="dialog" class="sheet-body">
        <h2>${isNew ? 'Name this card' : 'Rename card'}</h2>
        <img class="pal-sheet-card" src="${blobUrl(`p:${card.id}`, card.thumb)}" alt="">
        <div><label class="field-label" for="c-name">Name</label>
        <input id="c-name" class="text-input" type="text" maxlength="50" autocomplete="off" placeholder="e.g. Sporty, Energetic" value="${esc(card.name || '')}"></div>
        <button type="submit" class="btn-primary" value="ok">Save</button>
        ${isNew ? '<button type="button" class="text-btn center" data-x="skip">Skip</button>' : '<button type="button" class="text-btn center" data-x="skip">Cancel</button>'}
      </form>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-x=skip]')) dlg.close(); });
      dlg.addEventListener('close', async () => {
        if (dlg.returnValue === 'ok') {
          card.name = dlg.querySelector('#c-name').value.trim();
          await persist(isNew ? 'Palette card added' : 'Card renamed');
        } else if (isNew) toast('Palette card added');
        dlg.remove();
        render();
        resolve();
      });
      dlg.showModal();
      setTimeout(() => dlg.querySelector('#c-name').focus(), 50);
    });
  }

  /** Full-screen view: pinch or double-tap to zoom, drag to look around. */
  function openCard(id) {
    const card = palette.photos.find((p) => p.id === id);
    if (!card) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'viewer';
    dlg.innerHTML = `
      <div class="viewer-top">
        <button type="button" class="icon-btn light" data-v="close" aria-label="Close">${icon('back')}</button>
        <button type="button" class="viewer-title" data-v="rename" aria-label="Rename ${esc(cardName(card))}"><span id="v-name">${esc(cardName(card))}</span>${icon('pencil')}</button>
        <button type="button" class="icon-btn light" data-v="delete" aria-label="Delete this palette card">${icon('trash')}</button>
      </div>
      <div class="zoom-stage" id="z-stage"><img id="z-img" src="${blobUrl(`pi:${card.id}`, card.image)}" alt="${esc(cardName(card))}" draggable="false"></div>
      <p class="zoom-hint">Pinch or double-tap to zoom</p>`;
    document.body.appendChild(dlg);
    dlg.showModal();

    const stage = dlg.querySelector('#z-stage');
    const img = dlg.querySelector('#z-img');
    let scale = 1;
    let base = { w: 0, h: 0 };
    function fit() {
      const r = stage.getBoundingClientRect();
      const ratio = (card.w || img.naturalWidth || 1) / (card.h || img.naturalHeight || 1);
      base = r.width / r.height > ratio ? { w: r.height * ratio, h: r.height } : { w: r.width, h: r.width / ratio };
      apply();
    }
    // Zoom around a point (cx, cy in stage coordinates) so it stays under the fingers.
    function apply(cx, cy, prev) {
      const w = base.w * scale, h = base.h * scale;
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;
      const r = stage.getBoundingClientRect();
      img.style.margin = `${Math.max(0, (r.height - h) / 2)}px ${Math.max(0, (r.width - w) / 2)}px`;
      if (prev && cx != null) {
        const k = scale / prev;
        stage.scrollLeft = (stage.scrollLeft + cx) * k - cx;
        stage.scrollTop = (stage.scrollTop + cy) * k - cy;
      }
    }
    const setScale = (s, cx, cy) => { const prev = scale; scale = Math.min(5, Math.max(1, s)); apply(cx, cy, prev); };
    if (img.complete) fit(); else img.onload = fit;
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    const pts = new Map();
    let pinch = null, lastTap = 0;
    const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    stage.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: scale };
      } else if (pts.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { const p = local(e); setScale(scale > 1.2 ? 1 : 2.5, p.x, p.y); lastTap = 0; } else lastTap = now;
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        setScale(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);

    dlg.addEventListener('click', async (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v === 'close') dlg.close();
      if (v === 'rename') {
        await askName(card);
        dlg.querySelector('#v-name').textContent = cardName(card);
      }
      if (v === 'delete' && confirm(`Delete the palette card “${cardName(card)}”?`)) {
        palette.photos = palette.photos.filter((p) => p.id !== card.id);
        await persist('Palette card deleted');
        dlg.close();
      }
    });
    dlg.addEventListener('close', () => { ro.disconnect(); dlg.remove(); render(); });
  }

  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (b?.dataset.act === 'open') openCard(b.dataset.id);
  };

  render();
  return () => { root.onclick = null; };
}
