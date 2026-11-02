import * as db from './db.js';
import { CATEGORIES, SEASONS, catById, seasonsFromNow, currentSeason } from './constants.js';
import { esc, toast, blobUrl, dropUrl, plural } from './util.js';
import { icon } from './icons.js';
import { colorName, blobToCanvas, fitCanvas, encodeTransparent, dominantColor } from './images.js';
import { renderWishlist, renderWishForm } from './wish.js';
import { renderAdd } from './add.js';
import { renderBuilder, renderOutfitThumb } from './builder.js';
import { renderSettings, backupDue } from './settings.js';
import { VERSION } from './version.js';

const app = document.getElementById('app');
const fileInput = document.getElementById('file-input');
const state = { items: [], outfits: [], wishes: [], filter: 'all', query: '' };
let cleanup = null;
let pendingFile = null;
let pendingTarget = 'add'; // which screen the chosen photo goes to: 'add' (closet) or 'wish/new'

async function reload() {
  const [items, outfits, wishes] = await Promise.all([db.all('items'), db.all('outfits'), db.all('wishes')]);
  state.items = items.sort((a, b) => b.created - a.created);
  state.wishes = wishes.sort((a, b) => b.created - a.created);
  state.outfits = outfits.sort((a, b) => (b.updated || b.created) - (a.updated || a.created));
}

const go = (path) => { location.hash = `#/${path}`; };
const itemMap = () => new Map(state.items.map((i) => [i.id, i]));

function tabbar(active) {
  return `<nav class="tabbar" aria-label="Main">
    <a class="tab" href="#/clothes" ${active === 'clothes' ? 'aria-current="page"' : ''}>${icon('hanger')}Clothes</a>
    <a class="tab" href="#/outfits" ${active === 'outfits' ? 'aria-current="page"' : ''}>${icon('grid')}Outfits</a>
    <a class="tab" href="#/wishlist" ${active === 'wishlist' ? 'aria-current="page"' : ''}>${icon('heart')}Wishlist</a>
    <a class="tab" href="#/settings" ${active === 'settings' ? 'aria-current="page"' : ''}>
      <span class="tab-icon">${icon('settings')}${backupDue(state) ? '<span class="dot" title="Time for a backup"></span>' : ''}</span>Settings${backupDue(state) ? '<span class="visually-hidden"> (time for a backup)</span>' : ''}
    </a>
  </nav>`;
}

// ---------------- Clothes ----------------
function renderClothes() {
  app.className = 'app';
  app.innerHTML = `
    <header class="page-head">
      <h1>Closet</h1>
      <div class="head-actions">
        <span id="count"></span>
      </div>
    </header>
    <div class="search">
      <label for="q" class="visually-hidden">Search clothes</label>
      ${icon('search')}
      <input id="q" type="search" placeholder="Search by name or colour" value="${esc(state.query)}" autocomplete="off">
    </div>
    <div class="chips scroll-x" id="chips"></div>
    <div id="list"></div>
    <button type="button" class="fab" data-act="add" aria-label="Add a piece">${icon('plus')}</button>
    ${tabbar('clothes')}`;

  app.querySelector('#q').addEventListener('input', (e) => { state.query = e.target.value; updateClothes(); });
  app.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') pickPhoto('add');
    else if (act === 'filter') { state.filter = b.dataset.id; updateClothes(); }
    else if (act === 'item') go(`item/${b.dataset.id}`);
  };
  updateClothes();
}

