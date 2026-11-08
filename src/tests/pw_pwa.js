// PWA-Test: node pw_pwa.js <site-ordner> <port>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http");
const [SITE, PORT] = [process.argv[2], Number(process.argv[3] || 8790)];
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log("OK   " + n); } else { fail++; console.log("FAIL " + n + (i ? "  →  " + i : "")); } };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(SITE, p);
  if (!f.startsWith(path.resolve(SITE)) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(`http://localhost:${PORT}/`);
  check("Startseite mit drei Stufen", (await page.$$("a.app")).length === 3);
  for (const v of ["sek1", "ef", "q"]) {
    await page.goto(`http://localhost:${PORT}/${v}/`); await page.waitForSelector("#app .card");
    const man = await page.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json()));
    check(`${v}: Manifest geladen`, man.display === "standalone" && man.icons.length === 2, man.name);
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.scope; });
    check(`${v}: Service Worker aktiv`, sw && sw.endsWith(`/${v}/`), sw);
  }
  // Daten anlegen, dann offline neu laden
  await page.goto(`http://localhost:${PORT}/sek1/`); await page.waitForSelector("#app .card");
  await page.reload(); await page.waitForSelector("#app .card");
  check("Seite wird vom Service Worker ausgeliefert", await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.fill("#imp-paste", "Becker, Ida\nAdler, Tom\nCzerny, Lea"); await page.click('[data-act="imp-add"]');
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector("#app .card");
  check("Offline: App startet", (await page.textContent("#app")).includes("3 Namen"));
  await page.click('[data-act="auto-groups"]');
  check("Offline: Bedienung funktioniert", (await page.$$(".gcard[data-drop]:not(.pool)")).length >= 1);
  const persistLine = await page.evaluate(() => { const el = [...document.querySelectorAll("p")].find(p => /Speicherschutz/.test(p.textContent)); return el ? el.textContent : ""; });
  check("Speicherschutz-Zeile in „Sicherung“", /Speicherschutz auf diesem Gerät: (aktiv|nicht aktiv)/.test(persistLine), persistLine);
  // Update: neue Version auf dem Server
  await ctx.setOffline(false);
  const f = path.join(SITE, "sek1", "index.html"); const orig = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, orig.replace("</body></html>", "<!-- neu --></body></html>").replace(/const BUILD = "[^"]+"/, 'const BUILD = "test-neu"'));   // wie bei einer echten neuen Version
  await page.reload(); await page.waitForSelector("#app .card");
  const bar = await page.waitForSelector("#update-bar", { timeout: 15000 }).catch(() => null);
  check("Neue Version: Hinweis erscheint", !!bar);
  if (bar) { await page.click("#update-later"); check("„Später“ blendet aus", !(await page.$("#update-bar"))); }
  await page.reload(); await page.waitForSelector("#app .card");
  check("Nach Neuladen läuft die neue Version", (await page.content()).includes("<!-- neu -->"));
  check("Daten bleiben beim Update erhalten", (await page.textContent("#app")).includes("3 Namen"));
  fs.writeFileSync(f, orig);
  check("Keine JS-Fehler", errs.length === 0, errs.join(" | "));
  await browser.close(); srv.close();
  console.log(`\n${ok} OK, ${fail} FAIL`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(2); });
