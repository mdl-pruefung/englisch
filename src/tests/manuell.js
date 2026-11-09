// Komplett manuelle Planung: Gruppen von Hand anlegen, jeden Namen hineinziehen/antippen, alle Zeiten per Tastatur.
// node manuell.js <app.html> <sek1|ef|q> <ausgabeordner>
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const [FILE, VAR, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fail = 0;
const check = (n, c, i) => { if (c) { ok++; console.log("OK   " + n); } else { fail++; console.log("FAIL " + n + (i ? "  →  " + i : "")); } };
const NAMES = ["Albers, Jonas", "Bauer, Lina", "Çelik, Emre", "Dietrich, Marie", "Engel, Paul", "Fischer, Hannah", "Graf, Leon", "Hoffmann, Sophie", "Ivanova, Daria", "Jansen, Ben",
  "Keller, Mia", "Lorenz, Finn", "Mayer, Emma", "Nowak, Luka", "Osei, Ama", "Peters, Noah", "Quint, Ella", "Richter, Elias", "Schäfer, Lea", "Thiele, Maximilian"];
// Gruppen und Zeiten, wie eine Lehrkraft sie von Hand plant (Sek II: Prüfungsbeginn; Vorbereitung liegt davor)
const PLAN = {
  sek1: [[0, 1, 2, "07:55", "08:20"], [3, 4, "08:20", "08:40"], [5, 6, 7, 8, "08:50", "09:20"], [9, 10, 11, "09:45", "10:10"], [12, 13, 14, "10:10", "10:35"], [15, 16, "11:00", "11:20"], [17, 18, 19, "11:20", "11:45"]],
  ef:   [[0, 1, 2, "08:20", "08:40"], [3, 4, "08:40", "09:00"], [5, 6, 7, "09:00", "09:20"], [8, 9, 10, "09:45", "10:05"], [11, 12, 13, "10:05", "10:25"], [14, 15, 16, "10:25", "10:45"], [17, 18, 19, "11:10", "11:30"]],
  q:    [[0, 1, 2, "08:30", "09:00"], [3, 4, "09:00", "09:30"], [5, 6, 7, "09:30", "10:00"], [8, 9, 10, "10:25", "10:55"], [11, 12, 13, "10:55", "11:25"], [14, 15, 16, "11:25", "11:55"], [17, 18, 19, "12:20", "12:50"]],
}[VAR];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: "de-DE", viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("file://" + path.resolve(FILE)); await page.waitForSelector("#imp-paste");
  await page.fill("#datum", "2027-03-17"); await page.dispatchEvent("#datum", "change");
  await page.fill("#imp-paste", NAMES.join("\n")); await page.click('[data-act="imp-add"]');
  // Gruppen von Hand anlegen
  for (let i = 1; i < PLAN.length; i++) await page.click('[data-act="add-group"]');
  const G = await page.$$eval(".gcard[data-drop]:not(.pool)", els => els.map(e => e.dataset.drop));
  check(`${PLAN.length} Gruppen von Hand angelegt`, G.length === PLAN.length, G.length);
  const idOf = n => page.evaluate(nm => S.students.find(s => `${s.last}, ${s.first}` === nm).id, n);
  let k = 0;
  for (let gi = 0; gi < PLAN.length; gi++) {
    for (const ni of PLAN[gi].slice(0, -2)) {
      const id = await idOf(NAMES[ni]);
      if (k++ % 2 === 0) await page.dragAndDrop(`[data-pick="${id}"] .cn`, `.gcard[data-drop="${G[gi]}"] .gname`);
      else { await page.click(`[data-pick="${id}"] .cn`); await page.click(`.gcard[data-drop="${G[gi]}"] .gname`); }
    }
  }
  const members = await page.evaluate(() => S.groups.filter(g => !g.nach).map(g => g.members.map(m => { const s = S.students.find(x => x.id === m); return `${s.last}, ${s.first}`; })));
  check("Alle Namen per Ziehen/Antippen in der geplanten Gruppe", JSON.stringify(members) === JSON.stringify(PLAN.map(p => p.slice(0, -2).map(i => NAMES[i]))));
  check("„Noch ohne Gruppe“ ist leer", (await page.textContent(".gcard.pool")).includes("Alle zugeteilt"));
  // Zeiten per Tastatur: ins Feld klicken (der Vorschlag erscheint) und die eigene Zeit darüber tippen
  const typeTime = async (sel, hhmm) => { await page.click(sel); await page.keyboard.press("Home").catch(() => {}); await page.keyboard.type(hhmm.replace(":", ""), { delay: 30 }); await page.keyboard.press("Tab"); await page.waitForTimeout(60); };
  for (let gi = 0; gi < PLAN.length; gi++) {
    const [b, e] = PLAN[gi].slice(-2);
    // Sek I: erst das Ende eintippen wäre unüblich – Beginn, dann Ende
    await page.click(`#gt-${G[gi]}`); await page.locator(`#gt-${G[gi]}`).press("ArrowLeft").catch(() => {});
    await page.fill(`#gt-${G[gi]}`, b); await page.dispatchEvent(`#gt-${G[gi]}`, "change");
    await page.fill(`#ge-${G[gi]}`, e); await page.dispatchEvent(`#ge-${G[gi]}`, "change");
  }
  // eine Zeit zusätzlich wirklich Ziffer für Ziffer tippen
  await page.fill(`#gt-${G[3]}`, ""); await page.dispatchEvent(`#gt-${G[3]}`, "change");
  await page.fill(`#ge-${G[3]}`, ""); await page.dispatchEvent(`#ge-${G[3]}`, "change");
  await typeTime(`#gt-${G[3]}`, PLAN[3][PLAN[3].length - 2]);
  const t3 = await page.$eval(`#gt-${G[3]}`, e => e.value), e3 = await page.$eval(`#ge-${G[3]}`, e => e.value);
  check(`Ziffernweise getippt: Beginn ${PLAN[3].at(-2)} übernommen (Vorschlag wird überschrieben)`, t3 === PLAN[3].at(-2), t3);
  check(`… und Ende automatisch passend (${VAR === "sek1" ? "3er: 25 Min." : "Prüfungsdauer"})`, e3 === PLAN[3].at(-1), e3);
  await page.reload(); await page.waitForSelector("#app .card");
  const times = await page.evaluate(() => S.groups.filter(g => !g.nach).map(g => [g.time, g.end]));
  check("Alle Zeiten nach Neuladen gespeichert", JSON.stringify(times) === JSON.stringify(PLAN.map(p => p.slice(-2))), JSON.stringify(times));
  const pauses = await page.$$eval(".pause", els => els.map(e => e.textContent.trim()).filter(Boolean));
  fs.writeFileSync(path.join(OUT, "pausen.txt"), pauses.join("\n"));
  check("Pausen zwischen den Gruppen werden angezeigt", pauses.length >= 2, pauses.join(" | "));
  await page.screenshot({ path: path.join(OUT, `manuell_${VAR}.png`), fullPage: true });
  // Word: Zeiten wie eingegeben
  await page.fill("#m-klasse", VAR === "sek1" ? "9c" : "Kurs E2"); await page.fill("#m-pruefer1", "Frau Muster");
  const [d] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="letter-docx"]')]); const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p);
  const unzip = require(require.resolve("jszip", { paths: ["/opt/npm-tools/node_modules"] }));
  const xml = await (await unzip.loadAsync(fs.readFileSync(p))).file("word/document.xml").async("string");
  const plain = xml.replace(/<[^>]+>/g, "");
  check("Word: alle eingegebenen Zeiten stehen im Schreiben", PLAN.every(r => plain.includes(`${r.at(-2)} – ${r.at(-1)}`)), PLAN.filter(r => !plain.includes(`${r.at(-2)} – ${r.at(-1)}`)).map(r => r.slice(-2).join("–")).join(", "));
  if (VAR !== "sek1") check("Word (Sek II): Vorbereitungszeiten stehen dabei", plain.includes("Vorbereitung"));
  check("Keine JS-Fehler", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok} OK, ${fail} FAIL`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
