// Palette tab: her personal colour analysis (e.g. John Kitchener's method):
// photos of the analysis, colour groups with any number of colours, and notes.
// Colours can be picked straight from the analysis photos.
import { esc, uid, blobUrl, toast, plural } from './util.js';
import { icon } from './icons.js';
import { fileToCanvas, fitCanvas, canvasToBlob, blobToCanvas } from './images.js';

const HEX = /^#[0-9a-f]{6}$/i;

export function emptyPalette() {
  return {
    id: 'main',
    type: '',
    notes: '',
    photos: [],
    groups: [
      { id: uid(), name: 'My colours', kind: 'good', colors: [] },
      { id: uid(), name: 'Neutrals', kind: 'good', colors: [] },
      { id: uid(), name: 'Avoid', kind: 'avoid', colors: [] }
    ],
    updated: 0
  };
}

export const colourCount = (p) => (p?.groups || []).reduce((n, g) => n + g.colors.length, 0);

// ---------------- colour matching (for the closet) ----------------
function hexToLab(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const GOOD_MATCH = 20;  // how close a piece's colour must be to a palette colour
const AVOID_MATCH = 14;

/**
 * How a piece's main colour relates to the palette:
 * { kind: 'good' | 'avoid', color, group } or null when it is close to nothing.
 * Approximate: it compares one main colour, so patterns match less well.
 */
export function paletteMatch(palette, hex) {
  if (!palette || !HEX.test(hex || '')) return null;
  const lab = hexToLab(hex);
  let good = null, avoid = null;
  for (const g of palette.groups) {
    for (const c of g.colors) {
      const d = deltaE(lab, hexToLab(c.hex));
      const hit = { kind: g.kind, color: c, group: g.name, d };
      if (g.kind === 'avoid') { if (!avoid || d < avoid.d) avoid = hit; } else if (!good || d < good.d) good = hit;
    }
  }
  if (good && good.d <= GOOD_MATCH && (!avoid || good.d <= avoid.d)) return good;
  if (avoid && avoid.d <= AVOID_MATCH) return avoid;
  return null;
}

/** Short text for a match, e.g. "Close to Terracotta (My colours)". */
export function matchText(m) {
  if (!m) return '';
  const what = m.color.name ? `${m.color.name}` : m.color.hex.toUpperCase();
  return `${what} (${m.group})`;
}

// ---------------- the tab ----------------
export function renderPalette(root, { palette, save, tabbar }) {
  root.className = 'app';
  let lastGroup = palette.groups.find((g) => g.kind === 'good')?.id || palette.groups[0]?.id;

  const persist = async (msg) => {
    palette.updated = Date.now();
    await save(palette);
    if (msg) toast(msg);
  };

  function render() {
    const y = window.scrollY;
    const n = colourCount(palette);
    const swatch = (g, c) => `<button type="button" class="pal-swatch" data-act="swatch" data-g="${g.id}" data-c="${c.id}" aria-label="${esc(c.name || c.hex)}">
        <span class="pal-chip" style="background:${HEX.test(c.hex) ? c.hex : '#ccc'}"></span>
        <span class="pal-name">${esc(c.name || '')}</span>
      </button>`;
    root.innerHTML = `
      <header class="page-head">
        <h1>Palette</h1>
        <div class="head-actions"><span>${plural(n, 'colour')}</span></div>
      </header>
      <div class="palette">
        <section class="card">
          <div>
            <label class="field-label" for="p-type">My colouring</label>
            <input id="p-type" class="text-input" type="text" maxlength="80" autocomplete="off" placeholder="e.g. John Kitchener personal palette" value="${esc(palette.type)}">
          </div>
          <div>
            <div class="field-label"><span>Analysis photos</span><small>Tap one to pick colours from it</small></div>
            <div class="pal-photos">
              ${palette.photos.map((p, k) => `<button type="button" class="pal-photo" data-act="photo" data-id="${p.id}" aria-label="Analysis photo ${k + 1}"><img src="${blobUrl(`p:${p.id}`, p.thumb)}" alt=""></button>`).join('')}
              <label class="pal-photo add">${icon('camera')}<span>Add</span><input type="file" id="p-photos" accept="image/*" multiple class="visually-hidden"></label>
            </div>
          </div>
        </section>
        ${palette.groups.map((g) => `
          <section class="card pal-group${g.kind === 'avoid' ? ' avoid' : ''}">
            <div class="pal-group-head">
              <h2>${esc(g.name)}<span class="count">${g.colors.length}</span></h2>
              ${g.kind === 'avoid' ? '<span class="pal-kind">to avoid</span>' : ''}
              <button type="button" class="icon-btn small" data-act="group" data-g="${g.id}" aria-label="Edit group ${esc(g.name)}">${icon('pencil')}</button>
            </div>
            <div class="pal-swatches">
              ${g.colors.map((c) => swatch(g, c)).join('')}
              <label class="pal-swatch add" aria-label="Add a colour to ${esc(g.name)}"><span class="pal-chip">${icon('plus')}</span><span class="pal-name">Add</span><input type="color" class="visually-hidden" data-add="${g.id}" value="#c8a46e"></label>
            </div>
          </section>`).join('')}
        <button type="button" class="btn-secondary" data-act="add-group">${icon('plus')} Add a colour group</button>
        <section class="card">
          <label class="field-label" for="p-notes">Notes</label>
          <textarea id="p-notes" class="text-input area" rows="5" placeholder="e.g. gold jewellery, warm red lipstick, soft prints, best contrast level">${esc(palette.notes)}</textarea>
        </section>
        <p class="muted small center">Clothes whose main colour is close to a colour here get a mark in the Closet, and can be filtered with “In my palette”.</p>
      </div>
      ${tabbar}`;
    window.scrollTo(0, y);

    let t;
    const later = () => { clearTimeout(t); t = setTimeout(() => persist(), 500); };
    root.querySelector('#p-type').addEventListener('input', (e) => { palette.type = e.target.value; later(); });
    root.querySelector('#p-notes').addEventListener('input', (e) => { palette.notes = e.target.value; later(); });
    root.querySelector('#p-photos').addEventListener('change', (e) => addPhotos([...e.target.files]));
    root.querySelectorAll('input[data-add]').forEach((inp) => inp.addEventListener('change', async () => {
      const g = palette.groups.find((x) => x.id === inp.dataset.add);
      const c = { id: uid(), hex: inp.value, name: '' };
      g.colors.push(c);
      await persist();
      render();
      openSwatch(g.id, c.id, true);
    }));
  }

  async function addPhotos(files) {
    if (!files.length) return;
    toast(files.length > 1 ? `Adding ${files.length} photos…` : 'Adding photo…');
    for (const f of files) {
      try {
        const c = await fileToCanvas(f, 2000);
        palette.photos.push({
          id: uid(),
          image: await canvasToBlob(c, 'image/jpeg', 0.9),
          thumb: await canvasToBlob(fitCanvas(c, 360), 'image/jpeg', 0.85),
          w: c.width,
          h: c.height
        });
      } catch (err) {
        console.error(err);
        alert('One of the photos could not be opened.');
      }
    }
    await persist(files.length > 1 ? 'Photos added' : 'Photo added');
    render();
  }

  // ---- sheets ----
  function sheet(html, onClose) {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form method="dialog" class="sheet-body">${html}</form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', async () => { await onClose(dlg); dlg.remove(); });
    dlg.showModal();
    return dlg;
  }

  function openSwatch(gid, cid, isNew = false) {
    let g = palette.groups.find((x) => x.id === gid);
    const c = g.colors.find((x) => x.id === cid);
    let target = g.id;
    const dlg = sheet(`
      <div class="pal-big" id="s-big" style="background:${c.hex}"></div>
      <div class="pal-hex"><span id="s-hex">${c.hex.toUpperCase()}</span>
        <label class="link-btn">Change colour<input type="color" id="s-color" class="visually-hidden" value="${c.hex}"></label></div>
      <div>
        <label class="field-label" for="s-name">Name <small>Optional</small></label>
        <input id="s-name" class="text-input" type="text" maxlength="40" autocomplete="off" placeholder="e.g. Terracotta" value="${esc(c.name)}">
      </div>
      <div>
        <div class="field-label"><span id="s-g-label">Group</span></div>
        <div class="chips wrap" role="group" aria-labelledby="s-g-label">
          ${palette.groups.map((x) => `<button type="button" class="chip" data-sg="${x.id}" aria-pressed="${x.id === g.id}">${esc(x.name)}</button>`).join('')}
        </div>
      </div>
      <button type="submit" class="btn-primary" value="ok">Done</button>
      <button type="button" class="btn-secondary danger" data-x="del">${icon('trash')} Remove this colour</button>`,
    async (d) => {
      if (d.returnValue === 'del') {
        g.colors = g.colors.filter((x) => x.id !== c.id);
        await persist('Colour removed');
      } else {
        c.name = d.querySelector('#s-name').value.trim();
        if (target !== g.id) {
          g.colors = g.colors.filter((x) => x.id !== c.id);
          palette.groups.find((x) => x.id === target).colors.push(c);
        }
        await persist(isNew ? `Added to ${palette.groups.find((x) => x.id === target).name}` : null);
      }
      render();
    });
    dlg.querySelector('#s-color').addEventListener('input', (e) => {
      c.hex = e.target.value;
      dlg.querySelector('#s-big').style.background = c.hex;
      dlg.querySelector('#s-hex').textContent = c.hex.toUpperCase();
    });
    dlg.addEventListener('click', (e) => {
      const sg = e.target.closest('[data-sg]');
      if (sg) {
        target = sg.dataset.sg;
        dlg.querySelectorAll('[data-sg]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sg === target)));
      }
      if (e.target.closest('[data-x=del]') && confirm('Remove this colour?')) dlg.close('del');
    });
    if (isNew) setTimeout(() => dlg.querySelector('#s-name').focus(), 50);
  }

  function openGroup(gid) {
    const g = gid ? palette.groups.find((x) => x.id === gid) : null;
    let kind = g?.kind || 'good';
    const dlg = sheet(`
      <h2>${g ? 'Colour group' : 'New colour group'}</h2>
      <div>
        <label class="field-label" for="g-name">Name</label>
        <input id="g-name" class="text-input" type="text" maxlength="40" autocomplete="off" required placeholder="e.g. Accents, Lipstick" value="${esc(g?.name || '')}">
      </div>
      <div class="segmented" role="group" aria-label="Kind">
        <button type="button" data-kind="good" aria-pressed="${kind === 'good'}">Colours that suit me</button>
        <button type="button" data-kind="avoid" aria-pressed="${kind === 'avoid'}">Colours to avoid</button>
      </div>
      <button type="submit" class="btn-primary" value="ok">${g ? 'Save' : 'Add group'}</button>
      ${g ? `<button type="button" class="btn-secondary danger" data-x="del">${icon('trash')} Delete this group</button>` : ''}`,
    async (d) => {
      if (d.returnValue === 'del') {
        palette.groups = palette.groups.filter((x) => x.id !== g.id);
        await persist('Group deleted');
      } else if (d.returnValue === 'ok') {
        const name = d.querySelector('#g-name').value.trim();
        if (!name) return;
        if (g) Object.assign(g, { name, kind });
        else palette.groups.push({ id: uid(), name, kind, colors: [] });
        await persist();
      } else return;
      render();
    });
    dlg.addEventListener('click', (e) => {
      const k = e.target.closest('[data-kind]');
      if (k) {
        kind = k.dataset.kind;
        dlg.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
      }
      if (e.target.closest('[data-x=del]')) {
        const msg = g.colors.length ? `Delete “${g.name}” and its ${plural(g.colors.length, 'colour')}?` : `Delete “${g.name}”?`;
        if (confirm(msg)) dlg.close('del');
      }
    });
  }

  // ---- photo viewer with colour picking ----
  async function openPhoto(pid) {
    const photo = palette.photos.find((p) => p.id === pid);
    const dlg = document.createElement('dialog');
    dlg.className = 'viewer';
    dlg.innerHTML = `
      <div class="viewer-top">
        <button type="button" class="icon-btn light" data-v="close" aria-label="Close">${icon('back')}</button>
        <span>Tap the photo to pick a colour</span>
        <button type="button" class="icon-btn light" data-v="delete" aria-label="Delete this photo">${icon('trash')}</button>
      </div>
      <div class="viewer-stage" id="v-stage"><canvas id="v-cv"></canvas><span class="v-marker" id="v-marker" hidden></span></div>
      <div class="picker-bar" id="v-bar" hidden>
        <div class="picker-row"><span class="pal-chip big" id="v-chip"></span><strong id="v-hex"></strong>
          <button type="button" class="btn-small" data-v="add">${icon('plus')} Add</button></div>
        <div class="chips scroll-x" id="v-groups">
          ${palette.groups.map((g) => `<button type="button" class="chip" data-vg="${g.id}" aria-pressed="${g.id === lastGroup}">${esc(g.name)}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    const cv = dlg.querySelector('#v-cv');
    const full = await blobToCanvas(photo.image);
    cv.width = full.width; cv.height = full.height;
    cv.getContext('2d').drawImage(full, 0, 0);
    const data = full.getContext('2d').getImageData(0, 0, full.width, full.height).data;
    let picked = null;

    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = Math.round((e.clientX - r.left) * (cv.width / r.width));
      const y = Math.round((e.clientY - r.top) * (cv.height / r.height));
      // Average a small square so fabric texture and JPEG noise don't skew the colour.
      let R = 0, G = 0, B = 0, n = 0;
      const k = Math.max(2, Math.round(cv.width / 400));
      for (let yy = Math.max(0, y - k); yy <= Math.min(cv.height - 1, y + k); yy++) {
        for (let xx = Math.max(0, x - k); xx <= Math.min(cv.width - 1, x + k); xx++) {
          const i = (yy * cv.width + xx) * 4;
          R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
        }
      }
      const h = (v) => Math.round(v / n).toString(16).padStart(2, '0');
      picked = `#${h(R)}${h(G)}${h(B)}`;
      const stage = dlg.querySelector('#v-stage').getBoundingClientRect();
      const m = dlg.querySelector('#v-marker');
      m.hidden = false;
      m.style.left = `${e.clientX - stage.left}px`;
      m.style.top = `${e.clientY - stage.top}px`;
      m.style.background = picked;
      dlg.querySelector('#v-bar').hidden = false;
      dlg.querySelector('#v-chip').style.background = picked;
      dlg.querySelector('#v-hex').textContent = picked.toUpperCase();
    });

    dlg.addEventListener('click', async (e) => {
      const vg = e.target.closest('[data-vg]');
      if (vg) {
        lastGroup = vg.dataset.vg;
        dlg.querySelectorAll('[data-vg]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vg === lastGroup)));
      }
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v === 'close') dlg.close();
      if (v === 'add' && picked) {
        const g = palette.groups.find((x) => x.id === lastGroup) || palette.groups[0];
        g.colors.push({ id: uid(), hex: picked, name: '' });
        await persist(`Added to ${g.name} (${g.colors.length})`);
      }
      if (v === 'delete' && confirm('Delete this photo? The colours you picked from it stay.')) {
        palette.photos = palette.photos.filter((p) => p.id !== pid);
        await persist('Photo deleted');
        dlg.close();
      }
    });
    dlg.addEventListener('close', () => { dlg.remove(); render(); });
  }

  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'swatch') openSwatch(b.dataset.g, b.dataset.c);
    else if (act === 'group') openGroup(b.dataset.g);
    else if (act === 'add-group') openGroup(null);
    else if (act === 'photo') openPhoto(b.dataset.id);
  };

  render();
  return () => { root.onclick = null; };
}
