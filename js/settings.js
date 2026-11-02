// Settings tab: backup and restore, storage safety, background-removal quality.
import * as db from './db.js';
import { icon } from './icons.js';
import { toast, plural } from './util.js';
import { MODELS, getModel, setModel, preloadModel } from './bg.js';
import { blobToDataUrl, dataUrlToBlob } from './images.js';
import { VERSION } from './version.js';

const LAST_BACKUP_KEY = 'wardrobe.lastBackup';
const BACKUP_EVERY_DAYS = 30;

function lastBackup() {
  try { return Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0; } catch { return 0; }
}

/** True when there are clothes and no backup was saved in the last 30 days. */
export function backupDue(state) {
  return (state.items.length > 0 || state.wishes.length > 0) && Date.now() - lastBackup() > BACKUP_EVERY_DAYS * 86400000;
}

export function renderSettings(root, { state, reload, tabbar }) {
  root.className = 'app';
  root.innerHTML = `
    <header class="page-head"><h1>Settings</h1></header>
    <div class="settings">
      <section class="card">
        <h2>Backup</h2>
        <p class="muted">All clothes, photos, outfits and wishes live only on this phone. If the phone is lost or broken, they are gone, unless you have a backup.</p>
        <p class="muted">Save the backup somewhere off the phone: Google Drive, iCloud Drive (<em>Save to Files</em>), or email it to yourself. To move to a new phone, open the app there and restore the file.</p>
        <p id="last-backup" class="backup-status"></p>
        <button type="button" class="btn-primary" data-act="export">${icon('download')} Save a backup</button>
        <label class="btn-secondary">${icon('upload')} Restore from a backup<input type="file" id="import" accept="application/json,.json" class="visually-hidden"></label>
      </section>

      <section class="card">
        <h2>Storage</h2>
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
        <h2>Install on your phone</h2>
        <p class="muted"><strong>Android (Chrome):</strong> menu ⋮ → <em>Install app</em> or <em>Add to Home screen</em>.<br>
        <strong>iPhone (Safari):</strong> Share → <em>Add to Home Screen</em>. On iPhone this also keeps your photos from being cleared.</p>
      </section>

      <section class="card">
        <h2>Start over</h2>
        <button type="button" class="btn-secondary danger" data-act="wipe">${icon('trash')} Delete all clothes, outfits and wishes</button>
      </section>
      <p class="muted small center">Minja's Wardrobe v${VERSION} · Background removal by IMG.LY (AGPL)</p>
    </div>
    ${tabbar}`;

  function showLastBackup() {
    const el = root.querySelector('#last-backup');
    const t = lastBackup();
    const due = backupDue(state);
    el.classList.toggle('due', due);
    if (!due) root.querySelectorAll('.tab .dot, .tab .visually-hidden').forEach((d) => d.remove());
    el.textContent = t
      ? `Last backup: ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}${due ? ' — time for a new one' : ''}`
      : state.items.length || state.wishes.length ? 'No backup saved yet.' : 'Nothing to back up yet.';
    root.querySelector('[data-act=export]').disabled = !state.items.length && !state.outfits.length && !state.wishes.length;
  }

  async function showStorage() {
    const usage = root.querySelector('#usage');
    const counts = `${plural(state.items.length, 'piece')}, ${plural(state.outfits.length, 'outfit')} and ${plural(state.wishes.length, 'wish', 'wishes')}`;
    try {
      const est = await navigator.storage?.estimate?.();
      usage.textContent = est ? `${counts}, using ${(est.usage / 1048576).toFixed(1)} MB.` : `${counts}.`;
    } catch { usage.textContent = `${counts}.`; }
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    root.querySelector('#persist-text').textContent = persisted
      ? 'This phone will keep your photos even when space runs low.'
      : 'The browser may clear stored photos when the phone runs low on space.';
    root.querySelector('#persist-btn').hidden = !!persisted || !navigator.storage?.persist;
  }
  showLastBackup();
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
      const wishes = await Promise.all((data.wishes || []).map(async (w) => ({ ...w, image: await dataUrlToBlob(w.image), thumb: await dataUrlToBlob(w.thumb) })));
      await db.putMany('items', items);
      await db.putMany('outfits', outfits);
      await db.putMany('wishes', wishes);
      await reload();
      showLastBackup();
      showStorage();
      toast(`Restored ${plural(items.length, 'piece')}, ${plural(outfits.length, 'outfit')} and ${plural(wishes.length, 'wish', 'wishes')}`);
    } catch (err) {
      console.error(err);
      alert('That file could not be restored. Choose a backup saved by this app.');
    }
  });

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'persist') {
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
    } else if (act === 'export') {
      b.disabled = true;
      try { await exportBackup(); } finally { b.disabled = false; showLastBackup(); }
    } else if (act === 'wipe') {
      if (!confirm('Delete ALL clothes, outfits and wishes from this phone? This cannot be undone.')) return;
      if (state.items.length && !confirm('Last check: do you have a backup? Tap OK to delete everything.')) return;
      await db.clear('items');
      await db.clear('outfits');
      await db.clear('wishes');
      await reload();
      showLastBackup();
      showStorage();
      toast('Everything was deleted');
    }
  };

  async function exportBackup() {
    toast('Preparing backup…', 4000);
    // Built in pieces so a big closet doesn't need one giant string in memory.
    const parts = [`{"app":"wardrobe","version":1,"appVersion":"${VERSION}","exported":"${new Date().toISOString()}","items":[`];
    for (const [k, i] of state.items.entries()) {
      if (k) parts.push(',');
      parts.push(JSON.stringify({ ...i, image: await blobToDataUrl(i.image), thumb: await blobToDataUrl(i.thumb) }));
    }
    parts.push('],"outfits":[');
    for (const [k, o] of state.outfits.entries()) {
      if (k) parts.push(',');
      parts.push(JSON.stringify({ ...o, thumb: await blobToDataUrl(o.thumb) }));
    }
    parts.push('],"wishes":[');
    for (const [k, w] of state.wishes.entries()) {
      if (k) parts.push(',');
      parts.push(JSON.stringify({ ...w, image: await blobToDataUrl(w.image), thumb: await blobToDataUrl(w.thumb) }));
    }
    parts.push(']}');
    const name = `wardrobe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File(parts, name, { type: 'application/json' });
    const mark = () => { try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* ignore */ } };

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Wardrobe backup' });
        mark();
        toast(`Backup saved (${(file.size / 1048576).toFixed(1)} MB)`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    mark();
    toast(`Backup downloaded (${(file.size / 1048576).toFixed(1)} MB)`);
  }

  return () => { root.onclick = null; };
}
