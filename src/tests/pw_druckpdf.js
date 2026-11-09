// Druck-PDF und leere Bögen erzeugen: node pw_druckpdf.js <app.html> <backup.json> <druck.pdf> <leer.pdf>
// Prüfen: Seite 1 jedes Bogens darf weder Datum noch Teil-2-Inhalte zeigen (Fehler bis 1.1 im Q-Bogen).
const { chromium } = require("playwright"); const path=require("path");
const [file,backup,outA,outB]=process.argv.slice(2);
(async()=>{const b=await chromium.launch();const c=await b.newContext({acceptDownloads:true});const p=await c.newPage();
await p.goto("file://"+path.resolve(file));await p.waitForSelector("#app .card");
await p.setInputFiles("#restore-file",backup);await p.waitForTimeout(800);
await p.click('.tab[data-view="res"]');
let [d]=await Promise.all([p.waitForEvent("download",{timeout:90000}),p.click('[data-act="export-print"]')]);await d.saveAs(outA);
await p.waitForTimeout(500);
const blank=await p.$('[data-act="print-blank"]'); if(!blank){await p.click('.tab[data-view="plan"]');}
[d]=await Promise.all([p.waitForEvent("download",{timeout:90000}),p.click('[data-act="print-blank"]')]);await d.saveAs(outB);
console.log("ok");await b.close();})();
