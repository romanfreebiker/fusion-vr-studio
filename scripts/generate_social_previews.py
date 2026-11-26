#!/usr/bin/env python3
"""Create branded ESKALA WhatsApp/email link previews from active shared designs."""
from __future__ import annotations

import argparse
from base64 import b32encode
import hashlib
import html
import json
import shutil
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
HOST = "https://romanfreebiker.github.io/fusion-vr-studio/"
SOCIAL = ROOT / "social"
BASE = (1200, 630)
BG = "#151e26"
CYAN = "#21dbf1"
PUBLIC_SHORT_URL = re.compile(r"https://is\.gd/[a-zA-Z0-9_]{5,10}")
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

def short_page(model, slug, area='v', branded_path=None):
    name = str(model.get("nombre") or "Diseño 3D").strip()
    ident = str(model["id"])
    link = HOST + area + "/" + slug + "/"
    image = HOST + "social/" + slug + ".jpg"
    image_src = "../../social/" + slug + ".jpg"
    viewer_src = "../../visor.html"
    if branded_path:
        viewer = HOST + "visor.html?modo=presentacion&diseno=" + quote(ident, safe="") + "&acceso=invitado&v=120"
        return branded_viewer_page(name, HOST + branded_path, viewer)
    viewer = viewer_src + "?modo=presentacion&diseno=" + quote(ident, safe="") + "&acceso=invitado&v=120"
    page_title = "ESKALA | " + name
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

def branded_viewer_page(name, link, viewer):
    title = html.escape(name, quote=True)
    canonical = html.escape(link, quote=True)
    target = html.escape(viewer, quote=True)
    image = canonical + "preview.jpg"
    description = "Explora este diseño en 3D con ESKALA Studio."
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{image}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{title} · ESKALA Studio">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ESKALA Studio">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{image}">
<meta name="description" content="{description}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="{canonical}">
<title>{title} · ESKALA Studio</title>
<style>
html,body{{margin:0;width:100%;height:100%;background:#151e26;color:#eef7fa}}
iframe{{display:block;border:0;width:100%;height:100%}}
noscript a{{display:block;padding:1rem;color:#73daf0}}
</style>
</head>
<body>
<iframe id="eskalaViewer" title="Visor ESKALA · {title}" allowfullscreen></iframe>
<div id="eskalaDenied" hidden style="padding:2rem;font:16px system-ui;color:#eef7fa;background:#151e26">Este enlace necesita un acceso individual activo.</div>
<script>
(function(){{
  const queryToken=new URLSearchParams(location.search).get('share')||'';
  const rawHash=location.hash.replace(/^#/,'');
  const hashParams=new URLSearchParams(rawHash);
  const hashToken=hashParams.get('share')||hashParams.get('s')||(!rawHash.includes('=')?rawHash:'');
  const token=queryToken||hashToken;
  const frame=document.getElementById('eskalaViewer');
  if(!token){{frame.remove();document.getElementById('eskalaDenied').hidden=false;return;}}
  const target=new URL({json.dumps(viewer,ensure_ascii=False)});
  target.searchParams.set('share',token);
  frame.src=target.href;
}})();
</script>
<noscript><a href="{target}">Activa JavaScript para abrir el diseño en ESKALA Studio</a></noscript>
</body>
</html>
"""

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def shorten_link(target):
    opener = build_opener(NoRedirect)
    data = urlencode({"format": "json", "url": target}).encode("ascii")
    request = Request("https://is.gd/create.php", data=data, headers={"User-Agent": "ESKALA Studio"})
    try:
        with opener.open(request, timeout=10) as response:
            result = json.load(response)
        link = result.get("shorturl", "") if isinstance(result, dict) else ""
        if not isinstance(link, str) or not PUBLIC_SHORT_URL.fullmatch(link):
            return None
        try:
            with opener.open(Request(link, headers={"User-Agent": "WhatsApp/2.2236.3 N"}), timeout=10):
                return None
        except HTTPError as redirect:
            with redirect:
                if redirect.code in (301, 302, 303, 307, 308) and redirect.headers.get("Location") == target:
                    return link
    except (OSError, ValueError):
        return None
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shorten", action="store_true", help="Crear enlaces is.gd para las tarjetas nuevas")
    args = parser.parse_args()
    data = json.loads((ROOT / "catalogo.json").read_text(encoding="utf-8"))
    models = data.get("modelos", [])
    SOCIAL.mkdir(exist_ok=True)
    manifest_path = SOCIAL / "shares.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")).get("designs", {}) if manifest_path.is_file() else {}
    brand_file = ROOT / "assets" / "eskala-corporativa.webp"
    if not brand_file.exists():
        raise SystemExit("No se encuentra el diseño maestro ESKALA.")
    with Image.open(brand_file) as im:
        brand = im.convert("RGB")
    seen = set()
    shares = {}
    for m in models:
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
        digest.update(short_page(m, slug, branded_path=f"p/{slug}/000000000000/").encode("utf-8"))
        digest.update(image_path.read_bytes())
        version = str(m.get("fecha") or m.get("updated") or "")
        digest.update(version.encode("utf-8"))
        revision = digest.hexdigest()[:12]
        path = f"p/{slug}/{revision}/"
        folder = ROOT / path
        folder.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image_path, folder / "preview.jpg")
        (folder / "index.html").write_text(short_page(m, slug, branded_path=path), encoding="utf-8")
        alias = b32encode(digest.digest()[:5]).decode("ascii").lower()
        short_path = f"s/{alias}/"
        short_dir = ROOT / short_path
        short_index = short_dir / "index.html"
        short_image = short_dir / "preview.jpg"
        short_html = short_page(m, slug, branded_path=short_path)
        if ((short_index.exists() and short_index.read_text(encoding="utf-8") != short_html)
                or (short_image.exists() and short_image.read_bytes() != image_path.read_bytes())):
            raise ValueError("El enlace corto ya corresponde a otra tarjeta: " + alias)
        short_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image_path, short_image)
        short_index.write_text(short_html, encoding="utf-8")
        entry = {"path": path, "shortPath": short_path, "updated": version}
        old = previous.get(ident, {})
        short_url = old.get("shortUrl", "")
        if old.get("shortPath") != short_path or not isinstance(short_url, str) or not PUBLIC_SHORT_URL.fullmatch(short_url):
            short_url = shorten_link(HOST + short_path) if args.shorten else None
        if short_url:
            entry["shortUrl"] = short_url
        elif args.shorten:
            print("Sin enlace externo, se conserva la ruta ESKALA:", short_path)
        shares[ident] = entry
        print("Vista previa:", ident, "=>", short_path)
    manifest = json.dumps({"version": 1, "designs": shares}, ensure_ascii=False, indent=2, sort_keys=True)
    manifest_path.write_text(manifest + "\n", encoding="utf-8")
    print("Total de enlaces preparados:", len(shares))

if __name__ == "__main__":
    main()
