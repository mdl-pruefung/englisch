// Generalprobe: eine ganze Lerngruppe von der Planung bis zu allen Exporten durchspielen.
// node generalprobe.js <app.html> <sek1|ef|q> <ausgabeordner>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const [FILE, VAR, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = path.join(OUT, "bilder"); fs.mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log(...a);
let step = 0; const say = t => log(`[${++step}] ${t}`);

// ---------- reproduzierbarer Zufall ----------
let seed = { sek1: 11, ef: 22, q: 33 }[VAR];
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- Lerngruppe ----------
const NAMES = {
  sek1: ["Albers, Jonas", "Bauer, Lina", "Çelik, Emre", "Dietrich, Marie", "Engel, Paul", "Fischer, Hannah", "Graf, Leon", "Hoffmann, Sophie", "Ivanova, Daria", "Jansen, Ben",
         "Keller, Mia", "Lorenz, Finn", "Mayer, Emma", "Nowak, Luka", "Osei, Ama", "Peters, Noah", "Quint, Ella", "Richter, Elias", "Schäfer, Lea", "Thiele, Maximilian",
         "Ünal, Zeynep", "Vogt, Anton", "Wagner, Clara", "Yilmaz, Can", "Zimmermann, Ida", "Brandt, Ole"],
  ef:   ["Arnold, Luisa", "Böhm, Jakob", "Costa, Inês", "Dahlke, Moritz", "Erdem, Selin", "Frank, Julian", "Günther, Nele", "Hartmann, Tim", "Ilić, Petar", "Jung, Charlotte",
         "Krüger, David", "Lehmann, Pia", "Mertens, Felix", "Nguyen, Linh", "Ott, Johanna", "Pohl, Samuel", "Roth, Amelie", "Sommer, Niklas", "Tran, Vy", "Weber, Lotta", "Ziegler, Malte"],
  q:    ["Adler, Frieda", "Berger, Konstantin", "Cordes, Merle", "Dąbrowski, Kacper", "Ebert, Leni", "Falk, Vincent", "Gruber, Romy", "Haas, Theo", "Iqbal, Sara", "Jäger, Lukas",
         "Kraus, Helena", "Lindner, Mats", "Morina, Arta", "Neumann, Jule", "Okafor, Daniel", "Pauls, Greta", "Rieger, Jonathan", "Seidel, Marlene"],
}[VAR];
const KLASSE = { sek1: "10b", ef: "EF E3", q: "Q1 GK Englisch 2" }[VAR];
const DATUM = "2027-03-17", NACH_DATUM = "2027-03-24";
const ability = Object.fromEntries(NAMES.map(n => [n, clamp(0.15 + rnd() * 0.85, 0, 1)]));
ability[NAMES[3]] = 0.08;            // eine sehr schwache Leistung
const CAPNAME = NAMES[4];            // Q-Phase: sprachlich stark, inhaltlich ungenügend → Kappung nach Anlage 19

