// Settings: storage safety, background-removal quality, backup and restore.
import * as db from './db.js';
import { icon } from './icons.js';
import { toast, plural } from './util.js';
import { MODELS, getModel, setModel, preloadModel } from './bg.js';
import { blobToDataUrl, dataUrlToBlob } from './images.js';

export function renderSettings(root, { state, reload, onBack }) {
  root.className = 'app no-tabbar';
  root.innerHTML = `
    <div class="topbar">
      <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <h1>Settings</h1><span></span>
    </div>
    <div class="settings">
      <section class="card">
        <h2>Your photos</h2>
        <p class="muted" id="usage">Checking storage…</p>
        <p id="persist-text" class="muted"></p>
        <button type="button" class="btn-secondary" data-act="persist" id="persist-btn" hidden>${icon('shield')} Keep my photos safe</button>
      </section>

      <section class="card">
        <h2>Background removal</h2>
        <p class="muted">Happens on this phone. Nothing is uploaded. The helper is downloaded once and then works offline.</p>
        <div class="segmented" role="group" aria-label="Quality">
          ${Object.entries(MODELS).map(([k, m]) => `<button type="button" data-act="model" data-m="${k}" aria-pressed="${k === getModel()}">${m.label}<small> · ${m.size}</small></button>`).join('')}
        </div>
        <button type="button" class="btn-secondary" data-act="preload">${icon('download')} Download it now</button>
        <div class="progress" id="pre-bar" hidden><span></span></div>
      </section>

      <section class="card">
        <h2>Backup</h2>
        <p class="muted">Your clothes live only on this phone. Save a backup now and then, for example to Google Drive or iCloud.</p>
        <button type="button" class="btn-secondary" data-act="export">${icon('download')} Save a backup</button>
        <label class="btn-secondary">${icon('upload')} Restore from a backup<input type="file" id="import" accept="application/json,.json" class="visually-hidden"></label>
      </section>

      <section class="card">
        <h2>Install on your phone</h2>
        <p class="muted"><strong>Android (Chrome):</strong> menu ⋮ → <em>Install app</em> or <em>Add to Home screen</em>.<br>
        <strong>iPhone (Safari):</strong> Share → <em>Add to Home Screen</em>. On iPhone this also keeps your photos from being cleared.</p>
      </section>

      <section class="card">
        <h2>Start over</h2>
        <button type="button" class="btn-secondary danger" data-act="wipe">${icon('trash')} Delete all clothes and outfits</button>
      </section>
      <p class="muted small center">Background removal by IMG.LY (AGPL).</p>
    </div>`;

  async function showStorage() {
    const usage = root.querySelector('#usage');
    try {
      const est = await navigator.storage?.estimate?.();
      const mb = est ? (est.usage / 1048576).toFixed(1) : '?';
      usage.textContent = `${plural(state.items.length, 'piece')} and ${plural(state.outfits.length, 'outfit')}, using ${mb} MB.`;
    } catch { usage.textContent = `${plural(state.items.length, 'piece')} and ${plural(state.outfits.length, 'outfit')}.`; }
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    root.querySelector('#persist-text').textContent = persisted
      ? 'This phone will keep your photos even when space runs low.'
      : 'The browser may clear stored photos when the phone runs low on space.';
    root.querySelector('#persist-btn').hidden = !!persisted || !navigator.storage?.persist;
  }
  showStorage();

  root.querySelector('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'wardrobe' || !Array.isArray(data.items)) throw new Error('Not a wardrobe backup');
      const items = await Promise.all(data.items.map(async (i) => ({ ...i, image: await dataUrlToBlob(i.image), thumb: await dataUrlToBlob(i.thumb) })));
      const outfits = await Promise.all((data.outfits || []).map(async (o) => ({ ...o, thumb: await dataUrlToBlob(o.thumb) })));
      await db.putMany('items', items);
      await db.putMany('outfits', outfits);
      await reload();
      showStorage();
      toast(`Restored ${plural(items.length, 'piece')} and ${plural(outfits.length, 'outfit')}`);
    } catch (err) {
      console.error(err);
      alert('That file could not be restored. Choose a backup saved by this app.');
    }
  });

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') onBack();
    else if (act === 'persist') {
      const ok = await navigator.storage.persist().catch(() => false);
      toast(ok ? 'Your photos are protected' : 'Install the app to your home screen first, then try again');
      showStorage();
    } else if (act === 'model') {
      setModel(b.dataset.m);
      root.querySelectorAll('[data-act=model]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.m === b.dataset.m)));
    } else if (act === 'preload') {
      const bar = root.querySelector('#pre-bar');
      bar.hidden = false;
      b.disabled = true;
      try {
        await preloadModel((f) => { bar.firstElementChild.style.width = `${Math.round(f * 100)}%`; });
        bar.firstElementChild.style.width = '100%';
        toast('Ready. Background removal now works offline.');
      } catch (err) {
        console.error(err);
        toast('Download failed. Check the internet connection.');
      }
      b.disabled = false;
    } else if (act === 'export') exportBackup();
    else if (act === 'wipe') {
      if (!confirm('Delete ALL clothes and outfits from this phone? This cannot be undone.')) return;
      await db.clear('items');
      await db.clear('outfits');
      await reload();
      showStorage();
      toast('Everything was deleted');
    }
  };

  async function exportBackup() {
    toast('Preparing backup…', 4000);
    const items = await Promise.all(state.items.map(async (i) => ({ ...i, image: await blobToDataUrl(i.image), thumb: await blobToDataUrl(i.thumb) })));
    const outfits = await Promise.all(state.outfits.map(async (o) => ({ ...o, thumb: await blobToDataUrl(o.thumb) })));
    const json = JSON.stringify({ app: 'wardrobe', version: 1, exported: new Date().toISOString(), items, outfits });
    const name = `wardrobe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Wardrobe backup' }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return () => { root.onclick = null; };
}
