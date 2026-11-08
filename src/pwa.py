"""Baut die Web-App-Ausgabe (PWA) für GitHub Pages:
  site/index.html            Startseite mit Auswahl der Stufe
  site/<stufe>/index.html    App (alles eingebettet, läuft offline)
  site/<stufe>/manifest.webmanifest, sw.js, Icons
Jede Stufe ist eine eigene Home-Bildschirm-App mit eigenem Speicher.
"""
import hashlib, json, os
from PIL import Image, ImageDraw, ImageFont

DIRS = {"sek1": "sek1", "ef": "ef", "q": "q"}
LABEL = {"sek1": "Sek I", "ef": "EF", "q": "Q"}
SHORT = {"sek1": "Sek I mdl.", "ef": "EF mdl.", "q": "Q mdl."}
BLUE = (31, 70, 168)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def icon(path, size, label):
    img = Image.new("RGB", (size, size), BLUE)      # iOS rundet die Ecken selbst ab
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, int(size * (0.30 if len(label) > 2 else 0.40)))
    w = d.textlength(label, font=f)
    d.text(((size - w) / 2, size * 0.24), label, font=f, fill="white")
    f2 = ImageFont.truetype(FONT, int(size * 0.11))
    sub = "mdl. Prüfung"
    w2 = d.textlength(sub, font=f2)
    d.text(((size - w2) / 2, size * 0.68), sub, font=f2, fill=(220, 228, 250))
    img.save(path)

def head(variant, title):
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<link rel="manifest" href="manifest.webmanifest">'
            '<link rel="apple-touch-icon" href="icon-180.png">'
            '<meta name="apple-mobile-web-app-capable" content="yes">'
            '<meta name="mobile-web-app-capable" content="yes">'
            f'<meta name="apple-mobile-web-app-title" content="{SHORT[variant]}">'
            '<meta name="theme-color" content="#1f46a8">'
            '</head><body>')

SW = """// Service Worker: App sofort aus dem Speicher des Geräts starten (offline), im Hintergrund nach einer neuen Version sehen
const CACHE = "mdl-__V__";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function refresh(req, cached) {
  try {
    const res = await fetch(req.url, { cache: "no-store", credentials: "same-origin" });   // Navigationsanfragen lassen sich nicht direkt wiederverwenden
    if (!res || !res.ok) return;
    const c = await caches.open(CACHE);
    const isPage = req.mode === "navigate" || /\\/(index\\.html)?$/.test(new URL(req.url).pathname);
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
"""

INDEX = """<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mündliche Prüfung Englisch – Bewertung</title>
<style>
:root { --paper:#f5f6f8; --sheet:#fff; --ink:#1c2233; --muted:#5d6478; --line:#d6dae4; --blue:#1f46a8; --amber:#8a5a00; }
@media (prefers-color-scheme: dark) { :root { --paper:#12151d; --sheet:#1a1f2b; --ink:#e6e9f2; --muted:#a0a7ba; --line:#2e3546; --blue:#7d9cf0; --amber:#e6b85c; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; }
main { max-width: 40rem; margin: 0 auto; padding: 2rem 16px 3rem; display: grid; gap: 1.2rem; }
h1 { font-size: 1.5rem; margin: 0; }
.apps { display: grid; gap: .75rem; }
a.app { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem 1.1rem; border: 1px solid var(--line); border-radius: 12px; background: var(--sheet); color: var(--ink); text-decoration: none; font-weight: 700; font-size: 1.15rem; }
a.app:hover { border-color: var(--blue); }
a.app span { color: var(--blue); }
.note { color: var(--muted); font-size: .92rem; margin: 0; }
.beta { display:inline-block; font-size:.75rem; font-weight:700; color:var(--amber); border:1px solid var(--amber); border-radius:999px; padding:.05rem .5rem; vertical-align:middle; }
ol { margin: 0; padding-left: 1.2rem; color: var(--muted); font-size: .92rem; }
</style></head><body><main>
<h1>Mündliche Prüfung Englisch <span class="beta">Beta</span></h1>
<div class="apps">
  <a class="app" href="sek1/">Sek I <span>öffnen →</span></a>
  <a class="app" href="ef/">EF <span>öffnen →</span></a>
  <a class="app" href="q/">Q-Phase <span>öffnen →</span></a>
</div>
<p class="note"><b>Auf dem iPad als App ablegen</b> (einmal mit Internet):</p>
<ol><li>Stufe oben antippen.</li><li>In Safari „Teilen“ → „Zum Home-Bildschirm“.</li><li>Ab dann nur noch über das Symbol öffnen – es läuft auch ohne Internet.</li></ol>
<p class="note">Alle Namen und Bewertungen bleiben auf dem jeweiligen Gerät. Hier liegt nur das Programm.</p>
</main></body></html>
"""

def build_site(out, build, variants):
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f: f.write(INDEX)
    open(os.path.join(out, ".nojekyll"), "w").close()
    for v, info in variants.items():
        d = os.path.join(out, DIRS[v]); os.makedirs(d, exist_ok=True)
        title = f'{info["stufe"]} – Bewertung mdl. Prüfung'
        _, page = build(v, skeleton=head(v, title))
        ver = hashlib.sha256(page.encode("utf-8")).hexdigest()[:10]
        assert page.count('const BUILD = "__BUILD__"') == 1
        page = page.replace('const BUILD = "__BUILD__"', f'const BUILD = "{ver}"')
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f: f.write(page)
        with open(os.path.join(d, "sw.js"), "w", encoding="utf-8") as f: f.write(SW.replace("__V__", v + "-" + ver))
        man = {"name": title, "short_name": SHORT[v], "id": f"./?app={v}", "start_url": "./", "scope": "./",
               "display": "standalone", "orientation": "landscape", "background_color": "#f5f6f8", "theme_color": "#1f46a8", "lang": "de",
               "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}]}
        with open(os.path.join(d, "manifest.webmanifest"), "w", encoding="utf-8") as f: json.dump(man, f, ensure_ascii=False, indent=1)
        for s in (180, 192, 512): icon(os.path.join(d, f"icon-{s}.png"), s, LABEL[v])
        print(v, f"{len(page)//1024} KB", ver)