const NOTE_T1 = [
  "Thema: My dream job.\nGute Einleitung, klare Struktur (first, then, finally).\nWortschatz teils einfach: 'good', 'nice'.\nZeitformen meist korrekt, Fehler bei present perfect.",
  "Presentation on climate change – sehr sicher, kaum Notizen genutzt.\nAusführliche Beispiele, eigene Meinung begründet.\nAussprache: th-Laut gut.",
  "Kurzer Vortrag, nach 1:30 min fertig.\nInhaltlich dünn, wiederholt sich.\nViele Pausen, sucht nach Wörtern; he/she verwechselt.",
  "Topic: social media and teenagers.\nPro/contra sauber gegenübergestellt.\nIdiomatisch: 'on the other hand', 'to sum up'.\nKleine Fehler: 'informations', 'peoples'.",
  "Bildbeschreibung ausführlich, Interpretation eher knapp.\nSatzbau überwiegend einfach (SVO), aber verständlich.",
  "Sehr nervös am Anfang, dann gefangen.\nGute Aussprache, Intonation etwas monoton.\nInhalt: Aufgabe 2 nur angerissen.",
];
const NOTE_T2 = [
  "Reagiert schnell auf Einwände, fragt nach ('What do you mean by …?').\nÜbernimmt Gesprächsführung.",
  "Eher passiv, antwortet nur auf direkte Ansprache.\nKurze Beiträge, kaum Begründungen.",
  "Bringt eigene Ideen ein, fasst am Ende zusammen.\nGelegentlich Deutsch ('also …').",
  "Unterbricht Partner:in mehrfach. Argumente gut, Höflichkeitsformen fehlen.",
  "Kompromissvorschlag gemacht ('Why don't we …').\nWortschatz zum Thema sicher.",
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: "de-DE", viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const dl = async (fn, name) => {
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), fn()]);
    const p = path.join(OUT, name || d.suggestedFilename()); await d.saveAs(p); await closeBusy(); return p;
  };
  const closeBusy = async () => { await page.waitForTimeout(150); const b = await page.$('#busy:not([hidden]) [data-act="busy-close"], .busy:not([hidden]) [data-act="busy-close"]'); if (b && await b.isVisible()) await b.click().catch(() => {}); };
  const tab = async v => { await page.click(`.tab[data-view="${v}"]`); await page.waitForTimeout(80); };
  const clickSet = async (part, id, key, lvl) => {
    let el = await page.$(`[data-set="${part}|${id}|${key}|${lvl}"]`);
    if (!el) { const all = await page.$$(`[data-set^="${part}|${id}|${key}|"]`); el = all[0]; }     // höchster verfügbarer Wert
    if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
  };
  const levels = (a, part, who) => {
    if (VAR === "q" && who === CAPNAME) return { inhalt: 1, ks: 4, au: 3, ws: 4, gr: 4 };
    const noise = () => (rnd() - 0.5) * 0.3;
    let inh = Math.round(clamp(a + noise(), 0, 1) * 10); if (rnd() < 0.7 && inh % 2 === 0) inh = clamp(inh + (rnd() < 0.5 ? 1 : -1), 1, 9);
    const d = k => Math.round(clamp(a + noise(), 0, 1) * (k === "au" ? 3 : 4));
    return { inhalt: inh, ks: d("ks"), au: d("au"), ws: d("ws"), gr: d("gr") };
  };

  say("App öffnen");
  await page.goto("file://" + path.resolve(FILE)); await page.waitForSelector("#app .card");

  // ---------- Planung ----------
  say("Prüfungstag eintragen, Namensliste einfügen (Sek I: „Nachname, Vorname“, sonst Excel-Spalten)");
  await page.fill("#datum", DATUM); await page.dispatchEvent("#datum", "change");
  const paste = VAR === "sek1" ? NAMES.join("\n") : NAMES.map(n => n.replace(", ", "\t")).join("\n");
  await page.fill("#imp-paste", paste); await page.waitForTimeout(200);
  await page.click('[data-act="imp-add"]');
  const nTxt = await page.textContent("#app");
  if (!nTxt.includes(`${NAMES.length} Namen`)) throw new Error("Namensliste nicht vollständig übernommen");
  say("Weitere Namen: ein doppelter Name wird übersprungen, ein Nachzügler kommt dazu");
  await page.click('[data-act="imp-open"]');
  await page.fill("#imp-paste", `${NAMES[0]}\nWinter, Lou`); await page.click('[data-act="imp-add"]');
  NAMES.push("Winter, Lou"); ability["Winter, Lou"] = 0.55;

  say("Zufallsgruppen, dann einzelne Namen umsetzen (Antippen und Ziehen), Reihenfolge ändern");
  await page.click('[data-act="auto-groups"]');
  const gids = () => page.$$eval(".gcard[data-drop]:not(.pool)", els => els.map(e => e.dataset.drop));
  let G = await gids();
  const firstOf = async gid => page.$eval(`.gcard[data-drop="${gid}"] [data-pick]`, e => e.dataset.pick);
  let who = await firstOf(G[0]); await page.click(`[data-pick="${who}"] .cn`); await page.click(`.gcard[data-drop="${G[2]}"] .gname`);
  who = await firstOf(G[3]); await page.dragAndDrop(`[data-pick="${who}"] .cn`, `.gcard[data-drop="${G[1]}"] .gname`);
  who = await firstOf(G[2]); await page.click(`[data-pick="${who}"] .cn`); await page.click('[data-act="pick-cancel"]');   // überlegt es sich anders
  await page.click(`[data-act="gdown"][data-id="${G[1]}"]`);
  await page.click('[data-act="add-group"]'); G = await gids();
  await page.click(`.gcard[data-drop="${G[G.length - 1]}"] [data-act="gdel"]`);               // leere Gruppe wieder weg
  await page.screenshot({ path: path.join(SHOTS, "1_planung_gruppen.png"), fullPage: false });

  say("Zeiten aus dem Grundraster, dann von Hand nachjustieren und eine Pause einfügen");
  await page.click('[data-act="suggest-times"]');
  G = await gids();
  const t3 = await page.$eval(`#gt-${G[2]}`, e => e.value);
  const pb = await page.$(`.gcard[data-drop="${G[3]}"] [data-act="pause"]:not([disabled])`); if (pb) await pb.click();
  await page.screenshot({ path: path.join(SHOTS, "2_planung_zeiten.png"), fullPage: true });

  say("Angaben fürs Schreiben ans Kollegium, Word-Dateien und Prüfungsplan speichern");
  await page.fill("#m-klasse", KLASSE); await page.fill("#m-pruefer1", "Frau Muster"); await page.fill("#m-pruefer2", "Herr Beispiel"); await page.fill("#m-raum", "2.12");
  await page.waitForTimeout(200);
  await dl(() => page.click('[data-act="letter-docx"]'));
  await dl(() => page.click('[data-act="notice-docx"]'));
  await dl(() => page.click('[data-act="plan-export"]'));
  await page.selectOption("#print-order", "alpha");
  await dl(() => page.click('[data-act="print-blank"]'));

  // ---------- Prüfungstag ----------
  const runGroup = async (gid, opts = {}) => {
    await tab("run");
    await page.selectOption("#g-pick", gid); await page.waitForTimeout(100);
    if (opts.absent) { await page.uncheck(`[data-present="${opts.absent}"]`); }
    if (opts.seat) { const b = await page.$('.attend [data-act="seat"][data-dir="1"]:not([disabled])'); if (b) await b.click(); }
    await page.click('[data-act="g-start"]');
    const subs = await page.$$eval(".sub", els => els.map(e => e.dataset.sub));
    for (const s of subs.filter(x => x.startsWith("t1:"))) {
      const id = s.slice(3); await page.click(`.sub[data-sub="${s}"]`);
      const name = await page.$eval(".name-big", e => e.textContent.trim()).catch(() => "");
      const who = NAMES.find(n => name.startsWith(n)) || name;
      const L = levels(ability[who] ?? 0.5, 1, who);
      if (rnd() < 0.3) await clickSet(1, id, "inhalt", clamp(L.inhalt + 2, 0, 10));          // verklickt …
      await clickSet(1, id, "inhalt", L.inhalt);                                                 // … und korrigiert
      for (const k of ["ks", "au", "ws", "gr"]) await clickSet(1, id, k, L[k]);
      await page.fill(`#notes-1-${id}`, pick(NOTE_T1));
      if (rnd() < 0.25) { await tab("res"); await tab("run"); }                                  // zwischendurch in die Ergebnisse geschaut
    }
    await page.click('.sub[data-sub="t2"]');
    const ids = await page.$$eval('[data-set^="2|"][data-set$="|inhalt|5"]', els => els.map(e => e.dataset.set.split("|")[1]));
    for (const id of ids) {
      const name = await page.$eval(`#notes-2-${id}`, e => e.closest(".pcol") ? "" : "").catch(() => "");
      const st = await page.evaluate(i => { const s = S.students.find(x => x.id === i); return s ? `${s.last}, ${s.first}` : ""; }, id);
      const L = levels(ability[st] ?? 0.5, 2, st);
      await clickSet(2, id, "inhalt", L.inhalt);
      for (const k of ["ks", "au", "ws", "gr"]) { if (opts.forget === st && k === "gr") continue; await clickSet(2, id, k, L[k]); }
      await page.fill(`#notes-2-${id}`, pick(NOTE_T2));
    }
  };
  G = await gids();
  const memberOf = async gid => page.evaluate(g => S.groups.find(x => x.id === g).members.map(m => { const s = S.students.find(y => y.id === m); return { id: m, name: `${s.last}, ${s.first}` }; }), gid);
  const g2m = await memberOf(G[1]);
  const absentName = g2m[1].name, forgetName = (await memberOf(G[0]))[0].name;
  for (let i = 0; i < G.length; i++) {
    say(`Prüfung ${i + 1}/${G.length}: Anwesenheit, Sitzordnung, Teil 1 je Person, Teil 2 im Gespräch`);
    await runGroup(G[i], { absent: i === 1 ? g2m[1].id : null, seat: i === 0, forget: i === 0 ? forgetName : null });
    if (i === 0) await page.screenshot({ path: path.join(SHOTS, "3_pruefung_teil2.png"), fullPage: false });
  }

  say(`Nachprüfung für ${absentName} anlegen, Datum und Zeit eintragen, prüfen`);
  await tab("plan");
  await page.click('[data-act="make-nach"]');
  const nach = await page.evaluate(() => S.groups.find(g => g.nach).id);
  await page.fill(`#gd-${nach}`, NACH_DATUM); await page.dispatchEvent(`#gd-${nach}`, "change");
  await page.fill(`#gt-${nach}`, "13:30"); await page.dispatchEvent(`#gt-${nach}`, "change");
  await runGroup(nach);

  // ---------- Nachbesprechung ----------
  say(`Nachbesprechung: vergessenes Kreuz bei ${forgetName} nachtragen, zwei Bewertungen ändern, Notizen ergänzen`);
  await tab("rev");
  const sid = async n => page.evaluate(nm => S.students.find(s => `${s.last}, ${s.first}` === nm).id, n);
  const fId = await sid(forgetName);
  await page.click(`[data-review="${fId}"]`).catch(async () => { await tab("res"); await page.click(`[data-review="${fId}"]`); });
  await clickSet(2, fId, "gr", 2);
  for (const n of [NAMES[5], NAMES[9]]) {
    const id = await sid(n); await page.click(`[data-review="${id}"]`).catch(async () => { await tab("res"); await page.click(`[data-review="${id}"]`); });
    const cur = await page.evaluate(i => S.students.find(s => s.id === i).t1.inhalt, id);
    await clickSet(1, id, "inhalt", clamp(cur + 1, 0, 10));
    const ta = `#notes-1-${id}`; const old = await page.$eval(ta, e => e.value);
    await page.fill(ta, old + "\nNachbesprechung: Inhalt nach Rücksprache um 1 Punkt angehoben.");
  }
  await page.screenshot({ path: path.join(SHOTS, "4_nachbesprechung.png"), fullPage: false });

  // ---------- Ergebnisse und Exporte ----------
  say("Ergebnisse: Notenliste, Einzel-PDFs (ZIP), Druck-PDF, ein einzelner Bogen, PDF-Export oben, Daten-Backup");
  await tab("res");
  await page.screenshot({ path: path.join(SHOTS, "5_ergebnisse.png"), fullPage: true });
  const xlsx = await dl(() => page.click('[data-act="export-xlsx"]'));
  const zip = await dl(() => page.click('[data-act="export-zip"]'));
  const druck = await dl(() => page.click('[data-act="export-print"]'));
  const oneId = await sid(NAMES[2]);
  const one = await dl(() => page.click(`[data-act="pdf-one"][data-sid="${oneId}"]`), "einzelbogen.pdf");
  await page.click("#pdf-export"); const zipAll = await dl(() => page.click('[data-act="pdf-export-all"]'), "Bewertungsboegen_alle.zip");
  const backup = await dl(() => page.click("#quick-backup"), "backup.json");
  const resTable = await page.$$eval("#app table tbody tr", trs => trs.map(tr => [...tr.querySelectorAll("td")].slice(0, 8).map(td => td.textContent.trim()).join("|")));
  fs.writeFileSync(path.join(OUT, "ergebnisse_tabelle.json"), JSON.stringify(resTable, null, 1));

  say("Notenliste aus den eigenen PDF-Bögen zurücklesen (für in Acrobat ausgefüllte Bögen)");
  const JSZip = require(require.resolve("jszip", { paths: ["/opt/npm-tools/node_modules", process.cwd()] }));
  const z = await JSZip.loadAsync(fs.readFileSync(zip)); const pdfDir = path.join(OUT, "einzelboegen"); fs.mkdirSync(pdfDir, { recursive: true });
  for (const f of Object.keys(z.files)) fs.writeFileSync(path.join(pdfDir, f), await z.files[f].async("nodebuffer"));
  await page.click("#app details > summary >> text=Weitere Optionen").catch(() => {});
  const xlsxPdf = await dl(() => page.setInputFiles("#pdf-files", fs.readdirSync(pdfDir).map(f => path.join(pdfDir, f))));

  // ---------- Wiederherstellen in einem frischen Browser ----------
  say("Frischer Browser: Backup wiederherstellen, Ergebnisse vergleichen");
  const ctx2 = await browser.newContext({ locale: "de-DE", viewport: { width: 1440, height: 950 } });
  const p2 = await ctx2.newPage(); p2.on("pageerror", e => errors.push("[2] " + e));
  await p2.goto("file://" + path.resolve(FILE)); await p2.waitForSelector("#app .card");
  await p2.setInputFiles("#restore-file", backup); await p2.waitForTimeout(800);
  await p2.click('.tab[data-view="res"]');
  const resTable2 = await p2.$$eval("#app table tbody tr", trs => trs.map(tr => [...tr.querySelectorAll("td")].slice(0, 8).map(td => td.textContent.trim()).join("|")));
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ xlsx, zip, zipAll, druck, one, backup, xlsxPdf, absentName, forgetName, restoredSame: JSON.stringify(resTable) === JSON.stringify(resTable2), errors }, null, 1));
  log(`Wiederhergestellt identisch: ${JSON.stringify(resTable) === JSON.stringify(resTable2)}`);
  log(`JS-Fehler: ${errors.length ? errors.join(" | ") : "keine"}`);
  await browser.close();
})().catch(e => { console.error("ABBRUCH:", e); process.exit(2); });
