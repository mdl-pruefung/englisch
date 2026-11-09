// Hinweis „kein privates Fenster“: node hinweis_privat.js <app.html> <bild.png>
const { chromium } = require("playwright"); const path = require("path");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(String(e)));
  const url = "file://" + path.resolve(process.argv[2]); const ok = (n, c) => console.log((c ? "OK   " : "FAIL ") + n);
  await p.goto(url); await p.waitForSelector("#app .card");
  ok("Hinweis beim ersten Öffnen sichtbar", await p.isVisible("#private-warn"));
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
  await p.click("#private-warn-x"); ok("× blendet aus", !(await p.isVisible("#private-warn")));
  await p.reload(); await p.waitForSelector("#app .card"); ok("nach × erscheint er beim nächsten Öffnen wieder", await p.isVisible("#private-warn"));
  await p.click("#private-warn-never"); await p.reload(); await p.waitForSelector("#app .card"); ok("„Nicht mehr anzeigen“ wirkt dauerhaft", !(await p.isVisible("#private-warn")));
  const p2 = await (await b.newContext()).newPage(); await p2.goto(url); await p2.waitForSelector("#app .card"); ok("im privaten Fenster (frischer Speicher) wieder sichtbar", await p2.isVisible("#private-warn"));
  ok("keine JS-Fehler", errs.length === 0); await b.close();
})();
