// "New piece" screen: photo -> background removed -> optional touch up -> details -> save.
import { CATEGORIES, SEASONS, catById } from './constants.js';
import { uid, esc } from './util.js';
import { icon } from './icons.js';
import { removeBackground } from './bg.js';
import {
  fileToCanvas, blobToCanvas, canvasToBlob, makeCanvas, trimAlpha, fitCanvas, hasTransparency,
  encodeTransparent, dominantColor, colorName
} from './images.js';

export function renderAdd(root, file, { onSave, onCancel }) {
  let orig = null;          // the photo, as a canvas
  let mask = null;          // canvas whose alpha says what to keep
  let comp = null;          // reusable canvas for photo-through-mask
  let view = 'cut';         // 'photo' | 'cut'
  let painting = false;
  let brushMode = 'erase';
  let brushSize = 26;       // on-screen px
  let category = null;
  const seasons = new Set();
  let color = null;         // { hex, name }
  let removed = false;      // background removal succeeded
  let busy = true;
  let preCut = false;      // the picture was already cut out (e.g. Samsung Gallery 'Save as image')

  root.className = 'app no-tabbar';
  root.innerHTML = `
    <div class="topbar">
      <button type="button" class="text-btn" data-act="cancel">Cancel</button>
      <h1>New piece</h1>
      <span></span>
    </div>
    <div class="preview checker" id="pv">
      <canvas id="cv" role="img" aria-label="The photo of your piece"></canvas>
      <span class="badge" id="badge" hidden>${icon('check')} <span id="badge-text">Background removed</span></span>
      <div class="status" id="status"></div>
    </div>
    <div class="tools-row" id="view-tools" hidden>
      <div class="segmented" role="group" aria-label="Show">
        <button type="button" data-act="view" data-v="photo" aria-pressed="false">Photo</button>
        <button type="button" data-act="view" data-v="cut" aria-pressed="true">Cut-out</button>
      </div>
      <button type="button" class="tool-btn" data-act="touch">${icon('brush')} Touch up</button>
    </div>
    <p class="hint" id="fix-hint" hidden>Part of the clothing cut away? Tap <strong>Touch up</strong> → <strong>Restore</strong> and paint it back.</p>
    <div id="touch-tools" hidden>
      <div class="tools-row">
        <div class="segmented" role="group" aria-label="Brush">
          <button type="button" data-act="mode" data-m="erase" aria-pressed="true">Erase</button>
          <button type="button" data-act="mode" data-m="restore" aria-pressed="false">Restore</button>
        </div>
        <button type="button" class="tool-btn" data-act="touch-done">${icon('check')} Done</button>
      </div>
      <div class="brush-row">
        <label for="brush">Brush</label>
        <input id="brush" type="range" min="8" max="70" value="${brushSize}">
      </div>
      <p class="hint">Paint over spots to erase them, or switch to Restore to bring parts back.</p>
    </div>
    <div class="form" id="form">
      <div>
        <div class="field-label"><span id="cat-label">Category</span></div>
        <div class="chips wrap" id="cats" role="group" aria-labelledby="cat-label">
          ${CATEGORIES.map((c) => `<button type="button" class="chip" data-act="cat" data-id="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="field-label"><span id="season-label">Seasons</span><small>Pick any that fit</small></div>
        <div class="seasons" role="group" aria-labelledby="season-label">
          ${SEASONS.map((s) => `<button type="button" class="chip" data-act="season" data-id="${s.id}" aria-pressed="false">${s.label}</button>`).join('')}
        </div>
      </div>
      <div class="color-row">
        <span class="swatch" id="swatch"></span>
        <div class="grow"><strong id="color-name">Colour</strong><span class="muted">Picked from the photo</span></div>
        <label class="link-btn">Change<input type="color" id="color-input" class="visually-hidden"></label>
      </div>
      <div>
        <label class="field-label" for="name">Name <small>Optional</small></label>
        <input id="name" class="text-input" type="text" autocomplete="off" maxlength="60">
      </div>
    </div>
    <div class="bottom-bar">
      <button type="button" class="btn-primary" id="save" data-act="save" disabled>Save</button>
    </div>`;

  const cv = root.querySelector('#cv');
  const pv = root.querySelector('#pv');
  const status = root.querySelector('#status');
  const saveBtn = root.querySelector('#save');
  const nameInput = root.querySelector('#name');

  function autoName() {
    const c = catById(category);
    return [color?.name, c?.one].filter(Boolean).join(' ').replace(/^./, (s) => s.toUpperCase()) || 'New piece';
  }

  function refresh() {
    root.querySelectorAll('[data-act=cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === category)));
    root.querySelectorAll('[data-act=season]').forEach((b) => b.setAttribute('aria-pressed', String(seasons.has(b.dataset.id))));
    root.querySelectorAll('[data-act=view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
    root.querySelectorAll('[data-act=mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === brushMode)));
    root.querySelector('#view-tools').hidden = busy || painting || !mask;
    root.querySelector('#touch-tools').hidden = !painting;
    root.querySelector('#badge').hidden = busy || !removed || painting;
    root.querySelector('#fix-hint').hidden = busy || !removed || painting || preCut;
    pv.classList.toggle('painting', painting);
    nameInput.placeholder = autoName();
    if (color) {
      root.querySelector('#swatch').style.background = color.hex;
      root.querySelector('#color-name').textContent = color.name;
      root.querySelector('#color-input').value = color.hex;
    }
    const c = catById(category);
    saveBtn.disabled = busy || !category;
    saveBtn.textContent = busy ? 'Please wait…' : c ? `Save to ${esc(c.label)}` : 'Pick a category';
  }

  function draw() {
    if (!orig) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (view === 'photo' || !mask) { ctx.drawImage(orig, 0, 0); return; }
    if (painting) { ctx.globalAlpha = 0.28; ctx.drawImage(orig, 0, 0); ctx.globalAlpha = 1; }
    ctx.drawImage(composite(), 0, 0);
  }

  function composite() {
    if (!comp) comp = makeCanvas(orig.width, orig.height);
    const ctx = comp.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, comp.width, comp.height);
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(orig, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return comp;
  }

  function detectColor() {
    const hex = dominantColor(mask ? composite() : orig);
    color = { hex, name: colorName(hex) };
  }

  function showStatus(html) {
    status.hidden = !html;
    status.innerHTML = html || '';
  }

  async function process() {
    busy = true; refresh();
    showStatus(`<span>Removing the background…</span><div class="progress"><span id="bar"></span></div>
      <small class="muted" id="sub">The first time, the app downloads its helper (one time only). Keep the screen on.</small>`);
    try {
      const input = await canvasToBlob(orig, 'image/jpeg', 0.92);
      const out = await removeBackground(input, (f) => {
        const bar = root.querySelector('#bar');
        if (bar) bar.style.width = `${Math.round(f * 100)}%`;
        const sub = root.querySelector('#sub');
        if (sub) sub.textContent = f < 1 ? `Downloading the helper… ${Math.round(f * 100)}%` : 'Working on your photo…';
      });
      mask = await blobToCanvas(out, orig.width, orig.height);
      removed = true;
      view = 'cut';
      showStatus('');
    } catch (err) {
      console.error(err);
      removed = false;
      showStatus(`<span><strong>The background could not be removed.</strong></span>
        <small class="muted">${navigator.onLine ? 'Your phone may be short on memory. Close other apps and try again.' : 'You seem to be offline. The first removal needs internet.'}</small>
        <div class="status-actions">
          <button type="button" class="tool-btn" data-act="retry">Try again</button>
          <button type="button" class="tool-btn" data-act="keep-photo">Use photo as it is</button>
        </div>`);
    }
    busy = false;
    if (mask) detectColor();
    draw(); refresh();
  }

  // ---- touch-up painting ----
  let last = null;
  function toCanvasPoint(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height), scale: cv.width / r.width };
  }
  function paint(a, b) {
    const ctx = mask.getContext('2d');
    ctx.globalCompositeOperation = brushMode === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineWidth = brushSize * a.scale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    draw();
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!painting) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    last = toCanvasPoint(e);
    paint(last, last);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!painting || !last) return;
    const p = toCanvasPoint(e);
    paint(last, p);
    last = p;
  });
  const endPaint = () => { last = null; };
  cv.addEventListener('pointerup', endPaint);
  cv.addEventListener('pointercancel', endPaint);

  root.querySelector('#brush').addEventListener('input', (e) => { brushSize = +e.target.value; });
  root.querySelector('#color-input').addEventListener('input', (e) => {
    color = { hex: e.target.value, name: colorName(e.target.value) };
    refresh();
  });
  nameInput.addEventListener('input', refresh);

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') onCancel();
    else if (act === 'cat') { category = b.dataset.id; refresh(); }
    else if (act === 'season') { seasons.has(b.dataset.id) ? seasons.delete(b.dataset.id) : seasons.add(b.dataset.id); refresh(); }
    else if (act === 'view') { view = b.dataset.v; draw(); refresh(); }
    else if (act === 'touch') { painting = true; view = 'cut'; draw(); refresh(); }
    else if (act === 'touch-done') { painting = false; detectColor(); draw(); refresh(); }
    else if (act === 'mode') { brushMode = b.dataset.m; refresh(); }
    else if (act === 'retry') process();
    else if (act === 'keep-photo') {
      mask = makeCanvas(orig.width, orig.height);
      const ctx = mask.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, mask.width, mask.height);
      removed = false; view = 'cut'; showStatus(''); detectColor(); draw(); refresh();
    }
    else if (act === 'save') save();
  };

  async function save() {
    if (!category || busy) return;
    busy = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const trimmed = trimAlpha(composite(), 6);
      const full = fitCanvas(trimmed, 1000);
      const [image, thumb] = await Promise.all([encodeTransparent(full), encodeTransparent(fitCanvas(trimmed, 360))]);
      const item = {
        id: uid(),
        name: nameInput.value.trim() || autoName(),
        category,
        seasons: SEASONS.map((s) => s.id).filter((s) => seasons.has(s)),
        color: color?.hex || '#cccccc',
        colorName: color?.name || '',
        w: full.width,
        h: full.height,
        image,
        thumb,
        created: Date.now()
      };
      await onSave(item);
    } catch (err) {
      console.error(err);
      busy = false;
      refresh();
      alert('Saving failed. Your phone may be out of storage space.');
    }
  }

  (async () => {
    try {
      orig = await fileToCanvas(file, 1600);
    } catch (err) {
      console.error(err);
      showStatus('<strong>This photo could not be opened.</strong> <small class="muted">Try a JPG or PNG photo.</small>');
      busy = false;
      refresh();
      return;
    }
    cv.width = orig.width;
    cv.height = orig.height;
    if (hasTransparency(orig)) {
      // Already cut out: use it as it is, no second background removal.
      preCut = true;
      mask = orig;
      removed = true;
      view = 'cut';
      busy = false;
      root.querySelector('#badge-text').textContent = 'Already cut out';
      detectColor();
      draw();
      refresh();
      return;
    }
    draw();
    process();
  })();

  refresh();
  return () => { root.onclick = null; };
}

