// Wishlist: screenshots of things she likes online, each with a link to the shop.
import { CATEGORIES, catById } from './constants.js';
import { esc, uid, blobUrl, plural } from './util.js';
import { icon } from './icons.js';
import { removeBackground } from './bg.js';
import {
  fileToCanvas, blobToCanvas, canvasToBlob, makeCanvas, trimAlpha, fitCanvas, encodeTransparent
} from './images.js';
import { findUrl, normalizeUrl, siteName, urlFromImageMetadata } from './link.js';

// ---------------- List ----------------
export function renderWishlist(root, { wishes, tabbar, onAdd, onEdit }) {
  root.className = 'app';
  const card = (w) => {
    const img = `<img src="${blobUrl(`w:${w.id}`, w.thumb)}" alt="" loading="lazy">`;
    const meta = [w.site !== w.name && w.site, w.price].filter(Boolean).map(esc).join(' · ');
    return `<div class="wcard">
      ${w.url
        ? `<a class="wcard-img${w.cutout ? '' : ' photo'}" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(w.name)} on ${esc(w.site || 'the website')}">${img}<span class="wcard-go" aria-hidden="true">${icon('external')}</span></a>`
        : `<button type="button" class="wcard-img${w.cutout ? '' : ' photo'}" data-act="edit" data-id="${w.id}" aria-label="${esc(w.name)}, no link yet">${img}</button>`}
      <div class="wcard-body">
        <div class="wcard-text">
          <span class="wcard-name">${esc(w.name)}</span>
          <span class="wcard-meta">${meta || (w.url ? '' : '<em>No link yet</em>')}</span>
        </div>
        <button type="button" class="icon-btn small" data-act="edit" data-id="${w.id}" aria-label="Edit ${esc(w.name)}">${icon('pencil')}</button>
      </div>
    </div>`;
  };
  root.innerHTML = `
    <header class="page-head">
      <h1>Wishlist</h1>
      <div class="head-actions"><span>${plural(wishes.length, 'wish', 'wishes')}</span></div>
    </header>
    ${wishes.length ? `<div class="wgrid">${wishes.map(card).join('')}</div>` : `<div class="empty">
      <h2>Nothing on the wishlist yet</h2>
      <p>Found something you love online? Take a screenshot, then tap <strong>+</strong> and choose it.</p>
      <p class="small">Copy the page's link first (Share → Copy) and the app can paste it in for you. Tap a picture later to go straight to the shop.</p>
    </div>`}
    <button type="button" class="fab" data-act="add" aria-label="Add to wishlist">${icon('plus')}</button>
    ${tabbar}`;
  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'add') onAdd();
    if (b.dataset.act === 'edit') onEdit(b.dataset.id);
  };
  return () => { root.onclick = null; };
}

// ---------------- Add / edit ----------------
export function renderWishForm(root, { wish, file, shared, onSave, onDelete, onMoveToCloset, onCancel }) {
  let orig = null;       // the screenshot (or the saved picture when editing)
  let work = null;       // orig after cropping
  let mask = null;       // background-removal result for `work`
  let view = 'cut';      // 'photo' | 'cut' (only matters when mask exists)
  let cropping = false;
  let box = { x: 0.08, y: 0.12, w: 0.84, h: 0.6 }; // crop box, fractions of orig
  let busy = false;
  let changed = !wish;   // picture changed and must be re-encoded
  let category = wish?.category || null;

  root.className = 'app no-tabbar';
  root.innerHTML = `
    <div class="topbar">
      <button type="button" class="text-btn" data-act="cancel">Cancel</button>
      <h1>${wish ? 'Wish' : 'New wish'}</h1>
      <span></span>
    </div>
    <div class="preview checker" id="pv">
      <div class="crop-stage" id="stage">
        <canvas id="cv" role="img" aria-label="The picture"></canvas>
        <div class="crop-box" id="box" hidden>
          <span class="crop-h" data-h="nw"></span><span class="crop-h" data-h="ne"></span>
          <span class="crop-h" data-h="sw"></span><span class="crop-h" data-h="se"></span>
        </div>
      </div>
      <label class="pick-shot" id="pick" hidden>${icon('upload')}<span>Choose the screenshot</span><input type="file" id="shot" accept="image/*" class="visually-hidden"></label>
      <div class="status" id="status" hidden></div>
    </div>
    <div class="tools-row" id="crop-tools" hidden>
      <p class="hint grow">Drag the corners around the item.</p>
      <button type="button" class="tool-btn" data-act="crop-all">Whole picture</button>
      <button type="button" class="tool-btn" data-act="crop-done">${icon('check')} Done</button>
    </div>
    <div class="tools-row" id="view-tools" hidden>
      <button type="button" class="tool-btn" data-act="crop">${icon('crop')} Crop</button>
      <button type="button" class="tool-btn" data-act="remove-bg" id="rm-btn">${icon('brush')} Remove background</button>
      <div class="segmented" role="group" aria-label="Show" id="view-seg" hidden>
        <button type="button" data-act="view" data-v="photo" aria-pressed="false">Original</button>
        <button type="button" data-act="view" data-v="cut" aria-pressed="true">Cut-out</button>
      </div>
    </div>
    <div class="form" id="form">
      <div>
        <label class="field-label" for="url">Link to the shop <small id="url-src"></small></label>
        <div class="url-row">
          <input id="url" class="text-input" type="url" inputmode="url" autocomplete="off" placeholder="https://…" value="${esc(wish?.url || '')}">
          <button type="button" class="tool-btn" data-act="paste">${icon('clipboard')} Paste</button>
        </div>
        <a id="open-link" class="link-btn" target="_blank" rel="noopener noreferrer" hidden>${icon('external')} Open the page</a>
      </div>
      <div>
        <label class="field-label" for="name">Name <small>Optional</small></label>
        <input id="name" class="text-input" type="text" maxlength="80" autocomplete="off" value="${esc(wish?.name || '')}">
      </div>
      <div>
        <label class="field-label" for="price">Price <small>Optional</small></label>
        <input id="price" class="text-input" type="text" maxlength="20" autocomplete="off" placeholder="e.g. €49.95" value="${esc(wish?.price || '')}">
      </div>
      <div>
        <div class="field-label"><span id="wcat-label">Category</span><small>Optional</small></div>
        <div class="chips wrap" role="group" aria-labelledby="wcat-label">
          ${CATEGORIES.map((c) => `<button type="button" class="chip" data-act="cat" data-id="${c.id}" aria-pressed="false">${c.label}</button>`).join('')}
        </div>
      </div>
      ${wish ? `
        <button type="button" class="btn-secondary" data-act="bought">${icon('hanger')} I bought it: move to Closet</button>
        <button type="button" class="btn-secondary danger" data-act="delete">${icon('trash')} Remove from wishlist</button>` : ''}
    </div>
    <div class="bottom-bar">
      <button type="button" class="btn-primary" id="save" data-act="save">Save to wishlist</button>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const cv = $('#cv'), stage = $('#stage'), pv = $('#pv'), boxEl = $('#box');
  const urlInput = $('#url'), nameInput = $('#name');

  function setUrl(url, source) {
    if (!url) return;
    urlInput.value = url;
    $('#url-src').textContent = source || '';
    refresh();
  }

  function autoName() {
    return shared?.title?.trim() || siteName(normalizeUrl(urlInput.value)) || 'Wish';
  }

  function refresh() {
    const url = normalizeUrl(urlInput.value);
    const open = $('#open-link');
    open.hidden = !url;
    if (url) open.href = url;
    nameInput.placeholder = autoName();
    root.querySelectorAll('[data-act=cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === category)));
    root.querySelectorAll('[data-act=view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
    $('#pick').hidden = !!orig;
    stage.hidden = !orig;
    $('#crop-tools').hidden = !cropping || busy;
    $('#view-tools').hidden = cropping || busy || !orig;
    $('#rm-btn').hidden = !!mask;
    $('#view-seg').hidden = !mask;
    boxEl.hidden = !cropping;
    pv.classList.toggle('cropping', cropping);
    const bought = root.querySelector('[data-act=bought]');
    if (bought) bought.disabled = !category;
    $('#save').disabled = busy || !orig;
    $('#save').textContent = busy ? 'Please wait…' : 'Save to wishlist';
  }

  // ---- drawing ----
  function composite() {
    const c = makeCanvas(work.width, work.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(work, 0, 0);
    return c;
  }
  function current() { return cropping ? orig : work; }
  function fit() {
    const src = current();
    if (!src) return;
    const r = pv.getBoundingClientRect();
    const s = Math.min((r.width - 24) / src.width, (r.height - 24) / src.height);
    cv.style.width = `${src.width * s}px`;
    cv.style.height = `${src.height * s}px`;
  }
  function draw() {
    const src = current();
    if (!src) return;
    cv.width = src.width;
    cv.height = src.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(!cropping && mask && view === 'cut' ? composite() : src, 0, 0);
    fit();
    placeBox();
  }
  function placeBox() {
    Object.assign(boxEl.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
  }
  const ro = new ResizeObserver(fit);
  ro.observe(pv);

  // ---- crop gestures ----
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!cropping) return;
    const h = e.target.closest('.crop-h')?.dataset.h;
    if (!h && !e.target.closest('#box')) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect();
    drag = { h: h || 'move', x: e.clientX, y: e.clientY, b: { ...box }, rw: r.width, rh: r.height };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / drag.rw, dy = (e.clientY - drag.y) / drag.rh;
    const b = { ...drag.b };
    const min = 0.06;
    if (drag.h === 'move') {
      b.x = Math.min(1 - b.w, Math.max(0, b.x + dx));
      b.y = Math.min(1 - b.h, Math.max(0, b.y + dy));
    } else {
      let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
      if (drag.h.includes('w')) x1 = Math.min(x2 - min, Math.max(0, x1 + dx));
      if (drag.h.includes('e')) x2 = Math.max(x1 + min, Math.min(1, x2 + dx));
      if (drag.h.includes('n')) y1 = Math.min(y2 - min, Math.max(0, y1 + dy));
      if (drag.h.includes('s')) y2 = Math.max(y1 + min, Math.min(1, y2 + dy));
      Object.assign(b, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    box = b;
    placeBox();
  });
  const endDrag = () => { drag = null; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  function applyCrop() {
    const sx = Math.round(box.x * orig.width), sy = Math.round(box.y * orig.height);
    const sw = Math.max(1, Math.round(box.w * orig.width)), sh = Math.max(1, Math.round(box.h * orig.height));
    work = makeCanvas(sw, sh);
    work.getContext('2d').drawImage(orig, sx, sy, sw, sh, 0, 0, sw, sh);
    mask = null;
    changed = true;
  }

  // ---- background removal ----
  function status(html) {
    $('#status').hidden = !html;
    $('#status').innerHTML = html || '';
  }
  async function removeBg() {
    busy = true; refresh();
    status(`<span>Removing the background…</span><div class="progress"><span id="bar"></span></div>
      <small class="muted" id="sub">The first time, the app downloads its helper (one time only).</small>`);
    try {
      const out = await removeBackground(await canvasToBlob(work, 'image/jpeg', 0.92), (f) => {
        const bar = root.querySelector('#bar');
        if (bar) bar.style.width = `${Math.round(f * 100)}%`;
        const sub = root.querySelector('#sub');
        if (sub) sub.textContent = f < 1 ? `Downloading the helper… ${Math.round(f * 100)}%` : 'Working on your picture…';
      });
      mask = await blobToCanvas(out, work.width, work.height);
      view = 'cut';
      changed = true;
      status('');
    } catch (err) {
      console.error(err);
      status(`<span><strong>The background could not be removed.</strong></span>
        <small class="muted">${navigator.onLine ? 'Try cropping closer to the item, then try again.' : 'You seem to be offline. The first removal needs internet.'}</small>
        <div class="status-actions"><button type="button" class="tool-btn" data-act="status-close">OK</button></div>`);
    }
    busy = false;
    draw(); refresh();
  }

  // ---- loading the picture ----
  async function loadFile(f) {
    busy = true; refresh();
    try {
      orig = await fileToCanvas(f, 2400);
    } catch (err) {
      console.error(err);
      busy = false; refresh();
      alert('This picture could not be opened.');
      return;
    }
    work = orig;
    mask = null;
    changed = true;
    cropping = true;
    box = { x: 0.06, y: 0.12, w: 0.88, h: 0.62 };
    busy = false;
    draw(); refresh();
    if (!normalizeUrl(urlInput.value)) {
      const found = await urlFromImageMetadata(f);
      if (found) setUrl(found, 'Found in the screenshot');
    }
  }
  $('#shot').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); });

  urlInput.addEventListener('input', () => { $('#url-src').textContent = ''; refresh(); });
  urlInput.addEventListener('blur', () => {
    const u = findUrl(urlInput.value);
    if (u && u !== urlInput.value) urlInput.value = u;
    refresh();
  });

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') onCancel();
    else if (act === 'crop') { cropping = true; draw(); refresh(); }
    else if (act === 'crop-all') { box = { x: 0, y: 0, w: 1, h: 1 }; placeBox(); }
    else if (act === 'crop-done') { applyCrop(); cropping = false; draw(); refresh(); }
    else if (act === 'remove-bg') removeBg();
    else if (act === 'status-close') status('');
    else if (act === 'view') { view = b.dataset.v; changed = true; draw(); refresh(); }
    else if (act === 'cat') { category = category === b.dataset.id ? null : b.dataset.id; refresh(); }
    else if (act === 'paste') {
      try {
        const text = await navigator.clipboard.readText();
        const u = findUrl(text);
        if (u) setUrl(u, 'Pasted');
        else alert('There is no link on the clipboard. In the browser, use Share → Copy (or copy the address bar), then tap Paste again.');
      } catch {
        urlInput.focus();
        alert('Paste the link into the box (press and hold → Paste).');
      }
    }
    else if (act === 'save') save();
    else if (act === 'delete') { if (confirm('Remove this from the wishlist?')) onDelete(wish); }
    else if (act === 'bought') {
      if (!category) return;
      if (!confirm(`Move this to your Closet under ${catById(category).label}? It leaves the wishlist.`)) return;
      busy = true; refresh();
      const w = await build();
      onMoveToCloset(w);
    }
  };

  async function build() {
    const url = findUrl(urlInput.value);
    const w = {
      ...(wish || {}),
      id: wish?.id || uid(),
      url,
      site: siteName(url),
      name: nameInput.value.trim() || autoName(),
      price: $('#price').value.trim(),
      category,
      created: wish?.created || Date.now(),
      updated: Date.now()
    };
    if (changed && work) {
      const cut = !!mask && view === 'cut';
      const final = cut ? trimAlpha(composite(), 6) : work;
      const full = fitCanvas(final, 1200);
      const thumbC = fitCanvas(final, 420);
      w.image = cut ? await encodeTransparent(full) : await canvasToBlob(full, 'image/jpeg', 0.88);
      w.thumb = cut ? await encodeTransparent(thumbC) : await canvasToBlob(thumbC, 'image/jpeg', 0.85);
      w.w = full.width;
      w.h = full.height;
      w.cutout = cut;
    }
    return w;
  }

  async function save() {
    if (!orig || busy) return;
    if (cropping) { applyCrop(); cropping = false; draw(); }
    const typed = urlInput.value.trim();
    if (typed && !findUrl(typed)) { alert('That link does not look right. It should start with https://'); return; }
    busy = true; refresh();
    try {
      await onSave(await build());
    } catch (err) {
      console.error(err);
      busy = false; refresh();
      alert('Saving failed. Your phone may be out of storage space.');
    }
  }

  // ---- start ----
  if (shared?.url) setUrl(shared.url, 'From the shared page');
  refresh();
  if (file) loadFile(file);
  else if (wish) {
    (async () => {
      orig = await blobToCanvas(wish.image);
      work = orig;
      box = { x: 0, y: 0, w: 1, h: 1 };
      draw(); refresh();
    })();
  }
  return () => { root.onclick = null; ro.disconnect(); };
}
