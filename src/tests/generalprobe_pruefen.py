"""Generalprobe nachprüfen – unabhängig von der App nachgerechnet.
python3 generalprobe_pruefen.py <ausgabeordner> <sek1|ef|q>
"""
import json, os, re, subprocess, sys, zipfile
import openpyxl, pikepdf, unicodedata
fold = lambda t: "".join(c for c in unicodedata.normalize("NFKD", t.lower()) if not unicodedata.combining(c))   # wie die Sortierung der App (Deutsch)

OUT, VAR = sys.argv[1], sys.argv[2]
ok = fail = 0
def check(name, cond, info=""):
    global ok, fail
    if cond: ok += 1; print("OK   " + name)
    else: fail += 1; print("FAIL " + name + (f"  →  {info}" if info else ""))

d = json.load(open(os.path.join(OUT, "backup.json"), encoding="utf-8"))
ex = d["exams"][0]; S = ex["students"]; GR = ex["groups"]
name = lambda s: f'{s["last"]}, {s["first"]}' if s["first"] else s["last"]
fmt = lambda iso: f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso else ""
group_of = lambda s: next((g for g in GR if s["id"] in g["members"]), None)
date_of = lambda s: (group_of(s) or {}).get("datum") if (group_of(s) or {}).get("nach") else ex["datum"]

# ---------- eigene Berechnung ----------
KEYS = ["ks", "au", "ws", "gr"]
def part(p):
    dl = [p[k] for k in KEYS if p[k] is not None]
    return dict(inh=p["inhalt"], dar=sum(dl) if dl else None, total=None if p["inhalt"] is None and not dl else (p["inhalt"] or 0) + sum(dl),
                complete=p["inhalt"] is not None and len(dl) == 4, any=p["inhalt"] is not None or bool(dl) or bool(p["notes"]))
BANDS = [(1, 44), (2, 37), (3, 30), (4, 23), (5, 10), (6, 0)]
NP_MIN = [48, 45, 43, 40, 38, 35, 33, 30, 28, 25, 23, 20, 17, 14, 10]
WORD = {1: "Sehr gut", 2: "Gut", 3: "Befriedigend", 4: "Ausreichend", 5: "Mangelhaft", 6: "Ungenügend"}
def expected(s):
    a, b = part(s["t1"]), part(s["t2"])
    if not (a["complete"] and b["complete"]): return None
    pts = a["total"] + b["total"]
    if VAR == "q":
        np = next((15 - k for k, lo in enumerate(NP_MIN) if pts >= lo), 0); capped = False
        if (a["inh"] + b["inh"] < 4 or a["dar"] + b["dar"] < 6) and np > 3: np, capped = 3, True
        grade = 6 if np == 0 else 5 - (np - 1) // 3
        tend = "6" if np == 0 else f'{grade}{["-", "", "+"][(np - 1) % 3]}'
        return dict(points=pts, note=np, tend=tend, capped=capped, key=np)
    g = next(g for g, lo in BANDS if pts >= lo)
    t = next(t for t in ex["tendency"] if pts >= t["min"])["label"]
    return dict(points=pts, note=g, tend=t, capped=False, key=g, word=WORD[g])

scored = [s for s in S if part(s["t1"])["any"] or part(s["t2"])["any"]]
complete = [s for s in S if expected(s)]
print(f"Lerngruppe: {len(S)} Personen, {len(complete)} vollständig bewertet, {len(scored)} mit Bewertung, Gruppen: {len([g for g in GR if not g['nach']])} + {len([g for g in GR if g['nach']])} Nachprüfung")
check("Alle Personen vollständig bewertet (inkl. Nachprüfung und nachgetragenem Kreuz)", len(complete) == len(S), [name(s) for s in S if not expected(s)])

# ---------- Notenliste ----------
def read_xlsx(p):
    ws = openpyxl.load_workbook(p).active; rows = list(ws.iter_rows(values_only=True)); return rows[0], {f"{r[0]}, {r[1]}" if r[1] else r[0]: r for r in rows[1:]}
