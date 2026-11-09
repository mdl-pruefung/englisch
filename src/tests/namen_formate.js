// Namenslisten in vielen Formaten einfügen: node namen_formate.js <app.html> <ausgabeordner>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const [FILE, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const XLSX = require(path.join(__dirname, "../lib/xlsx.full.min.js"));

const WANT = [["Becker", "Ida"], ["Adler", "Tom"], ["Müller-Lüdenscheidt", "Anna-Lena"], ["Çelik", "Emre"], ["O'Connor", "Seán"]];
const want = WANT.map(([l, f]) => `${l}|${f}`);
const CASES = [
  ["Nachname, Vorname (je Zeile)", WANT.map(([l, f]) => `${l}, ${f}`).join("\n")],
  ["Vorname Nachname (je Zeile)", WANT.map(([l, f]) => `${f} ${l}`).join("\n")],
  ["Excel: 2 Spalten ohne Überschrift", WANT.map(([l, f]) => `${l}\t${f}`).join("\n")],
  ["Excel: Überschrift Nachname/Vorname/Klasse", "Nachname\tVorname\tKlasse\n" + WANT.map(([l, f]) => `${l}\t${f}\t10b`).join("\n")],
  ["Excel: Spalten vertauscht (Vorname, Nachname)", "Vorname\tNachname\n" + WANT.map(([l, f]) => `${f}\t${l}`).join("\n")],
  ["Schulverwaltung (CSV mit ;), mehr Spalten", "Nr;Nachname;Vorname;Klasse;Geburtsdatum\n" + WANT.map(([l, f], i) => `${i + 1};${l};${f};10b;01.02.2011`).join("\n")],
  ["Excel: Überschrift „Name“ (eine Spalte) + Klasse", "Name\tKlasse\n" + WANT.map(([l, f]) => `${l}, ${f}\t10b`).join("\n")],
  ["Leerzeilen, Leerzeichen, geschützte Leerzeichen", "\n  " + WANT.map(([l, f]) => `${l} ,  ${f}  `).join("\n\n") + "\n\n"],
  ["Klassenliste mit zwei Klassen (Filter)", "Nachname\tVorname\tKlasse\n" + WANT.map(([l, f]) => `${l}\t${f}\t10b`).join("\n") + "\nFremd\tFritz\t10a"],
  ["Nummerierte Liste „1. Nachname, Vorname“", WANT.map(([l, f], i) => `${i + 1}. ${l}, ${f}`).join("\n")],
  ["Alles in einer Zeile mit ;", WANT.map(([l, f]) => `${l}, ${f}`).join("; ")],
  ["CSV mit Komma als Trenner", "Nachname,Vorname,Klasse\n" + WANT.map(([l, f]) => `${l},${f},10b`).join("\n")],
  ["Vorname Nachname mit „von“", "Lukas von der Heide\nIda Becker"],
];

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  const run = async (label, fn, expect) => {
    const ctx = await browser.newContext({ locale: "de-DE" }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto("file://" + path.resolve(FILE)); await page.waitForSelector("#imp-paste");
    await fn(page);
    await page.waitForTimeout(250);
    const recognized = await page.$eval("#app", e => (e.textContent.match(/(\d+)\s+Namen? erkannt[^·]*/) || [""])[0]).catch(() => "");
    if (label.includes("Filter")) { await page.selectOption("#imp-klass", "10b").catch(() => {}); }
    await page.click('[data-act="imp-add"]').catch(() => {});
    await page.waitForTimeout(150);
    const got = await page.evaluate(() => S.students.map(s => `${s.last}|${s.first}`));
    const exp = expect || want;
    const okk = JSON.stringify(got) === JSON.stringify(exp);
    rows.push({ label, ok: okk, got, recognized, errs });
    console.log((okk ? "OK   " : "PROB ") + label + (okk ? "" : `\n       erkannt: ${got.join(" · ")}`));
    await ctx.close();
  };
  for (const [label, text] of CASES) {
    let exp = null;
    if (label.includes("„von“")) exp = ["von der Heide|Lukas", "Becker|Ida"];
    await run(label, async p => { await p.fill("#imp-paste", text); }, exp);
  }
  // Dateien
  const xl = path.join(OUT, "klassenliste.xlsx"); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Klassenliste 10b"], [], ["Nachname", "Vorname", "Klasse"], ...WANT.map(([l, f]) => [l, f, "10b"])]), "Tabelle1");
  fs.writeFileSync(xl, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await run("Excel-Datei (.xlsx) mit Titelzeile über der Tabelle", async p => { await p.setInputFiles("#imp-file", xl); });
  const csv = path.join(OUT, "klassenliste_ansi.csv");
  fs.writeFileSync(csv, Buffer.from("Nachname;Vorname\r\n" + WANT.map(([l, f]) => `${l};${f}`).join("\r\n"), "latin1"));
  await run("CSV-Datei aus älterem Excel (ANSI/Windows-1252)", async p => { await p.setInputFiles("#imp-file", csv); });
  const csv8 = path.join(OUT, "klassenliste_utf8.csv");
  fs.writeFileSync(csv8, "﻿Nachname;Vorname\r\n" + WANT.map(([l, f]) => `${l};${f}`).join("\r\n"), "utf8");
  await run("CSV-Datei UTF-8 mit BOM", async p => { await p.setInputFiles("#imp-file", csv8); });
  // Zwillinge mit gleichem Namen
  await run("Zwei Personen mit gleichem Namen", async p => { await p.fill("#imp-paste", "Müller, Max\nMüller, Max\nBecker, Ida"); }, ["Müller|Max", "Müller|Max", "Becker|Ida"]);
  fs.writeFileSync(path.join(OUT, "namen_formate.json"), JSON.stringify(rows, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
