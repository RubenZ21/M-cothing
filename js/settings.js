// Settings tab: backup and restore, storage safety, background-removal quality.
import * as db from './db.js';
import { icon } from './icons.js';
import { toast, plural } from './util.js';
import { MODELS, getModel, setModel, preloadModel } from './bg.js';
import { buildBackupZip, readBackup } from './backup.js';
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
        <p class="muted">All clothes, photos, outfits, wishes and your palette live only on this phone. If the phone is lost or broken, they are gone, unless you have a backup.</p>
        <p class="muted">The backup is one <strong>.zip</strong> file with all pictures and details. <strong>Save it on this phone</strong> (Downloads folder), and now and then <strong>send a copy</strong> to Google Drive or your email, so it survives if the phone is lost. To move to a new phone, open the app there and restore the file.</p>
        <p id="last-backup" class="backup-status"></p>
        <button type="button" class="btn-primary" data-act="save-backup">${icon('download')} Save backup on this phone</button>
        <button type="button" class="btn-secondary" data-act="send-backup" id="send-backup">${icon('share')} Send backup to… (Drive, email)</button>
        <label class="btn-secondary">${icon('upload')} Restore from a backup<input type="file" id="import" accept=".zip,application/zip,application/x-zip-compressed,application/json,.json" class="visually-hidden"></label>
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
        <h2>Clothing categories</h2>
        <p class="muted">Rename, add, remove or reorder the categories (Tops, Blouses, Jackets …).</p>
        <a class="btn-secondary" href="#/categories">${icon('pencil')} Edit categories</a>
      </section>

      <section class="card">
        <h2>Start over</h2>
        <button type="button" class="btn-secondary danger" data-act="wipe">${icon('trash')} Delete everything (clothes, outfits, wishes, palette)</button>
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
    const empty = !state.items.length && !state.outfits.length && !state.wishes.length;
    root.querySelector('[data-act=save-backup]').disabled = empty;
    root.querySelector('[data-act=send-backup]').disabled = empty;
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
      toast('Reading backup…', 4000);
      const { items, outfits, wishes, palette, categories } = await readBackup(file);
      if (palette) await db.put('palette', palette);
      if (categories?.length) await db.put('meta', { id: 'categories', list: categories });
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
    } else if (act === 'save-backup' || act === 'send-backup') {
      b.disabled = true;
      try {
        await (act === 'save-backup' ? saveOnPhone() : sendTo());
      } catch (err) {
        console.error(err);
        alert('The backup could not be made. The phone may be short on memory or storage.');
      } finally { b.disabled = false; showLastBackup(); }
    } else if (act === 'wipe') {
      if (!confirm('Delete ALL clothes, outfits, wishes and the palette from this phone? This cannot be undone.')) return;
      if (state.items.length && !confirm('Last check: do you have a backup? Tap OK to delete everything.')) return;
      await db.clear('items');
      await db.clear('outfits');
      await db.clear('wishes');
      await db.clear('palette');
      await db.clear('meta');
      await reload();
      showLastBackup();
      showStorage();
      toast('Everything was deleted');
    }
  };

  // A zip made but not shared yet: the share menu may only open right after a tap,
  // so if building the zip took too long, the next tap shares this one.
  let readyZip = null;

  async function makeZip() {
    if (readyZip) { const f = readyZip; readyZip = null; return f; }
    toast('Preparing backup…', 6000);
    return buildBackupZip(state);
  }
  const mark = () => { try { localStorage.setItem(LAST_BACKUP_KEY, String(Date.now())); } catch { /* ignore */ } };
  const mb = (f) => `${(f.size / 1048576).toFixed(1)} MB`;

  /** Saves the zip straight into the phone's Downloads folder. */
  async function saveOnPhone() {
    const file = await makeZip();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    mark();
    toast(`Saved in Downloads: ${file.name} (${mb(file)}). On Samsung: My Files → Downloads.`, 7000);
  }

  /** Opens the share menu (Google Drive, email, WhatsApp …) with the zip. */
  async function sendTo() {
    const file = await makeZip();
    if (!navigator.canShare?.({ files: [file] })) {
      readyZip = file;
      await saveOnPhone();
      return;
    }
    try {
      await navigator.share({ files: [file], title: 'Wardrobe backup' });
      mark();
      toast(`Backup sent (${mb(file)})`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.name === 'NotAllowedError') { readyZip = file; toast('Backup ready. Tap “Send backup to…” again', 5000); return; }
      console.warn('Share failed', err);
      readyZip = file;
      await saveOnPhone();
    }
  }

  return () => { root.onclick = null; };
}