function updateClothes() {
  const q = state.query.trim().toLowerCase();
  const matches = (i) => !q || `${i.name} ${i.colorName} ${catById(i.category)?.label}`.toLowerCase().includes(q);
  const items = state.items.filter(matches);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, items.filter((i) => i.category === c.id).length]));
  app.querySelector('#count').textContent = plural(state.items.length, 'piece');

  const chips = [{ id: 'all', label: 'All', n: items.length }, ...CATEGORIES.filter((c) => counts[c.id] || state.filter === c.id).map((c) => ({ ...c, n: counts[c.id] }))];
  app.querySelector('#chips').innerHTML = chips.map((c) =>
    `<button type="button" class="chip" data-act="filter" data-id="${c.id}" aria-pressed="${state.filter === c.id}">${c.label}<span class="n">${c.n}</span></button>`).join('');

  const tile = (i) => `<button type="button" class="tile" data-act="item" data-id="${i.id}"><img src="${blobUrl(`t:${i.id}`, i.thumb)}" alt="${esc(i.name)}" loading="lazy"></button>`;
  const list = app.querySelector('#list');
  if (!state.items.length) {
    list.innerHTML = `<div class="empty">
      <h2>Your closet is empty</h2>
      <p>Tap <strong>+</strong> to photograph a piece of clothing. The app removes the background for you.</p>
      <p class="small">Tip: lay the piece flat, or hang it against a plain wall, in good light.</p>
    </div>`;
    return;
  }
  if (!items.length) { list.innerHTML = `<div class="empty"><p>Nothing matches “${esc(state.query)}”.</p></div>`; return; }

  const sections = state.filter === 'all'
    ? CATEGORIES.filter((c) => counts[c.id]).map((c) => ({ c, list: items.filter((i) => i.category === c.id), limit: 6 }))
    : [{ c: catById(state.filter), list: items.filter((i) => i.category === state.filter), limit: Infinity }];
  list.innerHTML = sections.map(({ c, list: l, limit }) => `
    <section class="section">
      <div class="section-head">
        <h2>${c.label}<span class="count">${l.length}</span></h2>
        ${l.length > limit ? `<button type="button" class="link-btn" data-act="filter" data-id="${c.id}">See all</button>` : ''}
      </div>
      ${l.length ? `<div class="grid">${l.slice(0, limit).map(tile).join('')}</div>` : '<p class="muted">Nothing here yet.</p>'}
    </section>`).join('');
}

function pickPhoto(target) {
  pendingTarget = target;
  fileInput.value = '';
  fileInput.click();
}
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (!f) return;
  pendingFile = f;
  if (location.hash === `#/${pendingTarget}`) route(); else go(pendingTarget);
});

// ---------------- Outfits ----------------
function renderOutfits() {
  app.className = 'app';
  const now = currentSeason();
  const groups = seasonsFromNow().map((s) => ({ ...s, list: state.outfits.filter((o) => o.seasons?.includes(s.id)) }));
  const anytime = state.outfits.filter((o) => !o.seasons?.length);
  if (anytime.length) groups.push({ id: 'any', label: 'Any season', list: anytime });
  const card = (o) => `<button type="button" class="ocard" data-act="open" data-id="${o.id}">
      <span class="ocard-img"><img src="${blobUrl(`o:${o.id}`, o.thumb)}" alt="" loading="lazy"></span>
      <span class="ocard-name">${esc(o.name)}</span>
      <span class="ocard-meta">${plural(o.pieces.length, 'piece')}</span>
    </button>`;
  app.innerHTML = `
    <header class="page-head">
      <h1>Outfits</h1>
      <div class="head-actions"><span>${plural(state.outfits.length, 'outfit')}</span></div>
    </header>
    ${state.outfits.length ? groups.filter((g) => g.list.length || g.id === now).map((g) => `
      <section class="section flush">
        <div class="section-head pad">
          <h2>${g.label}<span class="count">${g.list.length}</span>${g.id === now ? '<span class="season-badge">This season</span>' : ''}</h2>
        </div>
        ${g.list.length ? `<div class="orow">${g.list.map(card).join('')}</div>` : '<p class="muted pad">No outfits for this season yet.</p>'}
      </section>`).join('') : `<div class="empty">
        <h2>No outfits yet</h2>
        <p>${state.items.length ? 'Tap <strong>New outfit</strong> and put your clothes together.' : 'First add some clothes in the Clothes tab, then build outfits here.'}</p>
      </div>`}
    <button type="button" class="fab wide" data-act="new">${icon('plus')} New outfit</button>
    ${tabbar('outfits')}`;
  app.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'new') go('outfit/new');
    if (b.dataset.act === 'open') go(`outfit/${b.dataset.id}`);
  };
}

