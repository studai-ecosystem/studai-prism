// Prism service worker — the minimum for an installable app window.
//
// Deliberately conservative: NOTHING under /api is ever intercepted or cached
// (the server is the source of truth for every score-adjacent byte), non-GET
// requests pass straight through, and navigation/asset requests are
// network-first with a cache fallback so a flaky connection can still paint
// the shell. No offline assessment: the room requires the server, honestly.

const CACHE = 'prism-shell-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))).then(() => self.clients.claim()),
    ),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // NEVER touch the API

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
  )
})
