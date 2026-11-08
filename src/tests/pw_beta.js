// Beta-Tests: node pw_beta.js <beta-offline.html> <sek1|ef|q> <ausgabeordner> [<v1.0-offline.html>]
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const [file, VAR, OUT, V10] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fail = 0;
const check = (name, cond, info) => { if (cond) { ok++; console.log("OK   " + name); } else { fail++; console.log("FAIL " + name + (info ? "  →  " + info : "")); } };
const IS_BETA = /Beta_/.test(path.basename(file));   // Beta-Ausgabe oder normale Teams-Ausgabe
const url = f => "file://" + path.resolve(f);
const NAMES = "Becker, Ida\nAdler, Tom\nCzerny, Lea\nDahl, Mia\nEngel, Jan\nFink, Ole\nGraf, Pia";

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true, locale: "de-DE", viewport: { width: 1366, height: 900 } }, opts));
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") page.errors.push(m.text()); });
  return { ctx, page };
}
async function download(page, fn) {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), fn()]);
  const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p); return p;
}
const tap = async (page, sel, touch) => { if (sel.startsWith("[data-set") && (await page.getAttribute(sel, "aria-pressed")) === "true") return; return touch ? page.tap(sel) : page.click(sel); };

async function scoreAll(page, touch) {
  // alle offenen Teil-1-Reiter und Teil 2 vollständig bewerten (mittlere Werte)
  for (let guard = 0; guard < 12; guard++) {
    const subs = await page.$$eval(".sub", els => els.map(e => ({ s: e.dataset.sub, done: !!e.querySelector(".pill.done") })));
    const open = subs.find(x => !x.done);
    if (!open) break;
    await tap(page, `.sub[data-sub="${open.s}"]`, touch);
    if (open.s.startsWith("t1:")) {
      const id = open.s.slice(3);
      await tap(page, `[data-set="1|${id}|inhalt|7"]`, touch);
      for (const k of ["ks", "au", "ws", "gr"]) await tap(page, `[data-set="1|${id}|${k}|3"]`, touch);
    } else {
      const ids = await page.$$eval('[data-set^="2|"][data-set$="|inhalt|7"]', els => els.map(e => e.dataset.set.split("|")[1]));
      for (const id of ids) {
        await tap(page, `[data-set="2|${id}|inhalt|7"]`, touch);
        for (const k of ["ks", "au", "ws", "gr"]) await tap(page, `[data-set="2|${id}|${k}|3"]`, touch);
      }
    }
  }
}

