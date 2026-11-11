"""Pocket kit: profile pictures, covers, web icons and post templates, composed from the final logo files.

usage: kit.py <brand/logo> <folder with hi-res PNGs> <figtree-700.ttf>
"""
import json, os, shutil, sys
from PIL import Image, ImageDraw, ImageFont

L, HIRES, FONT = sys.argv[1], sys.argv[2], sys.argv[3]
NAVY, OFF, PALE = (15, 46, 82), (244, 251, 253), (184, 231, 241)
TAG = "La capa de growth para startups"
LINES = ("Pocket, la capa de", "growth para startups")

for d in ("redes/perfil", "redes/portadas", "web", "posts/plantillas", "posts/marca-de-agua"):
    os.makedirs(f"{L}/{d}", exist_ok=True)


def src(name):
    im = Image.open(f"{HIRES}/{name}.png").convert("RGBA")
    return im.crop(im.getchannel("A").getbbox())


LOGO_W, LOGO_N = src("logo-white"), src("logo-navy")
SYM_W, SYM_N = src("symbol-white"), src("symbol-navy")
P3D_C = Image.open(f"{L}/3d/p-3d-celeste-transparent.png").convert("RGBA")
P3D_N = Image.open(f"{L}/3d/p-3d-navy-transparent.png").convert("RGBA")


def scale(im, w=None, h=None):
    z = w / im.width if w else h / im.height
    assert z <= 1, f"would upscale x{z:.2f}"
    return im.resize((round(im.width * z), round(im.height * z)), Image.LANCZOS)


def put(bg, im, cx, cy):
    bg.paste(im, (round(cx - im.width / 2), round(cy - im.height / 2)), im)


def text(bg, lines, size, cx, top, fill, max_w=None, anchor="ma"):
    d = ImageDraw.Draw(bg)
    f = ImageFont.truetype(FONT, size)
    while max_w and max(d.textlength(t, font=f) for t in lines) > max_w:
        size -= 1
        f = ImageFont.truetype(FONT, size)
    for i, t in enumerate(lines):
        d.text((cx, top + i * size * 1.18), t, font=f, fill=fill, anchor=anchor)
    return size


def save(bg, path):
    bg.convert("RGB").save(f"{L}/{path}.png", optimize=True)


def stack(bg, logo, logo_w, tag_size, fill, cx=None, cy=None):
    # logo above the tagline, the pair centred on the given point
    cx = bg.width / 2 if cx is None else cx
    cy = bg.height / 2 if cy is None else cy
    m = scale(logo, w=logo_w)
    gap = tag_size * .55
    top = cy - (m.height + gap + tag_size) / 2
    put(bg, m, cx, top + m.height / 2)
    text(bg, (TAG,), tag_size, cx, top + m.height + gap, fill)


# Profile pictures: the P stays inside the circle every network crops to
b = Image.new("RGBA", (1080, 1080), NAVY); put(b, scale(P3D_C, h=660), 540, 540); save(b, "redes/perfil/perfil-3d-1080")
b = Image.new("RGBA", (1080, 1080), NAVY); put(b, scale(SYM_W, h=640), 540, 540); save(b, "redes/perfil/perfil-plano-1080")

# Covers: flat logo, centred, because each network hides a different corner
for name, w, h, lw, ts in (("x-header-1500x500", 1500, 500, 520, 44),
                           ("linkedin-portada-1512x256", 1512, 256, 360, 30),
                           ("youtube-banner-2560x1440", 2560, 1440, 760, 62)):
    b = Image.new("RGBA", (w, h), NAVY); stack(b, LOGO_W, lw, ts, PALE); save(b, f"redes/portadas/{name}")

# Web
for f in ("favicon-16", "favicon-32", "favicon-48"):
    shutil.copy(f"{L}/png/{f}.png", f"{L}/web/{f}.png")
shutil.copy(f"{L}/favicon.ico", f"{L}/web/favicon.ico")
shutil.copy(f"{L}/svg/favicon.svg", f"{L}/web/favicon.svg")
for n in ("logo-navy", "logo-white", "logo-navy-chico", "logo-white-chico"):
    shutil.copy(f"{L}/svg/{n}.svg", f"{L}/web/{n}.svg")
for z, n in ((180, "apple-touch-icon"), (192, "icon-192"), (512, "icon-512")):
    b = Image.new("RGBA", (1024, 1024), NAVY); put(b, scale(P3D_C, h=640), 512, 512)
    save(b.resize((z, z), Image.LANCZOS), f"web/{n}")
# maskable: Android may crop to the central 80% circle, so the P sits smaller
b = Image.new("RGBA", (1024, 1024), NAVY); put(b, scale(P3D_C, h=520), 512, 512)
save(b.resize((512, 512), Image.LANCZOS), "web/icon-maskable-512")
b = Image.new("RGBA", (1200, 630), NAVY); stack(b, LOGO_W, 640, 46, PALE); save(b, "web/og-image-1200x630")
json.dump({"name": "Pocket", "short_name": "Pocket", "theme_color": "#0F2E52", "background_color": "#0F2E52", "display": "standalone",
           "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
                     {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
                     {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]},
          open(f"{L}/web/site.webmanifest", "w"), indent=2)

# Watermarks on a transparent background
for im, n in ((LOGO_W, "logo-white"), (LOGO_N, "logo-navy"), (SYM_W, "symbol-white"), (SYM_N, "symbol-navy")):
    im.save(f"{L}/posts/marca-de-agua/{n}.png", optimize=True)

# Post templates. "anuncio" is ready to publish, "base" leaves the space free for your content
THEMES = (("navy", NAVY, P3D_C, LOGO_W, OFF), ("claro", OFF, P3D_N, LOGO_N, NAVY))
VERTICAL = (("cuadrado-1080x1080", 1080, 1080, 560, 420, 760, 84, 300, 960),
            ("vertical-1080x1350", 1080, 1350, 700, 530, 980, 88, 320, 1220),
            ("historia-1080x1920", 1080, 1920, 760, 800, 1290, 92, 340, 1590))
for t, bg, p, logo, ink in THEMES:
    for name, w, h, ph, py, ty, ts, lw, ly in VERTICAL:
        b = Image.new("RGBA", (w, h), bg); put(b, scale(p, h=ph), w / 2, py)
        text(b, LINES, ts, w / 2, ty, ink, max_w=880); save(b, f"posts/plantillas/anuncio-{name}-{t}")
        b = Image.new("RGBA", (w, h), bg); put(b, scale(logo, w=lw), w / 2, ly); save(b, f"posts/plantillas/base-{name}-{t}")
    b = Image.new("RGBA", (1200, 627), bg); put(b, scale(p, h=430), 310, 313)
    text(b, ("Pocket, la capa", "de growth para", "startups"), 72, 590, 190, ink, max_w=560, anchor="la")
    save(b, f"posts/plantillas/anuncio-horizontal-1200x627-{t}")
    b = Image.new("RGBA", (1200, 627), bg); put(b, scale(logo, w=260), 600, 545); save(b, f"posts/plantillas/base-horizontal-1200x627-{t}")
print("ok")
