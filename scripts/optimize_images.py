#!/usr/bin/env python3
"""Optimize guest-mode content images: every shipped asset must be < 300 KB.

- Re-encodes any referenced real/fake image > THRESHOLD bytes to WebP
  (progressively lowering quality until it fits under TARGET bytes).
- Updates src/data/rounds.json URLs for re-encoded files.
- Deletes unreferenced real images (spares) from public/content/real.
- Prints a size report.
"""

import json
import os
from PIL import Image

ROOT = "/home/z/my-project"
PUBLIC = os.path.join(ROOT, "public")
ROUNDS = os.path.join(ROOT, "src/data/rounds.json")

THRESHOLD = 220_000   # re-encode anything bigger than this
TARGET = 250_000      # and make sure it lands under this
MAX_LONG_EDGE = 1280  # game cards never need more than ~700px @2x


def encode_webp(img: Image.Image, quality: int) -> bytes:
    import io
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def shrink(path: str) -> tuple[str, int] | None:
    """Re-encode `path` to WebP under TARGET bytes. Returns (new_path, size) or None."""
    with Image.open(path) as im:
        im.load()
        w, h = im.size
        if max(w, h) > MAX_LONG_EDGE:
            scale = MAX_LONG_EDGE / max(w, h)
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        best = None
        for q in (84, 78, 72, 66, 60, 54):
            data = encode_webp(im, q)
            best = (q, data)
            if len(data) <= TARGET:
                break
        q, data = best
        base = os.path.splitext(path)[0]
        new_path = base + ".webp"
        with open(new_path, "wb") as f:
            f.write(data)
        return new_path, len(data)


def main() -> None:
    rounds = json.load(open(ROUNDS))
    referenced: set[str] = set()
    changed: dict[str, str] = {}  # old url -> new url

    # collect every referenced image url (text rounds have no files)
    for r in rounds:
        if r["kind"] != "image":
            continue
        referenced.add(r["real"]["url"])
        referenced.add(r["fake"]["url"])

    converted = 0
    for url in sorted(referenced):
        fs_path = os.path.join(PUBLIC, url.lstrip("/"))
        if not os.path.exists(fs_path):
            print(f"!! MISSING {url}")
            continue
        size = os.path.getsize(fs_path)
        if size <= THRESHOLD:
            continue
        res = shrink(fs_path)
        if not res:
            continue
        new_path, new_size = res
        new_url = "/" + os.path.relpath(new_path, PUBLIC)
        changed[url] = new_url
        converted += 1
        print(f"  {os.path.basename(fs_path)}  {size/1024:.0f} KB -> WebP {new_size/1024:.0f} KB")
        os.remove(fs_path)

    # rewrite rounds.json urls
    if changed:
        for r in rounds:
            if r["kind"] != "image":
                continue
            for side in ("real", "fake"):
                old = r[side]["url"]
                if old in changed:
                    r[side]["url"] = changed[old]
        with open(ROUNDS, "w") as f:
            json.dump(rounds, f, ensure_ascii=False, indent=1)
            f.write("\n")

    # purge unreferenced real images (spares never used by any round).
    # IMPORTANT: recompute the referenced set from the UPDATED rounds.json
    # so freshly-converted .webp files are not treated as spares.
    referenced = set()
    for r in rounds:
        if r["kind"] != "image":
            continue
        referenced.add(r["real"]["url"])
        referenced.add(r["fake"]["url"])
    real_dir = os.path.join(PUBLIC, "content/real")
    removed = 0
    for name in os.listdir(real_dir):
        url = f"/content/real/{name}"
        if url not in referenced:
            os.remove(os.path.join(real_dir, name))
            removed += 1
            print(f"  removed spare: {name}")

    # final report
    print("\n=== FINAL REPORT ===")
    for sub in ("real", "fake"):
        d = os.path.join(PUBLIC, "content", sub)
        sizes = [os.path.getsize(os.path.join(d, n)) for n in os.listdir(d)]
        over = [s for s in sizes if s > 300_000]
        print(
            f"{sub}: {len(sizes)} files, avg {sum(sizes)/len(sizes)/1024:.0f} KB, "
            f"max {max(sizes)/1024:.0f} KB, >300KB: {len(over)}, "
            f"total {sum(sizes)/1024/1024:.1f} MB"
        )
    print(f"converted={converted} removed_spares={removed}")


if __name__ == "__main__":
    main()
