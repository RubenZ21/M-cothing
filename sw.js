// Offline support. Online, the app always loads the newest files; the cache is
// only used when the network is unavailable. Bump CACHE with every release.
const CACHE = 'wardrobe-1.18'; // keep in step with js/version.js
const SHELL = [
  // './' is the app page. 'index.html' is deliberately not listed: Cloudflare answers it with a
  // redirect to './', and a redirected answer cannot be served for a page load.
  './', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/add.js', 'js/bg.js', 'js/builder.js', 'js/constants.js', 'js/db.js',
  'js/icons.js', 'js/images.js', 'js/settings.js', 'js/util.js', 'js/version.js', 'js/wish.js', 'js/link.js', 'js/share.js', 'js/backup.js', 'js/palette.js', 'js/categories.js', 'vendor/fflate.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

// The app sits behind Cloudflare Access. When the login has expired, Access answers every
// request with a redirect to its login page instead of the file. Those answers must never go
// into the cache, or the offline copy of the app would be replaced by a login page. So only a
// real, direct answer from this site is cached.
const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never stores old files.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // Only our own old caches: other apps on this site (e.g. the interior app) keep theirs.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wardrobe-') && k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App files: ask the server first (a quick "has it changed?" check), fall back to
// the cache when offline or when the network takes too long.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // Page loads: redirect 'manual' hands a redirect (to './', or to the Access login when the
  // login has expired) back to the browser to follow, instead of failing and showing the cached app.
  const fresh = (req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', redirect: 'manual' })
    : fetch(req, { cache: 'no-cache' })).then((res) => {
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000, null));
  try {
    const res = await Promise.race([fresh, timeout]);
    if (res) return res;
  } catch { /* offline */ }
  const hit = await cache.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' ? await cache.match('./') : null);
  return hit || fresh.catch(() => Response.error());
}

// Fonts rarely change: serve from cache, refresh in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fresh) || (req.mode === 'navigate' ? cache.match('./') : Response.error());
}

// Android: "Share" a shop page (and/or a screenshot) to the installed app.
// The shared data is parked in a cache and the app opens the new-wish screen.
const SHARE_CACHE = 'wardrobe-share';
async function receiveShare(req) {
  const form = await req.formData();
  const cache = await caches.open(SHARE_CACHE);
  const meta = { title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '' };
  await cache.put('shared-meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
  const file = form.getAll('image').find((f) => f && f.size);
  if (file) await cache.put('shared-image', new Response(file, { headers: { 'content-type': file.type || 'image/png' } }));
  else await cache.delete('shared-image');
  return Response.redirect(new URL('./#/wish/shared', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  // Cloudflare Access endpoints (login callback, logout): always straight to the network.
  if (sameOrigin && url.pathname.startsWith('/cdn-cgi/')) return;
  // The background-removal model is cached by its own library; let it pass.
  if (sameOrigin) e.respondWith(networkFirst(req));
  else if (fonts) e.respondWith(staleWhileRevalidate(req));
});