// ---------------- Piece detail ----------------
function renderItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) { go('clothes'); return; }
  const usedIn = state.outfits.filter((o) => o.pieces.some((p) => p.itemId === id));
  app.className = 'app no-tabbar';
  app.innerHTML = `
    <div class="topbar">
      <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
      <h1>${esc(catById(item.category)?.label || 'Piece')}</h1><span></span>
    </div>
    <div class="preview checker"><img src="${blobUrl(`i:${item.id}`, item.image)}" alt="${esc(item.name)}"></div>
    <div class="form" style="margin-top:18px">
      <div>
        <label class="field-label" for="name">Name</label>
        <input id="name" class="text-input" type="text" maxlength="60" value="${esc(item.name)}" autocomplete="off">
      </div>
      <div>
        <div class="field-label"><span id="cat-label">Category</span></div>
        <div class="chips wrap" role="group" aria-labelledby="cat-label">
          ${CATEGORIES.map((c) => `<button type="button" class="chip" data-act="cat" data-id="${c.id}" aria-pressed="${c.id === item.category}">${c.label}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="field-label"><span id="season-label">Seasons</span></div>
        <div class="seasons" role="group" aria-labelledby="season-label">
          ${SEASONS.map((s) => `<button type="button" class="chip" data-act="season" data-id="${s.id}" aria-pressed="${item.seasons.includes(s.id)}">${s.label}</button>`).join('')}
        </div>
      </div>
      <div class="color-row">
        <span class="swatch" id="swatch" style="background:${esc(item.color)}"></span>
        <div class="grow"><strong id="color-name">${esc(item.colorName || 'Colour')}</strong></div>
        <label class="link-btn">Change<input type="color" id="color-input" class="visually-hidden" value="${esc(item.color)}"></label>
      </div>
      ${item.link ? `<a class="btn-secondary" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${icon('external')} Shop page</a>` : ''}
      <div>
        <div class="field-label"><span>In outfits</span><small>${plural(usedIn.length, 'outfit')}</small></div>
        ${usedIn.length ? `<div class="mini-row">${usedIn.map((o) => `<button type="button" class="mini" data-act="outfit" data-id="${o.id}" aria-label="${esc(o.name)}"><img src="${blobUrl(`o:${o.id}`, o.thumb)}" alt=""></button>`).join('')}</div>` : '<p class="muted small">Not used in an outfit yet.</p>'}
      </div>
      <button type="button" class="btn-primary" data-act="build">Make an outfit with this</button>
      <button type="button" class="btn-secondary danger" data-act="delete">${icon('trash')} Delete this piece</button>
    </div>`;

  let t;
  const persist = () => {
    clearTimeout(t);
    t = setTimeout(async () => { await db.put('items', item); toast('Saved'); }, 400);
  };
  app.querySelector('#name').addEventListener('input', (e) => { item.name = e.target.value.trim() || item.name; persist(); });
  app.querySelector('#color-input').addEventListener('input', (e) => {
    item.color = e.target.value;
    item.colorName = colorName(item.color);
    app.querySelector('#swatch').style.background = item.color;
    app.querySelector('#color-name').textContent = item.colorName;
    persist();
  });
  app.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') history.length > 1 ? history.back() : go('clothes');
    else if (act === 'cat') {
      item.category = b.dataset.id;
      app.querySelectorAll('[data-act=cat]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === item.category)));
      app.querySelector('.topbar h1').textContent = catById(item.category).label;
      persist();
    } else if (act === 'season') {
      const s = b.dataset.id;
      item.seasons = item.seasons.includes(s) ? item.seasons.filter((x) => x !== s) : SEASONS.map((x) => x.id).filter((x) => x === s || item.seasons.includes(x));
      b.setAttribute('aria-pressed', String(item.seasons.includes(s)));
      persist();
    } else if (act === 'outfit') go(`outfit/${b.dataset.id}`);
    else if (act === 'build') go(`outfit/new/${item.id}`);
    else if (act === 'delete') {
      const msg = usedIn.length
        ? `Delete this piece? It will also be taken out of ${plural(usedIn.length, 'outfit')}.`
        : 'Delete this piece?';
      if (!confirm(msg)) return;
      clearTimeout(t);
      const map = itemMap();
      map.delete(item.id);
      for (const o of usedIn) {
        o.pieces = o.pieces.filter((p) => p.itemId !== item.id);
        o.thumb = await renderOutfitThumb(o, map);
        await db.put('outfits', o);
      }
      await db.remove('items', item.id);
      dropUrl(`t:${item.id}`); dropUrl(`i:${item.id}`);
      await reload();
      toast('Piece deleted');
      go('clothes');
    }
  };
}

// ---------------- Wishlist helpers ----------------
/** A page shared into the app (Android "Share" → Wardrobe), parked by the service worker. */
async function takeShared() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('wardrobe-share');
    const metaRes = await cache.match('shared-meta');
    if (!metaRes) return null;
    const meta = await metaRes.json();
    const imgRes = await cache.match('shared-image');
    await cache.delete('shared-meta');
    await cache.delete('shared-image');
    const { findUrl } = await import('./link.js');
    const url = findUrl(meta.url) || findUrl(meta.text);
    const file = imgRes ? await imgRes.blob() : null;
    return { url, title: meta.title || '', file: file && file.size ? file : null };
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function wishToItem(w) {
  const c = await blobToCanvas(w.image);
  const full = fitCanvas(c, 1000);
  const hex = dominantColor(c);
  return {
    id: w.id,
    name: w.name,
    category: w.category,
    seasons: [],
    color: hex,
    colorName: colorName(hex),
    w: full.width,
    h: full.height,
    image: await encodeTransparent(full),
    thumb: await encodeTransparent(fitCanvas(c, 360)),
    link: w.url || '',
    created: Date.now()
  };
}

// ---------------- Router ----------------
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const [view = 'clothes', id, extra] = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  switch (view) {
    case 'outfits': renderOutfits(); break;
    case 'item': renderItem(id); break;
    case 'settings':
      cleanup = renderSettings(app, { state, reload, tabbar: tabbar('settings') });
      break;
    case 'add': {
      if (!pendingFile) { go('clothes'); return; }
      const file = pendingFile;
      pendingFile = null;
      cleanup = renderAdd(app, file, {
        onCancel: () => go('clothes'),
        onSave: async (item) => {
          await db.put('items', item);
          await reload();
          state.filter = 'all';
          state.query = '';
          toast(`Saved to ${catById(item.category).label}`);
          if (state.items.length === 1) navigator.storage?.persist?.().catch(() => {});
          history.replaceState(null, '', '#/clothes');
          route();
        }
      });
      break;
    }
    case 'wishlist':
      cleanup = renderWishlist(app, {
        wishes: state.wishes,
        tabbar: tabbar('wishlist'),
        onAdd: () => pickPhoto('wish/new'),
        onEdit: (wid) => go(`wish/${wid}`)
      });
      break;
    case 'wish': {
      let wish = null, file = null, shared = null;
      if (id === 'new') {
        file = pendingFile;
        pendingFile = null;
        if (!file) { go('wishlist'); return; }
      } else if (id === 'shared') {
        shared = await takeShared();
        file = shared?.file || null;
        if (!shared) { go('wishlist'); return; }
      } else {
        wish = state.wishes.find((w) => w.id === id);
        if (!wish) { go('wishlist'); return; }
      }
      const back = (msg) => {
        if (msg) toast(msg);
        history.replaceState(null, '', '#/wishlist');
        route();
      };
      cleanup = renderWishForm(app, {
        wish,
        file,
        shared,
        onCancel: () => back(),
        onSave: async (w) => {
          await db.put('wishes', w);
          await reload();
          back(wish ? 'Saved' : 'Added to your wishlist');
        },
        onDelete: async (w) => {
          await db.remove('wishes', w.id);
          dropUrl(`w:${w.id}`);
          await reload();
          back('Removed from the wishlist');
        },
        onMoveToCloset: async (w) => {
          const item = await wishToItem(w);
          await db.put('items', item);
          await db.remove('wishes', w.id);
          dropUrl(`w:${w.id}`);
          await reload();
          toast(`Moved to ${catById(item.category).label}`);
          history.replaceState(null, '', `#/item/${item.id}`);
          route();
        }
      });
      break;
    }
    case 'outfit': {
      const outfit = id === 'new' ? null : state.outfits.find((o) => o.id === id);
      if (id !== 'new' && !outfit) { go('outfits'); return; }
      const done = async (o, msg) => {
        await db.put('outfits', o);
        await reload();
        toast(msg);
        history.replaceState(null, '', '#/outfits');
        route();
      };
      cleanup = renderBuilder(app, {
        outfit,
        items: state.items,
        startItemId: id === 'new' ? extra : null,
        onClose: () => (history.length > 1 ? history.back() : go('outfits')),
        onSave: (o) => done(o, 'Outfit saved'),
        onDuplicate: (o) => done(o, 'Copy saved'),
        onRename: async (name) => {
          outfit.name = name;
          await db.put('outfits', outfit);
          await reload();
          toast('Outfit renamed');
        },
        onDelete: async (o) => {
          await db.remove('outfits', o.id);
          dropUrl(`o:${o.id}`);
          await reload();
          toast('Outfit deleted');
          history.replaceState(null, '', '#/outfits');
          route();
        }
      });
      break;
    }
    default: renderClothes();
  }
}

window.addEventListener('hashchange', route);
document.getElementById('version').textContent = `v${VERSION}`;

(async () => {
  try {
    await reload();
  } catch (err) {
    console.error(err);
    app.innerHTML = '<div class="empty"><h2>Storage is not available</h2><p>Open the app in Chrome or Safari, outside private browsing.</p></div>';
    return;
  }
  route();
})();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // When a new version takes over, reload once so it shows straight away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // An installed app can stay open for days: check for updates when it comes back to the front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('Service worker not registered', e));
}
