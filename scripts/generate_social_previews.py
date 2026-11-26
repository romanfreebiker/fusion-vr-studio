#!/usr/bin/env python3
"""Create branded ESKALA WhatsApp/email link previews from active shared designs."""
from __future__ import annotations

import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
HOST = "https://romanfreebiker.github.io/fusion-vr-studio/"
SOCIAL = ROOT / "social"
BASE = (1200, 630)
BG = "#151e26"
CYAN = "#21dbf1"
SLUG = re.compile(r"^[a-zA-Z0-9_-]+$")
MODEL = re.compile(r"^modelos/[a-zA-Z0-9_-]+\.glb$")
THUMB = re.compile(r"^miniaturas/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$", re.I)

def font(size: int, bold: bool = False):
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

def text_lines(draw, value, face, max_width, max_lines=4):
    words = str(value).split()
    lines = []
    for word in words:
        if lines and draw.textbbox((0, 0), lines[-1] + " " + word, font=face)[2] <= max_width:
            lines[-1] += " " + word
        else:
            lines.append(word)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and draw.textbbox((0,0), lines[-1] + "…", font=face)[2] > max_width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines

def make_cover(model, brand):
    dest = Image.new("RGB", BASE, BG)
    draw = ImageDraw.Draw(dest)
    draw.rectangle((0, 0, 1199, 181), fill="#101820")

    # Preserve the approved master image exactly. Screen compositing only removes
    # its black rectangular backdrop; it does not change the artwork.
    b = brand.copy()
    b.thumbnail((1030, 166), Image.Resampling.LANCZOS)
    bgpart = Image.new("RGB", b.size, "#101820")
    dest.paste(ImageChops.screen(bgpart, b), (45, max(3, (178 - b.height) // 2)))
    draw.line((45, 183, 1155, 183), fill=CYAN, width=3)

    box = (43, 212, 814, 569)
    draw.rounded_rectangle((38, 207, 819, 574), radius=17, fill="#223448", outline="#287c93", width=3)
    mini = str(model.get("miniatura") or "")
    image_file = ROOT / mini if THUMB.fullmatch(mini) else None
    if image_file and image_file.is_file():
        with Image.open(image_file) as img:
            fit = ImageOps.contain(img.convert("RGB"), (box[2]-box[0], box[3]-box[1]), Image.Resampling.LANCZOS)
            dest.paste(fit, (box[0] + (box[2]-box[0]-fit.width)//2,
                             box[1] + (box[3]-box[1]-fit.height)//2))
    else:
        draw.text((270, 345), "VISITA 3D", fill="#7dcbe2", font=font(40, True))

    draw.text((859, 222), "DISEÑO 3D", font=font(20, True), fill=CYAN)
    title = str(model.get("nombre") or "Diseño 3D").strip()
    for i, line in enumerate(text_lines(draw, title, font(34, True), 300, 5)):
        draw.text((859, 280 + 49 * i), line, font=font(34, True), fill="#f5f9ff")
    draw.text((859, 527), "Abrir y recorrer", font=font(20), fill="#b2c8d8")
    draw.text((859, 552), "en ESKALA", font=font(20, True), fill="#f3fcff")

    draw.line((0, 612, 1199, 612), fill=CYAN, width=4)
    return dest

def short_page(model, slug, area='v', revision=None):
    name = str(model.get("nombre") or "Diseño 3D").strip()
    ident = str(model["id"])
    link = HOST + area + "/" + slug + "/"
    image = HOST + "social/" + slug + ".jpg"
    image_src = "../../social/" + slug + ".jpg"
    viewer_src = "../../visor.html"
    if revision:
        link += revision + "/"
        image += "?r=" + revision
        image_src = image
        viewer_src = HOST + "visor.html"
    viewer = viewer_src + "?modo=presentacion&diseno=" + quote(ident, safe="") + "&acceso=invitado&v=100"
    page_title = ("ESKALA Studio · " if revision else "ESKALA | ") + name
    desc = "Explora " + name + " en 3D. Vista interactiva y recorrido virtual en ESKALA."
    esc = lambda x: html.escape(x, quote=True)
    # JS redirect instead of HTTP/meta-refresh: social preview crawlers must read
    # the Open Graph metadata while browsers continue seamlessly to the 3D viewer.
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(page_title)}</title>
<link rel="canonical" href="{esc(link)}">
<meta name="description" content="{esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="ESKALA Studio">
<meta property="og:title" content="{esc(page_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(link)}">
<meta property="og:image" content="{esc(image)}">
<meta property="og:image:secure_url" content="{esc(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc('ESKALA · ' + name + ' · Vista previa 3D')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(page_title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{esc(image)}">
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#151e26;color:#e7f2fa;font:16px system-ui}}
main{{max-width:660px;padding:20px;text-align:center}}
img{{width:100%;border-radius:12px;border:1px solid #2388a0}}
a{{display:inline-block;padding:13px 24px;margin-top:12px;border-radius:9px;background:#147a9a;color:white;font-weight:700;text-decoration:none}}
</style>
</head>
<body>
<main>
<img src="{esc(image_src)}" alt="{esc('ESKALA: ' + name)}" width="1200" height="630">
<h1>{esc(name)}</h1>
<p>Diseño 3D interactivo · ESKALA by Roman</p>
<a href="{esc(viewer)}">Abrir diseño 3D</a>
</main>
<script>setTimeout(function(){{location.replace({json.dumps(viewer,ensure_ascii=False)})}},350)</script>
</body>
</html>
"""

def main():
    data = json.loads((ROOT / "distribucion.json").read_text(encoding="utf-8"))
    models = data.get("modelos", [])
    SOCIAL.mkdir(exist_ok=True)
    brand_file = ROOT / "assets" / "eskala-corporativa.webp"
    if not brand_file.exists():
        raise SystemExit("No se encuentra el diseño maestro ESKALA.")
    with Image.open(brand_file) as im:
        brand = im.convert("RGB")
    seen = set()
    shares = {}
    for m in models:
        if m.get("status") != "active":
            continue
        ident = str(m.get("id") or "")
        if not SLUG.fullmatch(ident) or "-" not in ident:
            print("Omitido identificador no válido:", repr(ident))
            continue
        slug = ident.rsplit("-", 1)[-1]
        if not SLUG.fullmatch(slug) or slug in seen:
            raise ValueError("Identificador corto duplicado o no válido: " + slug)
        seen.add(slug)
        model_path = str(m.get("archivo") or "")
        thumb_path = str(m.get("miniatura") or "")
        if (not MODEL.fullmatch(model_path) or not (ROOT / model_path).is_file()
                or not THUMB.fullmatch(thumb_path) or not (ROOT / thumb_path).is_file()):
            print("Sin tarjeta nueva: faltan archivos publicados de", ident)
            continue
        image_path = SOCIAL / (slug + ".jpg")
        make_cover(m, brand).save(image_path, "JPEG", quality=88, optimize=True, subsampling=0)
        # Mantener /v/ como enlace de compatibilidad para mensajes antiguos.
        # /p/ es el enlace actualizado, con URL OG independiente.
        for area in ("v", "p"):
            short_dir = ROOT / area / slug
            short_dir.mkdir(parents=True, exist_ok=True)
            (short_dir / "index.html").write_text(short_page(m, slug, area), encoding="utf-8")
        # Keep each shared URL stable until its card or distribution revision changes.
        digest = hashlib.sha256()
        digest.update(short_page(m, slug, "p", "000000000000").encode("utf-8"))
        digest.update(image_path.read_bytes())
        digest.update(str(m.get("updated", "")).encode("utf-8"))
        revision = digest.hexdigest()[:12]
        path = f"p/{slug}/{revision}/"
        folder = ROOT / path
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "index.html").write_text(short_page(m, slug, "p", revision), encoding="utf-8")
        shares[ident] = {"path": path, "updated": m.get("updated")}
        print("Vista previa:", ident, "=>", path)
    manifest = json.dumps({"version": 1, "designs": shares}, ensure_ascii=False, indent=2, sort_keys=True)
    (SOCIAL / "shares.json").write_text(manifest + "\n", encoding="utf-8")
    print("Total de enlaces preparados:", len(shares))

if __name__ == "__main__":
    main()
