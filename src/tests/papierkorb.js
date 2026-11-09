// Papierkorb: nach 100 Tagen noch da, nach 600 Tagen endgültig gelöscht. node papierkorb.js <app.html>
const { chromium } = require("playwright"); const path = require("path");
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto("file://" + path.resolve(process.argv[2])); await p.waitForSelector("#imp-paste");
  const mk = async name => { await p.evaluate(n => { newExam(n, "2025/26"); }, name); await p.evaluate(() => { S.students.push({ id: uid(), last: "Test", first: "X", klasse: "", absent: false, t1: emptyPart(), t2: emptyPart() }); touch(); flushLocal(); }); return p.evaluate(() => S.examId); };
  const a = await mk("8a"), c = await mk("8c"); await mk("9b");
  await p.evaluate(([a, c]) => { deleteExam(a); deleteExam(c); const ix = readIndex(); ix.trash.forEach(t => t.deleted = Date.now() - (t.id === a ? 100 : 600) * 864e5); writeIndex(ix); }, [a, c]);
  await p.reload(); await p.waitForSelector("#app .card");
  const r = await p.evaluate(([a, c]) => ({ nach100: readIndex().trash.some(t => t.id === a) && !!localStorage.getItem(EXAM_KEY(a)), nach600: readIndex().trash.some(t => t.id === c) || !!localStorage.getItem(EXAM_KEY(c)) }), [a, c]);
  console.log((r.nach100 ? "OK   " : "FAIL ") + "nach 100 Tagen noch im Papierkorb");
  console.log((!r.nach600 ? "OK   " : "FAIL ") + "nach 600 Tagen endgültig gelöscht");
  await p.evaluate(() => openExams()); console.log("Anzeige:", (await p.textContent("#exams-dlg summary")).trim());
  await b.close();
})();
