"""Pocket logo: the round P as first letter, "ocket" in Figtree ExtraBold converted to outlines.

usage: logo.py <figtree-800.woff> <brand/logo> <export.html>
Writes svg/logo-*.svg and an HTML page that, opened in Chrome, dumps the PNG exports.
"""
import base64, io, json, re, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

WOFF, OUT, JOBS = sys.argv[1], sys.argv[2], sys.argv[3]
NAVY, YELLOW, OFF = "#0F2E52", "#FFD23F", "#F4FBFD"

font = TTFont(WOFF)
font.flavor = None
buf = io.BytesIO()
font.save(buf)
gs, order = font.getGlyphSet(), font.getGlyphOrder()
UPM, CAP = font["head"].unitsPerEm, font["OS/2"].sCapHeight
TRACK, GAP = -.012 * UPM, .05 * UPM

# shape with HarfBuzz so the word keeps the font's kerning
hb_font = hb.Font(hb.Face(buf.getvalue()))
hb_buf = hb.Buffer()
hb_buf.add_str("ocket")
hb_buf.guess_segment_properties()
hb.shape(hb_font, hb_buf, {"kern": True})
x, parts, bp = 0, [], BoundsPen(gs)
for info, pos in zip(hb_buf.glyph_infos, hb_buf.glyph_positions):
    g = gs[order[info.codepoint]]
    pen = SVGPathPen(gs)
    g.draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, CAP)))
    g.draw(TransformPen(bp, (1, 0, 0, -1, x + pos.x_offset, CAP)))
    parts.append(pen.getCommands())
    x += pos.x_advance + TRACK
OCKET, (OX0, OY0, OX1, OY1) = " ".join(parts), bp.bounds

P = "M36 12 H64 A36 36 0 0 1 64 84 H50 V98 A14 14 0 0 1 22 98 V26 A14 14 0 0 1 36 12 Z"
# centred on the P's full width (22 to 100), so the side margins match
COIN = "M44.5 57 Q42.4 57 42.7 54.9 A18.5 18.5 0 0 1 79.3 54.9 Q79.6 57 77.5 57 Z"
# small sizes: larger coin so it stays visible
COIN_S = "M39 60 Q36.6 60 36.9 57.6 A24.2 24.2 0 0 1 85.1 57.6 Q85.4 60 83 60 Z"


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.1f}" height="{h:.1f}" viewBox="0 0 {w:.1f} {h:.1f}" role="img" '
            f'aria-label="Pocket"><title>Pocket</title>{body}</svg>\n')


def logo(ink, coin=COIN, one_colour=False):
    # P height is 100 units; it sits on the baseline, slightly taller than the capitals
    h = CAP * 1.08
    s = h / 100
    top = min(CAP - h, OY0)
    bottom = max(CAP, OY1)
    mark = (f'<path d="{P} {coin}" fill="{ink}" fill-rule="evenodd"/>' if one_colour
            else f'<path d="{P}" fill="{ink}"/><path d="{coin}" fill="{YELLOW}"/>')
    sw = 78 * s
    body = (f'<g transform="translate({-22 * s:.2f} {CAP - 112 * s - top:.2f}) scale({s:.4f})">{mark}</g>'
            f'<g transform="translate({sw + GAP - OX0:.2f} {-top:.2f})"><path d="{OCKET}" fill="{ink}"/></g>')
    return svg(sw + GAP + OX1 - OX0, bottom - top, body)


files = {
    "logo-navy": logo(NAVY), "logo-white": logo(OFF),
    "logo-mono-navy": logo(NAVY, one_colour=True), "logo-mono-white": logo("#FFFFFF", one_colour=True),
    "logo-navy-chico": logo(NAVY, COIN_S), "logo-white-chico": logo(OFF, COIN_S),
}
for n, c in files.items():
    open(f"{OUT}/svg/{n}.svg", "w").write(c)

jobs = []
def job(name, text, w):
    m = re.search(r'width="([\d.]+)" height="([\d.]+)"', text)
    jobs.append({"name": name, "w": w, "h": round(w * float(m[2]) / float(m[1])), "src": base64.b64encode(text.encode()).decode()})

for n, c in files.items():
    job(f"png/{n}", c, 1600)
job("hires/logo-white", files["logo-white"], 4000)
job("hires/logo-navy", files["logo-navy"], 4000)
for n in ("symbol-white", "symbol-navy"):
    job(f"hires/{n}", open(f"{OUT}/svg/{n}.svg").read(), 1600)

open(JOBS, "w").write(f"""<!doctype html><meta charset="utf-8"><body><pre id="o"></pre><script>
const jobs = {json.dumps(jobs)};
(async () => {{
  let out = '';
  for (const j of jobs) {{
    const im = new Image(); im.src = 'data:image/svg+xml;base64,' + j.src; await im.decode();
    const c = document.createElement('canvas'); c.width = j.w; c.height = j.h;
    c.getContext('2d').drawImage(im, 0, 0, j.w, j.h);
    out += j.name + '|' + c.toDataURL('image/png').split(',')[1] + '\\n';
  }}
  document.getElementById('o').textContent = out;
}})();
</script>""")
print(len(files), "svg,", len(jobs), "png jobs, cap", CAP, "upm", UPM)
