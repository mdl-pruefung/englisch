// Absturz-/Akku-Test: Notiz tippen, Browser nach <ms> hart beenden (SIGKILL), neu starten, prüfen.
// node crash_test.js <app.html>
const { chromium } = require("playwright"); const fs = require("fs"), os = require("os"), path = require("path"); const { execSync } = require("child_process");
const URL = "file://" + path.resolve(process.argv[2]);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-"));
  let ctx = await chromium.launchPersistentContext(dir); let p = ctx.pages()[0] || await ctx.newPage();
  await p.goto(URL); await p.waitForSelector("#imp-paste");
  await p.fill("#imp-paste", "Becker, Ida\nAdler, Tom\nCzerny, Lea"); await p.click('[data-act="imp-add"]'); await p.click('[data-act="auto-groups"]');
  await p.click('.tab[data-view="run"]'); await p.click('[data-act="g-start"]');
  const id = await p.$eval(".sub[data-sub^='t1:']", e => e.dataset.sub.slice(3)); await p.waitForTimeout(500);
  await ctx.close();
  for (const ms of (process.argv[3] || "50,150,300,500,1000").split(",").map(Number)) {
    ctx = await chromium.launchPersistentContext(dir); p = ctx.pages()[0] || await ctx.newPage();
    await p.goto(URL); await p.waitForSelector(`#notes-1-${id}`);
    const txt = `Notiz ${ms} ms vor dem Absturz`;
    await p.fill(`#notes-1-${id}`, txt); await p.click(`[data-set="1|${id}|inhalt|${ms % 10}"]`).catch(() => {});
    await p.waitForTimeout(ms);
    try { execSync(`pkill -9 -f "${dir}"`); } catch (e) {}
    await new Promise(r => setTimeout(r, 700)); await ctx.close().catch(() => {});
    ctx = await chromium.launchPersistentContext(dir); p = ctx.pages()[0] || await ctx.newPage();
    await p.goto(URL); await p.waitForSelector("#app .card");
    const st = await p.evaluate(i => { const s = S.students.find(x => x.id === i); return s ? s.t1.notes : "(Person nicht gefunden)"; }, id);
    console.log(`${String(ms).padStart(5)} ms nach dem Tippen hart beendet: ${st === txt ? "gespeichert" : "VERLOREN (Stand: " + st + ")"}`);
    await ctx.close();
  }
})().catch(e => { console.error(e); process.exit(2); });
