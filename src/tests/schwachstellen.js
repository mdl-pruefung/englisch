// Prüfungstag-Szenarien: node schwachstellen.js <app.html> <ausgabeordner>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const [FILE, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const note = (k, v) => { R[k] = v; console.log(`• ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`); };
const URL = "file://" + path.resolve(FILE);
const NAMES = Array.from({ length: 27 }, (_, i) => `Muster${String.fromCharCode(65 + (i % 26))}${i}, Kind${i}`).join("\n");

async function setup(page, names = NAMES) {
  await page.goto(URL); await page.waitForSelector("#imp-paste");
  await page.fill("#datum", "2027-03-17"); await page.dispatchEvent("#datum", "change");
  await page.fill("#imp-paste", names); await page.click('[data-act="imp-add"]');
  await page.click('[data-act="auto-groups"]');
}
async function scoreGroup(page, notes1) {
  await page.click('.tab[data-view="run"]');
  const next = await page.evaluate(() => (S.groups.find(g => g.status === "geplant" && g.members.length) || {}).id);
  if (!next) return;
  await page.selectOption("#g-pick", next); await page.click('[data-act="g-start"]');
  for (let g = 0; g < 8; g++) {
    const subs = await page.$$eval(".sub", els => els.map(e => ({ s: e.dataset.sub, done: !!e.querySelector(".pill.done") })));
    const o = subs.find(x => !x.done); if (!o) break; await page.click(`.sub[data-sub="${o.s}"]`);
    const p = o.s.startsWith("t1:") ? 1 : 2; const ids = p === 1 ? [o.s.slice(3)] : await page.$$eval('[data-set^="2|"][data-set$="|inhalt|5"]', els => els.map(e => e.dataset.set.split("|")[1]));
    for (const id of ids) { await page.click(`[data-set="${p}|${id}|inhalt|5"]`); for (const k of ["ks", "au", "ws", "gr"]) { const el = (await page.$$(`[data-set^="${p}|${id}|${k}|"]`))[1]; if ((await el.getAttribute("aria-pressed")) !== "true") await el.click(); }
      if (p === 1 && notes1) await page.fill(`#notes-1-${id}`, notes1); }
  }
}

