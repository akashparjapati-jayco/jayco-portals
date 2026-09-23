/* JAYCO Attendance service worker — scope: /jayco-portals/attendance* only (other portals untouched) */
const CACHE = 'jayco-att-v1';
const SHELL = ['attendance.html', 'attendance.webmanifest', 'jayco-att-192.png', 'jayco-att-512.png', 'jayco-att-maskable.png', 'jayco-att-apple.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('attendance.html', c)); return r; })
      .catch(() => caches.match('attendance.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
