// v0.2: network-first. The cache is only an offline fallback, so an updated
// app.js / styles.css reaches the phone on the next online visit.
const CACHE = 'fx-dashboard-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './assets/icon.svg', './manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // One last-good copy per file, not one copy per cache-busting query (?v=...).
  url.search = '';
  const key = url.href;
  event.respondWith(
    // no-cache: 휴대전화 브라우저에 남은 옛 파일을 쓰지 않고 서버에 바뀌었는지 먼저 묻는다 (v3)
    (req.mode === 'navigate' ? fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}) : fetch(req, {cache: 'no-cache'})).then(res => {
      if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put(key, copy))); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || Response.error()))
  );
});