(async () => {
  // A) Absturz/Akku: siehe crash_test.js
  const browser = await chromium.launch();
  // B) Speichergrenze: Größe einer Prüfung, Grenze des Browserspeichers
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); await setup(page);
    const long = "Inhaltlich gut strukturiert, zahlreiche Beispiele. Sprachlich: einige Fehler bei Zeitformen. ".repeat(4);
    for (let i = 0; i < 9; i++) { await scoreGroup(page, long); await page.click('.tab[data-view="plan"]'); }
    const size = await page.evaluate(() => { let t = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k.length + localStorage.getItem(k).length; } return t; });
    const cap = await page.evaluate(() => { const k = "__probe"; let n = 0, chunk = "x".repeat(1024 * 256); try { for (;;) { localStorage.setItem(k + n, chunk); n++; } } catch (e) {} for (let i = 0; i < n; i++) localStorage.removeItem(k + i); return n * 256 * 1024; });
    note("B1 Speicherbedarf einer vollständig bewerteten Klasse (27 Personen, ausführliche Notizen)", `${Math.round(size / 1024)} KB`);
    note("B2 Platz im Browserspeicher (Chromium, Zeichen)", `${Math.round(cap / 1024 / 1024 * 10) / 10} Mio. Zeichen frei zusätzlich`);
    note("B3 Grob: so viele solcher Klassen passen hinein", Math.floor((cap + size) / size));
    // Was passiert, wenn der Speicher voll ist?
    await page.evaluate(() => { let n = 0; const c = "x".repeat(1024 * 128); try { for (;;) { localStorage.setItem("__voll" + n, c); n++; } } catch (e) {} });
    const id = await page.evaluate(() => S.students[0].id);
    await page.click('.tab[data-view="rev"]'); await page.click(`[data-review="${id}"]`).catch(() => {});
    await page.fill(`#notes-1-${id}`, "Neue Notiz bei vollem Speicher"); await page.waitForTimeout(600);
    note("B4 Anzeige oben bei vollem Speicher", (await page.textContent(".savestate")).trim().replace(/\s+/g, " "));
    await page.screenshot({ path: path.join(OUT, "speicher_voll.png") });
    await ctx.close();
  }
  // C) Zwei Geräte (Erst- und Zweitprüfer:in) mit derselben Prüfung
  {
    const mk = async () => { const c = await browser.newContext({ acceptDownloads: true }); await c.addInitScript({ path: path.join(__dirname, "picker_mock.js") }); return c.newPage(); };
    const a = await mk(), b = await mk();
    await setup(a, "Becker, Ida\nAdler, Tom\nCzerny, Lea\nDahl, Mia\nEngel, Jan\nFink, Ole");
    const dl = async (pg, fn) => { const [d] = await Promise.all([pg.waitForEvent("download"), fn()]); const p = path.join(OUT, Date.now() + "_" + d.suggestedFilename()); await d.saveAs(p); return p; };
    const bk0 = await dl(a, () => a.click("#quick-backup"));
    await b.goto(URL); await b.waitForSelector("#app .card"); await b.setInputFiles("#restore-file", bk0); await b.waitForTimeout(600);
    // beide bewerten parallel unterschiedliche Gruppen
    await scoreGroup(a, "Notiz von Gerät A");
    await b.evaluate(() => { S.groups[0].status = "läuft"; }); await scoreGroup(b, "Notiz von Gerät B"); await b.evaluate(() => { S.groups[0].status = "geplant"; touch(); });
    const bkB = await dl(b, () => b.click("#quick-backup"));
    await a.click('.tab[data-view="plan"]'); await a.setInputFiles("#restore-file", bkB); await a.waitForTimeout(800);
    const dlg = await a.isVisible("#exams-dlg");
    const txt = dlg ? (await a.textContent("#exams-dlg")).replace(/\s+/g, " ").slice(0, 400) : "";
    note("C1 Sicherung von Gerät B auf Gerät A einlesen → Rückfrage?", dlg ? "ja: " + txt : "nein");
    await a.screenshot({ path: path.join(OUT, "zwei_geraete_konflikt.png") });
    const scoredA = await a.evaluate(() => S.students.filter(s => s.t1.inhalt !== null).map(s => s.last));
    note("C2 Bewertete Personen auf A nach Einlesen (Standard: lokalen Stand behalten)", scoredA);
  }
  // F) Sehr lange Notizen und G) besondere Namen im PDF
  {
    const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
    const special = ["Nguyễn, Thị Minh Khai", "Wójcik, Łukasz", "Núñez, Íñigo", "O'Connor, Seán", "von Hohenzollern-Sigmaringen, Charlotte-Sophie Alexandra", "Øster, Bjørn"];
    await setup(page, special.join("\n"));
    const long = "Sehr ausführliche Mitschrift: " + "Die Schülerin argumentiert differenziert und nutzt Beispiele aus dem Unterricht. ".repeat(30);
    await scoreGroup(page, long);
    await page.click('.tab[data-view="res"]');
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click('[data-act="export-print"]')]);
    const p = path.join(OUT, "sonderfaelle_druck.pdf"); await d.saveAs(p);
    const t = require("child_process").execFileSync("pdftotext", [p, "-"]).toString();
    const g = await page.evaluate(() => S.groups[0].members.map(m => { const s = S.students.find(x => x.id === m); return `${s.last}, ${s.first}`; }));
    note("G Besondere Namen im Druck-PDF lesbar", Object.fromEntries(g.map(n => [n, t.replace(/\s+/g, " ").includes(n)])));
    const fitTxt = await page.evaluate(() => { const st = S.students.find(s => s.t1.notes.length > 500); return st ? fitText(st.t1.notes, 1).txt : ""; });
    note("F1 Hinweis der App bei sehr langer Notiz (Teil 1)", fitTxt);
    const lastWords = "Beispiele aus dem Unterricht.";
    const pages1 = require("child_process").execFileSync("pdftotext", ["-f", "1", "-l", "1", p, "-"]).toString();
    note("F2 Ende der langen Notiz noch im PDF sichtbar (Seite 1)", pages1.replace(/\s+/g, " ").trim().endsWith(lastWords) || pages1.split("Unterricht").length - 1);
    require("child_process").execFileSync("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-png", p, path.join(OUT, "lange_notiz")]);
    // H) Doppelklick auf Export
    let n = 0; page.on("download", () => n++);
    await page.dblclick('[data-act="export-zip"]'); await page.waitForTimeout(6000);
    note("H Doppelklick auf „Einzelne PDF-Bögen (ZIP)“ → Anzahl Downloads", n);
    await ctx.close();
  }
  // I/L) Kleine Bildschirme bzw. Windows-Skalierung 150 %
  for (const [w, h, label] of [[1366, 768, "Laptop 1366×768"], [1280, 720, "1280×720"], [910, 600, "1366 px mit 150 % Skalierung"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    await setup(page, "Becker, Ida\nAdler, Tom\nCzerny, Lea\nDahl, Mia");
    await page.evaluate(() => { S.groups[0].members = S.students.map(s => s.id); S.groups = [S.groups[0]]; render(); });
    await page.click('.tab[data-view="run"]'); await page.click('[data-act="g-start"]'); await page.click('.sub[data-sub="t2"]');
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const colW = await page.$eval(".cols .pcol", e => Math.round(e.getBoundingClientRect().width));
    note(`I ${label}: Teil 2 mit 4 Personen – seitliches Scrollen / Spaltenbreite`, `${over ? "JA" : "nein"} / ${colW} px`);
    await page.screenshot({ path: path.join(OUT, `teil2_${w}x${h}.png`) });
    await ctx.close();
  }
  // J) Langsamer Rechner (Energiesparmodus, alter Laptop): Druck-PDF für 27 Personen mit 6-fach gedrosselter CPU
  {
    const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage(); await setup(page);
    for (let i = 0; i < 9; i++) { await scoreGroup(page, "kurz"); await page.click('.tab[data-view="plan"]'); }
    await page.click('.tab[data-view="res"]');
    const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    let t0 = Date.now(); await Promise.all([page.waitForEvent("download", { timeout: 600000 }), page.click('[data-act="export-print"]')]); const tPrint = (Date.now() - t0) / 1000;
    t0 = Date.now(); await Promise.all([page.waitForEvent("download", { timeout: 600000 }), page.click('[data-act="export-zip"]')]); const tZip = (Date.now() - t0) / 1000;
    note("J Dauer bei 6-fach gedrosselter CPU (27 Bögen): Druck-PDF / ZIP", `${tPrint.toFixed(0)} s / ${tZip.toFixed(0)} s`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, "ergebnisse.json"), JSON.stringify(R, null, 1));
  await browser.close();
})().catch(e => { console.error("ABBRUCH", e); process.exit(2); });