head, X = read_xlsx(os.path.join(OUT, [f for f in os.listdir(OUT) if f.startswith("Notenliste_") and "aus_PDFs" not in f][0]))
bad = [n for n, e in ((name(s), expected(s)) for s in S) if not (n in X and X[n][2] == e["note"] and X[n][3] == e["tend"] and X[n][4] == f'{e["points"]}/50' and (X[n][5] or "") == ("gekappt (Anlage 19)" if e["capped"] else ""))]
check(f"Notenliste: alle {len(S)} Zeilen stimmen (Note, Tendenz, Punkte, Bemerkung)", not bad, bad[:5])
check("Notenliste alphabetisch", list(X.keys()) == sorted(X.keys(), key=fold), list(X.keys())[:6])
_, XP = read_xlsx(os.path.join(OUT, [f for f in os.listdir(OUT) if "aus_PDFs" in f][0]))
badp = [n for n in X if n not in XP or XP[n][2:5] != X[n][2:5]]
check("Notenliste aus den PDF-Bögen gleich der Notenliste der App", not badp, badp[:5])
if VAR == "q": check("Q: mindestens eine Kappung nach Anlage 19 im Durchlauf", any(expected(s)["capped"] for s in S))

# ---------- Einzel-PDFs ----------
pdfdir = os.path.join(OUT, "einzelboegen"); files = sorted(os.listdir(pdfdir))
check(f"ZIP: ein Bogen je bewerteter Person ({len(scored)})", len(files) == len(scored), len(files))
GROUPS = {"Inhalt": "inhalt", "Kommunikative_Strategie": "ks", "Aussprache": "au", "Wortschatz": "ws", "Grammatik": "gr"}
problems = []
for f in files:
    pdf = pikepdf.open(os.path.join(pdfdir, f)); F = {str(x.get("/T", "")): x for x in pdf.Root.AcroForm.Fields}
    v = lambda n: F[n].get("/V") if n in F else None
    nm = str(v("Name")); s = next((x for x in S if name(x) == nm), None)
    if not s: problems.append(f"{f}: Name {nm} unbekannt"); continue
    for p in (1, 2):
        for fld, k in GROUPS.items():
            val = v(f"{fld}_Teil{p}"); want = s[f"t{p}"][k]
            got = None if val is None or str(val) in ("/Off", "") else int(str(val).lstrip("/"))
            if got != want: problems.append(f"{nm} {fld}_Teil{p}: {got} statt {want}")
        pt = part(s[f"t{p}"])
        for fn, want in ((f"Summe_Inhalt_Teil{p}", pt["inh"]), (f"Summe_Darstellungsleistung_Teil{p}", pt["dar"]), (f"Gesamt_Teil_{p}", pt["total"])):
            if str(v(fn)) != str(want): problems.append(f"{nm} {fn}: {v(fn)} statt {want}")
    e = expected(s)
    if str(v("Gesamtpunkte")) != str(e["points"]): problems.append(f"{nm} Gesamtpunkte {v('Gesamtpunkte')}")
    if str(v("Pruefungsdatum")) != fmt(date_of(s)): problems.append(f"{nm} Datum {v('Pruefungsdatum')} statt {fmt(date_of(s))}")
    on = sorted(n for n, x in F.items() if n.startswith("Noten") and str(x.get("/AS")) == "/On")
    if on != sorted([f"Notenmarkierung_{e['key']}", f"Notentext_{e['key']}"]): problems.append(f"{nm} Markierung {on} statt Stufe {e['key']}")
    if s["t1"]["notes"].split("\n")[0][:20] not in str(v("Protokoll_Teil1")): problems.append(f"{nm} Notizen Teil 1 fehlen")
check("Einzel-PDFs: Kreuze, Summen, Gesamtpunkte, Datum, Notenmarkierung und Notizen stimmen", not problems, problems[:6])
nachS = next(s for s in S if (group_of(s) or {}).get("nach"))
nachF = [f for f in files if f.startswith("N1-")]
check(f"Nachprüfung: Bogen „{nachF[0] if nachF else '?'}“ mit eigenem Datum {fmt(date_of(nachS))}", bool(nachF))

