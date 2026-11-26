"""Conservative cleanup of unreferenced ESKALA assets; no history rewriting."""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
ASSET = re.compile(r"(?:modelos/[a-zA-Z0-9_-]+\.glb|miniaturas/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))", re.I)

def read_rows(file, key):
    data = json.loads((ROOT / file).read_text(encoding="utf-8"))
    rows = data[key]
    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        raise ValueError("Invalid catalog: " + file)
    return rows

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    central = read_rows("catalogo.json", "modelos")
    direction = read_rows("distribucion.json", "modelos")
    shares = read_rows("terceros.json", "accesses")
    # Preserve all links marked active, even when expired or malformed.
    active_ids = {r["designId"] for r in shares if r.get("status") != "inactive" and r.get("status") != "revoked"}
    keep_rows = central + [r for r in direction if r.get("status") != "inactive" or r.get("id") in active_ids]
    protected_ids = active_ids | {r["id"] for r in keep_rows}
    protected = {r.get(k) for r in keep_rows for k in ("archivo", "miniatura")}
    if any(not r.get("archivo") or not ASSET.fullmatch(r["archivo"]) for r in central):
        raise ValueError("Invalid central model path; cleanup aborted")
    paths = [p for p in git("ls-files", "--", "modelos", "miniaturas").splitlines() if ASSET.fullmatch(p)]
    total = sum((ROOT / p).stat().st_size for p in paths)
    print(f"Modelos y miniaturas: {total / 1048576:.1f} MiB")
    if total >= 750 * 1048576:
        print("::warning::ESKALA: almacenamiento de modelos por encima de 750 MiB")
    for p in paths:
        stem = Path(p).stem
        if p in protected or any(stem == ident or stem.startswith(ident + "-") for ident in protected_ids):
            continue
        # Give uploads and catalog changes a 72-hour grace period.
        stamp = git("log", "-1", "--format=%ct", "--", p)
        if not stamp or time.time() - int(stamp) < 72 * 3600:
            continue
        print("Archivo huérfano:", p)
        if args.apply:
            (ROOT / p).unlink()

if __name__ == "__main__":
    main()
