#!/usr/bin/env python3
"""Baut aus app.src.html die drei Varianten (Sek I, EF, Q-Phase), je online (CDN) und offline (Bibliotheken eingebettet).
Aufruf: python3 assemble.py [ausgabeordner] [--beta]
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = next((a for a in sys.argv[1:] if not a.startswith("--")), os.path.join(HERE, "build"))
BETA = "--beta" in sys.argv or "--pwa" in sys.argv
PWA = "--pwa" in sys.argv

VARIANTS = {
    "sek1": dict(stufe="Sek I", online="Pruefung_Sek1.html", offline="Sek1_Bewertung_mdl_Pruefung.html"),
    "ef":   dict(stufe="EF", online="Pruefung_EF.html", offline="EF_Bewertung_mdl_Pruefung.html"),
    "q":    dict(stufe="Q-Phase", online="Pruefung_Q.html", offline="Q-Phase_Bewertung_mdl_Pruefung.html"),
}
CDN = [
    ('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>', "pdf-lib.min.js"),
    ('<script src="https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>', "fontkit.umd.min.js"),
    ('<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>', "jszip.min.js"),
    ('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>', "xlsx.full.min.js"),
]
FONT_LINES = re.compile(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\n'
                        r'<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin>\n'
                        r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2[^"]*">\n')
SKELETON = ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>')

def read(p):
    with open(os.path.join(HERE, p), encoding="utf-8") as f:
        return f.read()

def build(variant, skeleton=None):
    v = VARIANTS[variant]
    s = read("app.src.html")
    title = f'{v["stufe"]} – Bewertung mdl. Prüfung' + (" (Beta)" if BETA else "")
    s = (s.replace("__TITLE__", title).replace("__STUFE__", v["stufe"]).replace("__VARIANT__", variant)
          .replace("__BETA__", "true" if BETA else "false").replace("__PWA__", "true" if PWA else "false")
          .replace("__TEMPLATE_B64__", read(f"tpl/{variant}.b64")))
    assert "__" + "TITLE" not in s
    online = s
    off = FONT_LINES.sub("", s, count=1)
    for tag, lib in CDN:
        assert off.count(tag) == 1, tag
        off = off.replace(tag, "<script>" + read("lib/" + lib) + "</script>")
    offline = (skeleton or SKELETON) + off + "\n</body></html>"
    return online, offline

if __name__ == "__main__" and PWA:
    import pwa
    pwa.build_site(OUT, build, VARIANTS)
    sys.exit(0)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    pre = "Beta_" if BETA else ""
    for k, v in VARIANTS.items():
        on, off = build(k)
        for name, data in ((v["online"], on), (v["offline"], off)):
            with open(os.path.join(OUT, pre + name), "w", encoding="utf-8") as f:
                f.write(data)
        print(k, f"{len(on)//1024} KB online, {len(off)//1024} KB offline")
