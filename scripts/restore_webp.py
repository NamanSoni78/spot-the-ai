#!/usr/bin/env python3
"""Restore the 17 real-image .webp files deleted by the purge bug in
optimize_images.py, converting fresh from the data/shortlist originals."""

import json
import os
import io
from PIL import Image

ROOT = "/home/z/my-project"
PUBLIC = os.path.join(ROOT, "public")
ROUNDS = os.path.join(ROOT, "src/data/rounds.json")
MANIFEST = os.path.join(ROOT, "data/real_images.json")
SHORTLIST = os.path.join(ROOT, "data/shortlist")

TARGET = 250_000
MAX_LONG_EDGE = 1280


def encode_webp(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def shrink(img: Image.Image) -> bytes:
    w, h = img.size
    if max(w, h) > MAX_LONG_EDGE:
        scale = MAX_LONG_EDGE / max(w, h)
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    best = None
    for q in (84, 78, 72, 66, 60, 54):
        data = encode_webp(img, q)
        best = data
        if len(data) <= TARGET:
            break
    return best


def main() -> None:
    manifest = json.load(open(MANIFEST))
    by_slug = {e["slug"]: e for e in manifest}

    rounds = json.load(open(ROUNDS))
    missing = set()
    for r in rounds:
        if r["kind"] != "image":
            continue
        for side in ("real", "fake"):
            u = r[side]["url"]
            if not os.path.exists(os.path.join(PUBLIC, u.lstrip("/"))):
                missing.add(u)

    print(f"missing: {len(missing)}")
    restored = 0
    for url in sorted(missing):
        assert "/content/real/" in url, f"cannot restore non-real file: {url}"
        slug = os.path.basename(url).rsplit(".", 1)[0]
        entry = by_slug.get(slug)
        if not entry:
            print(f"  !! no manifest entry for {slug}")
            continue
        src = os.path.join(SHORTLIST, f"{entry['idx']}.jpg")
        if not os.path.exists(src):
            print(f"  !! shortlist original missing: {src}")
            continue
        with Image.open(src) as im:
            data = shrink(im)
        dst = os.path.join(PUBLIC, url.lstrip("/"))
        with open(dst, "wb") as f:
            f.write(data)
        restored += 1
        print(f"  restored {url} ({len(data)/1024:.0f} KB) from {src}")

    # final verification: every referenced file exists and is < 300 KB
    bad = []
    for r in rounds:
        if r["kind"] != "image":
            continue
        for side in ("real", "fake"):
            u = r[side]["url"]
            p = os.path.join(PUBLIC, u.lstrip("/"))
            if not os.path.exists(p):
                bad.append(f"MISSING {u}")
            elif os.path.getsize(p) > 300_000:
                bad.append(f"OVERSIZE {u} {os.path.getsize(p)/1024:.0f}KB")
    print(f"\nrestored={restored}  problems={len(bad)}")
    for b in bad:
        print(" ", b)


if __name__ == "__main__":
    main()