# ---------- Druck-PDF ----------
druck = os.path.join(OUT, [f for f in os.listdir(OUT) if f.startswith("Boegen_ausgefuellt")][0])
dp = pikepdf.open(druck)
check(f"Druck-PDF: {2 * len(scored)} Seiten, keine Formularfelder", len(dp.pages) == 2 * len(scored) and "/AcroForm" not in dp.Root and all(len(pg.get("/Annots", [])) == 0 for pg in dp.pages), len(dp.pages))
txt = lambda f, p: subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p), f, "-"], capture_output=True, text=True).stdout
leer_ref = os.path.join(OUT, [f for f in os.listdir(OUT) if f.startswith("Boegen_leer")][0])   # Formulartext zum Abgleich
order = sorted(scored, key=lambda s: (fold(s["last"]), fold(s["first"])))
probs = []
for i, s in enumerate(order):
    p1, p2 = txt(druck, 2 * i + 1), txt(druck, 2 * i + 2)
    if s["last"] not in p1 or s["last"] not in p2: probs.append(f"{name(s)}: Name fehlt (S. {2*i+1}/{2*i+2})")
    if fmt(date_of(s)) in p1: probs.append(f"{name(s)}: Datum auf Seite 1")
    if fmt(date_of(s)) not in p2: probs.append(f"{name(s)}: Datum fehlt auf Seite 2")
    # schmale Notizspalte: pdftotext mischt Zeilen – deshalb Wörter statt Zeichenketten vergleichen
    words = lambda t: set(re.findall(r"[A-Za-zÄÖÜäöüß]{5,}", t))
    w1, w2, wp1 = words(s["t1"]["notes"]), words(s["t2"]["notes"]), words(p1)
    if not w1 <= wp1: probs.append(f"{name(s)}: Notiz Teil 1 fehlt auf S. 1 ({sorted(w1 - wp1)[:3]})")
    only2 = (w2 - w1) - words(txt(leer_ref, 1)) if leer_ref else (w2 - w1)
    if only2 and only2 <= wp1: probs.append(f"{name(s)}: Notiz Teil 2 auf S. 1")
    e = expected(s)
    want = (WORD[e["note"]] if VAR != "q" else None)
    if want and want not in p2: probs.append(f"{name(s)}: Note „{want}“ fehlt auf S. 2")
check("Druck-PDF: alphabetisch, Namen, Datum nur auf Seite 2, Notizen auf der richtigen Seite, Note", not probs, probs[:6])

# ---------- Leere Bögen mit Namen ----------
leer = os.path.join(OUT, [f for f in os.listdir(OUT) if f.startswith("Boegen_leer")][0])
lp = pikepdf.open(leer); allord = sorted(S, key=lambda s: (fold(s["last"]), fold(s["first"])))
lprob = [name(s) for i, s in enumerate(allord) if s["last"] not in txt(leer, 2 * i + 1)]
check(f"Leere Bögen: {2 * len(S)} Seiten, alphabetisch mit Namen", len(lp.pages) == 2 * len(S) and not lprob, lprob[:5])
check("Leere Bögen: Datum nicht auf Seite 1", not any(fmt(ex["datum"]) in txt(leer, 2 * i + 1) for i in range(len(S))))

# ---------- Word-Dateien ----------
for f in [f for f in os.listdir(OUT) if f.endswith(".docx")]:
    x = zipfile.ZipFile(os.path.join(OUT, f)).read("word/document.xml").decode("utf-8")
    plain = re.sub(r"<[^>]+>", "", x)
    regular = [s for s in S if not (group_of(s) or {}).get("nach")]
    miss = [name(s) for s in regular if s["last"] not in plain]
    times = [g["time"] for g in GR if not g["nach"] and g["time"]]
    check(f"Word „{f}“: alle Namen und Zeiten enthalten", not miss and all(t in plain for t in times), (miss[:3], [t for t in times if t not in plain]))

# ---------- Wiederherstellen ----------
sm = json.load(open(os.path.join(OUT, "summary.json")))
check("Backup in frischem Browser: Ergebnistabelle identisch", sm["restoredSame"])
check("Keine JS-Fehler im ganzen Durchlauf", not sm["errors"], sm["errors"][:3])
print(f"\n{ok} OK, {fail} FAIL")
