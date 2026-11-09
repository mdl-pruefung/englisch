// Service Worker: App sofort aus dem Speicher des Geräts starten (offline), im Hintergrund nach einer neuen Version sehen
const CACHE = "mdl-q-6ac9d48146";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function refresh(req, cached) {
  try {
    const res = await fetch(req.url, { cache: "no-store", credentials: "same-origin" });   // Navigationsanfragen lassen sich nicht direkt wiederverwenden
    if (!res || !res.ok) return;
    const c = await caches.open(CACHE);
    const isPage = req.mode === "navigate" || /\/(index\.html)?$/.test(new URL(req.url).pathname);
    if (isPage && cached) {
      const [a, b] = await Promise.all([res.clone().text(), cached.clone().text()]);
      if (a === b) return;
      await c.put(req.url, res);
      const all = await self.clients.matchAll();
      all.forEach(cl => cl.postMessage({ type: "updated" }));
    } else await c.put(req.url, res);
  } catch (e) { /* offline – kein Problem */ }
}
// Seite meldet beim Start ihre Version; liegt im Speicher schon eine neuere, Bescheid geben
self.addEventListener("message", e => {
  if (!e.data || e.data.type !== "hello") return;
  e.waitUntil((async () => {
    const r = (await caches.match("./")) || (await caches.match("./index.html")); if (!r) return;
    const m = /const BUILD = "([^"]+)"/.exec(await r.text());
    if (m && m[1] !== e.data.build && e.source) e.source.postMessage({ type: "updated" });
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) { e.waitUntil(refresh(req, cached.clone())); return cached; }   // Kopie vor der Auslieferung – der Inhalt lässt sich nur einmal lesen
    try { const res = await fetch(req); if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); } return res; }
    catch (err) { return (await caches.match("./index.html")) || Response.error(); }
  })());
});