(async () => {
  const browser = await chromium.launch();
  // ---------- Laptop ----------
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(url(file));
    await page.waitForSelector("#app .card");
    check(IS_BETA ? "Titel mit (Beta)" : "Titel ohne Beta", /\(Beta\)/.test(await page.title()) === IS_BETA, await page.title());
    check(IS_BETA ? "Beta-Kennzeichen sichtbar" : "Kein Beta-Kennzeichen", (await page.isVisible(".pill.beta")) === IS_BETA);
    check("Keine Hinweise am Prüfungsnamen", !(await page.getAttribute("#exam-chip", "title")));
    await page.fill("#imp-paste", NAMES);
    await page.click('[data-act="imp-add"]');
    check("7 Namen übernommen", (await page.textContent("#app")).includes("7 Namen"));
    check("Gruppe 1 ist ohne „+ Gruppe“ schon da", (await page.$$eval(".gcard[data-drop]:not(.pool) .gname", els => els.map(e => e.textContent))).join("|") === "Gruppe 1");
    const exp = { sek1: ["08:00", "08:25"], ef: ["08:20", "08:40"], q: ["08:30", "09:00"] }[VAR];
    await page.click('.gcard[data-drop]:not(.pool) input[data-gf$="|time"]');
    await page.keyboard.press("Escape");
    const t1 = await page.$eval('.gcard[data-drop]:not(.pool) input[data-gf$="|time"]', e => e.value), e1 = await page.$eval('.gcard[data-drop]:not(.pool) input[data-gf$="|end"]', e => e.value);
    check("Leeres Beginn-Feld: Vorschlag + passendes Ende", t1 === exp[0] && e1 === exp[1], `${t1}–${e1}`);
    await page.click('[data-act="add-group"]');
    await page.click('.gcard[data-drop]:not(.pool):nth-child(2) input[data-gf$="|time"]');
    const t2 = await page.$eval('.gcard[data-drop]:not(.pool):nth-child(2) input[data-gf$="|time"]', e => e.value);
    check("Gruppe 2: Beginn im Anschluss an Gruppe 1", t2 === exp[1], t2);
    await page.click('.gcard[data-drop]:not(.pool):nth-child(2) [data-act="gdel"]');
    await page.fill('.gcard[data-drop]:not(.pool) input[data-gf$="|time"]', "09:00"); await page.dispatchEvent('.gcard[data-drop]:not(.pool) input[data-gf$="|time"]', "change");
    const e9 = await page.$eval('.gcard[data-drop]:not(.pool) input[data-gf$="|end"]', e => e.value);
    check("Beginn geändert: Ende rückt mit", e9 === { sek1: "09:25", ef: "09:20", q: "09:30" }[VAR], e9);
    await page.click('.gcard[data-drop]:not(.pool) [data-act="gdel"]');
    check("Letzte Gruppe gelöscht: leere Gruppe 1 bleibt", (await page.$$(".gcard[data-drop]:not(.pool)")).length === 1);
    await page.click('[data-act="auto-groups"]');
    const groups = await page.$$eval(".gcard[data-drop]:not(.pool)", els => els.length);
    check("Zufallsgruppen erstellt", groups >= 2, groups);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    check(IS_BETA ? "Eigener Beta-Speicher" : "Speicher wie Version 1.0", keys.length > 0 && keys.every(k => k.includes(".beta.") === IS_BETA), keys.join(", "));

    // Antippen zum Verschieben
    const g1 = await page.$$eval(".gcard[data-drop]:not(.pool)", els => els.map(e => e.dataset.drop));
    const first = await page.$eval(`.gcard[data-drop="${g1[0]}"] [data-pick]`, e => e.dataset.pick);
    await page.click(`[data-pick="${first}"] .cn`);
    check("Name angetippt: hervorgehoben + Hinweiszeile", await page.isVisible(".pickbar") && await page.isVisible(`.chip.picked[data-pick="${first}"]`));
    check("Hinweiszeile nennt Namen", /verschieben: Gruppe antippen/.test(await page.textContent(".pickbar")));
    await page.click(`.gcard[data-drop="${g1[1]}"] .gname`);
    const inG2 = await page.$(`.gcard[data-drop="${g1[1]}"] [data-pick="${first}"]`);
    check("Name in angetippte Gruppe verschoben", !!inG2 && !(await page.isVisible(".pickbar")));
    await page.click(`[data-pick="${first}"] .cn`);
    await page.click('[data-act="pick-cancel"]');
    check("Abbrechen hebt Auswahl auf", !(await page.isVisible(".pickbar")) && !!(await page.$(`.gcard[data-drop="${g1[1]}"] [data-pick="${first}"]`)));
    await page.click(`[data-pick="${first}"] .cn`); await page.keyboard.press("Escape");
    check("Escape hebt Auswahl auf", !(await page.isVisible(".pickbar")));
    await page.click(`[data-pick="${first}"] .cn`); await page.click(".gcard.pool .gname");
    check("In „Noch ohne Gruppe“ verschiebbar", !!(await page.$(`.gcard.pool [data-pick="${first}"]`)));
    await page.click(`[data-pick="${first}"] .cn`); await page.click(`.gcard[data-drop="${g1[0]}"] .gname`);
    await page.click(`[data-pick="${first}"] .cn`); await page.click(`[data-pick="${first}"] .cn`);
    check("Zweites Antippen hebt Auswahl auf", !(await page.isVisible(".pickbar")));
    await page.click(`[data-pick="${first}"] .cn`); await page.click('.tab[data-view="res"]');
    check("Reiterwechsel während Auswahl funktioniert", (await page.getAttribute('.tab[data-view="res"]', "aria-selected")) === "true");
    await page.click('.tab[data-view="plan"]');
    check("Auswahl nach Reiterwechsel aufgehoben", !(await page.isVisible(".pickbar")));
    await page.click(`[data-pick="${first}"] .cn`); await page.click("#imp-open, [data-act=imp-open]");
    check("Andere Aktion während Auswahl wird ausgeführt", await page.isVisible("#imp-paste") && !(await page.isVisible(".pickbar")));
    await page.click('[data-act="imp-close"]');

    // Ziehen funktioniert weiterhin
    const dragId = await page.$eval(`.gcard[data-drop="${g1[1]}"] [data-pick]`, e => e.dataset.pick);
    await page.dragAndDrop(`[data-pick="${dragId}"] .cn`, `.gcard[data-drop="${g1[0]}"] .gname`);
    check("Ziehen funktioniert weiterhin", !!(await page.$(`.gcard[data-drop="${g1[0]}"] [data-pick="${dragId}"]`)));

    // Hinweise beim Darüberfahren in der Planung
    const planTitles = await page.$$eval("#app [title]", els => els.map(e => e.getAttribute("title")));
    check("Planung: keine überflüssigen Hinweise", planTitles.length === 0, planTitles.join(" | "));

    await page.fill("#datum", "2027-05-14"); await page.dispatchEvent("#datum", "change");
    // Prüfung
    await page.click('.tab[data-view="run"]');
    await page.click('[data-act="g-start"]');
    // Teil 2: Beschreibung erscheint erst nach Auswahl
    await page.click('.sub[data-sub="t2"]');
    const emptyDesc = await page.$$eval(".crit-sel", els => els.every(e => e.textContent.trim() === ""));
    check("Teil 2: ohne Auswahl keine Beschreibung", emptyDesc);
    const sid = await page.$eval('[data-set^="2|"][data-set$="|ws|3"]', e => e.dataset.set.split("|")[1]);
    await page.click(`[data-set="2|${sid}|ws|3"]`);
    const desc = await page.$eval(`[data-set="2|${sid}|ws|3"]`, e => e.closest(".crit").querySelector(".crit-sel").textContent.trim());
    const tip = await page.getAttribute(`[data-set="2|${sid}|ws|3"]`, "title");
    check("Teil 2: Beschreibung der gewählten Punktzahl", desc.length > 20 && desc === tip, desc.slice(0, 60));
    await page.click(`[data-set="2|${sid}|inhalt|8"]`);
    const d8 = await page.$eval(`[data-set="2|${sid}|inhalt|8"]`, e => e.closest(".crit").querySelector(".crit-sel").textContent.trim());
    check("Teil 2: Zwischenwert erklärt", d8 === "Zwischenwert ohne eigene Beschreibung", d8);
    await page.click(`[data-set="2|${sid}|inhalt|8"]`);
    const d8off = await page.$eval(`[data-set="2|${sid}|inhalt|8"]`, e => e.closest(".crit").querySelector(".crit-sel").textContent.trim());
    check("Teil 2: Abwählen leert die Beschreibung", d8off === "");
    await scoreAll(page, false);
    const runTitles = await page.$$eval("#app [title]:not(.pt)", els => els.map(e => e.getAttribute("title")));
    check("Prüfung: nur gewollte Hinweise", runTitles.every(t => /Anlage 19/.test(t)), runTitles.join(" | "));
    check("Gruppe vollständig bewertet", await page.isVisible(".done-row .pill.done"), JSON.stringify(await page.$$eval(".sub", els => els.map(e => e.textContent.trim()))));

    // Ergebnisse + Exporte
    await page.click('.tab[data-view="res"]');
    const resTitles = await page.$$eval("#app [title]", els => els.map(e => e.getAttribute("title")));
    check("Ergebnisse: keine Hinweise", resTitles.length === 0, resTitles.join(" | "));
    const xl = await download(page, () => page.click('[data-act="export-xlsx"]'));
    check("Excel-Liste erzeugt", fs.statSync(xl).size > 3000, path.basename(xl));
    const zip = await download(page, () => page.click('[data-act="export-zip"]'));
    check("PDF-ZIP erzeugt", fs.statSync(zip).size > 50000, path.basename(zip));

    // Daten-Backup
    const bk = await download(page, () => page.click("#quick-backup"));
    const B = JSON.parse(fs.readFileSync(bk, "utf8"));
    check("Backup: Format 3, richtige App", B.format === 3 && B.app === { sek1: "mdl-sek1", ef: "mdl-ef", q: "mdl-q" }[VAR], `${B.format} ${B.app}`);
    fs.writeFileSync(path.join(OUT, "backup.json"), JSON.stringify(B));
    // neuere Version wird abgelehnt
    const B4 = Object.assign({}, B, { format: 4 }); const f4 = path.join(OUT, "backup_format4.json"); fs.writeFileSync(f4, JSON.stringify(B4));
    await page.setInputFiles("#restore-file", f4).catch(async () => { await page.click('.tab[data-view="plan"]'); await page.setInputFiles("#restore-file", f4); });
    await page.waitForTimeout(500);
    const bt = await page.textContent("body");
    check("Sicherung aus neuerer Version abgelehnt", /neueren Version der App/.test(bt));
    check("Laptop: keine JS-Fehler", page.errors.length === 0, page.errors.join(" | "));
    await ctx.close();
  }
  // ---------- Frischer Browser: Backup einlesen (Beta) ----------
  {
    const { ctx, page } = await newPage(browser);
    await page.goto(url(file)); await page.waitForSelector("#app .card");
    await page.click('.tab[data-view="plan"]');
    await page.setInputFiles("#restore-file", path.join(OUT, "backup.json"));
    await page.waitForTimeout(800);
    check("Beta liest eigenes Backup", (await page.textContent("body")).includes("1 neu"));
    check("Wiederhergestellt: 7 Namen", (await page.textContent("#app")).includes("7 Namen"));
    await ctx.close();
  }
  // ---------- Version 1.0 liest Beta-Backup ----------
  if (V10) {
    const { ctx, page } = await newPage(browser);
    await page.goto(url(V10)); await page.waitForSelector("#app .card");
    await page.setInputFiles("#restore-file", path.join(OUT, "backup.json"));
    await page.waitForTimeout(800);
    check("Version 1.0 liest Beta-Backup", (await page.textContent("body")).includes("1 neu"));
    check("1.0: wiederhergestellt mit 7 Namen", (await page.textContent("#app")).includes("7 Namen"));
    check("1.0: keine JS-Fehler", page.errors.length === 0, page.errors.join(" | "));
    await ctx.close();
  }
  // ---------- iPad (Touch) ----------
  {
    const { ctx, page } = await newPage(browser, Object.assign({}, devices["iPad Pro 11 landscape"], { acceptDownloads: true, locale: "de-DE" }));
    await page.goto(url(file)); await page.waitForSelector("#app .card");
    await page.fill("#imp-paste", NAMES); await page.tap('[data-act="imp-add"]');
    await page.tap('.gcard[data-drop]:not(.pool) input[data-gf$="|time"]');
    const it = await page.$eval('.gcard[data-drop]:not(.pool) input[data-gf$="|time"]', e => e.value);
    check("iPad: Antippen des leeren Beginns setzt Vorschlag", /^0[89]:\d\d$/.test(it), it);
    await page.tap('[data-act="auto-groups"]');
    const g = await page.$$eval(".gcard[data-drop]:not(.pool)", els => els.map(e => e.dataset.drop));
    const who = await page.$eval(`.gcard[data-drop="${g[0]}"] [data-pick]`, e => e.dataset.pick);
    await page.tap(`[data-pick="${who}"] .cn`); await page.tap(`.gcard[data-drop="${g[1]}"] .gname`);
    check("iPad: Verschieben per Antippen", !!(await page.$(`.gcard[data-drop="${g[1]}"] [data-pick="${who}"]`)));
    const xb = await page.$eval(".chip button", e => e.getBoundingClientRect().height);
    check("iPad: ×-Knöpfe größer (≥ 30 px)", xb >= 30, xb);
    const sm = await page.$eval('.btn.sm[data-act="gdel"]', e => e.getBoundingClientRect().height);
    check("iPad: kleine Knöpfe ≥ 40 px hoch", sm >= 40, sm);
    await page.tap('.tab[data-view="run"]'); await page.tap('[data-act="g-start"]');
    await page.tap('.sub[data-sub="t2"]');
    const pt = await page.$eval(".mini .pt", e => e.getBoundingClientRect().height);
    check("iPad: Punktknöpfe ≥ 44 px", pt >= 44, pt);
    const cols = await page.$eval(".cols", e => getComputedStyle(e).gridTemplateColumns.split(" ").length);
    check("iPad quer: Teil-2-Spalten nebeneinander", cols >= 2, cols);
    await scoreAll(page, true);
    check("iPad: Gruppe per Antippen vollständig bewertet", await page.isVisible(".done-row .pill.done"));
    check("iPad: kein seitliches Scrollen", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.waitForTimeout(200);
    check("iPad hoch: kein seitliches Scrollen", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check("iPad: keine JS-Fehler", page.errors.length === 0, page.errors.join(" | "));
    await ctx.close();
  }
  // ---------- Q-Phase: „gekappt“ antippbar ----------
  if (VAR === "q") {
    const { ctx, page } = await newPage(browser);
    await page.goto(url(file)); await page.waitForSelector("#app .card");
    await page.fill("#imp-paste", "Becker, Ida\nAdler, Tom"); await page.click('[data-act="imp-add"]');
    await page.click('[data-act="auto-groups"]');
    await page.click('.tab[data-view="run"]'); await page.click('[data-act="g-start"]');
    for (let guard = 0; guard < 6; guard++) {
      const subs = await page.$$eval(".sub", els => els.map(e => ({ s: e.dataset.sub, done: !!e.querySelector(".pill.done") })));
      const open = subs.find(x => !x.done); if (!open) break;
      await page.click(`.sub[data-sub="${open.s}"]`);
      const top = async (part, id, k) => { const el = (await page.$$(`[data-set^="${part}|${id}|${k}|"]`))[0]; if ((await el.getAttribute("aria-pressed")) !== "true") await el.click(); };
      if (open.s.startsWith("t1:")) { const id = open.s.slice(3); await page.click(`[data-set="1|${id}|inhalt|1"]`); for (const k of ["ks", "au", "ws", "gr"]) await top(1, id, k); }
      else { const ids = await page.$$eval('[data-set^="2|"][data-set$="|inhalt|1"]', els => els.map(e => e.dataset.set.split("|")[1])); for (const id of ids) { await page.click(`[data-set="2|${id}|inhalt|1"]`); for (const k of ["ks", "au", "ws", "gr"]) await top(2, id, k); } }
    }
    const capped = await page.$("button.info");
    check("Q: „gekappt“ erscheint", !!capped);
    if (capped) {
      await page.click("button.info");
      check("Q: Antippen zeigt Erklärung", /Anlage 19/.test(await page.textContent(".info-pop")));
      await page.click("button.info");
      check("Q: nochmal Antippen schließt", !(await page.$(".info-pop")));
    }
    check("Q: keine JS-Fehler", page.errors.length === 0, page.errors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
