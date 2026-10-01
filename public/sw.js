// Minimal service worker — enables install prompts and offline shell caching.
const CACHE = 'squareone-v2'
const SHELL = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

// Network-first, cache fallback — the app always prefers fresh data.
// When offline, a page may be served from cache ONLY under its own URL;
// a page we never cached gets an honest offline notice. (The old worker
// fell back to the cached homepage for ANY failed page, which dressed
// the store's landing page up under /admin URLs during network blips
// and read as "the dashboard is broken".)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(event.request)
        if (hit) return hit
        if (event.request.mode === 'navigate') {
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>'
            + '<body style="margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;color:#182740;background:#f7f9fc">'
            + '<div style="padding:24px"><p style="font-size:19px;font-weight:800;margin:0 0 6px">You&rsquo;re offline</p>'
            + '<p style="font-size:14px;color:#64748c;margin:0 0 16px;line-height:1.5">SquareOne couldn&rsquo;t be reached &mdash; check your connection, then try again.</p>'
            + '<button onclick="location.reload()" style="font:inherit;font-weight:600;color:#fff;background:#2f6db8;border:none;border-radius:10px;padding:10px 22px;cursor:pointer">Retry</button></div>',
            { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
          )
        }
        return Response.error()
      })
  )
})
