#!/usr/bin/env python3
"""Assemble src/data/rounds.json from all pipeline outputs."""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda p: os.path.join(BASE, 'data', p)

real_images = json.load(open(D('real_images.json')))
manifest = json.load(open(D('fake_manifest.json')))['image']
tells = json.load(open(D('fake_tells.json')))
texts = json.load(open(D('text_rounds_raw.json')))

manifest_by_slug = {m['slug']: m for m in manifest}

rounds = []

# ---- image rounds ----
for r in real_images:
    if r.get('use') != 'image':
        continue
    slug = r['slug']
    m = manifest_by_slug.get(slug)
    if not m:
        print('WARN no manifest for', slug)
        continue
    fake_url = f"/content/fake/{slug}.jpg"
    if not os.path.exists(os.path.join(BASE, 'public', 'content', 'fake', f"{slug}.jpg")):
        print('WARN no fake file for', slug)
        continue
    t = tells.get(slug, {})
    rounds.append({
        "id": f"img-{slug}",
        "kind": "image",
        "difficulty": m['tier'],
        "category": r['category'],
        "real": {
            "url": r['file'],
            "title": r['title'],
            "description": (r.get('description') or '').strip(),
            "author": r.get('artist') or r.get('author') or 'Unknown',
            "license": r.get('license') or '',
            "licenseUrl": r.get('licenseUrl') or '',
            "sourceUrl": r.get('sourceUrl') or '',
            "subject": r['category'],
        },
        "fake": {
            "url": fake_url,
            "prompt": m['prompt'],
            "generator": "Pre-baked diffusion model",
            "seed": None,
            "tells": t.get('tells', ["Overly clean, idealized rendering"]),
        },
    })

# ---- text rounds ----
TEXT_CAT = {
    'novel': ('novel opening', 'Novel Opening'),
    'poem': ('poetry', 'Poetry'),
    'proverb': ('proverb', 'Proverb'),
    'caption': ('photo caption', 'Photo Caption'),
}
for e in texts:
    if not e.get('fake'):
        print('WARN no fake for', e['slug'])
        continue
    cat_key, cat_label = TEXT_CAT[e['kind']]
    rounds.append({
        "id": f"txt-{e['slug']}",
        "kind": "text",
        "difficulty": e['tier'],
        "category": cat_label,
        "real": {
            "text": e['text'],
            "source": f"\u201c{e['title']}\u201d \u2014 {e['author']}, {e['year']}",
            "sourceUrl": e['sourceUrl'],
            "category": cat_key,
        },
        "fake": {
            "text": e['fake'],
            "prompt": f"Write a fake {cat_key} to pair against \u201c{e['title']}\u201d (tier {e['tier']} imitation)",
            "generator": "Pre-baked LLM",
            "tells": e.get('tells', []),
            "category": cat_key,
        },
    })

os.makedirs(os.path.join(BASE, 'src', 'data'), exist_ok=True)
out_path = os.path.join(BASE, 'src', 'data', 'rounds.json')
json.dump(rounds, open(out_path, 'w'), ensure_ascii=False, indent=1)

img = [r for r in rounds if r['kind'] == 'image']
txt = [r for r in rounds if r['kind'] == 'text']
tiers = {}
for r in rounds:
    tiers[(r['kind'], r['difficulty'])] = tiers.get((r['kind'], r['difficulty']), 0) + 1
print(f"rounds.json: {len(rounds)} rounds ({len(img)} image / {len(txt)} text)")
print("tier split:", {f"{k[0]}-t{k[1]}": v for k, v in sorted(tiers.items())})
print(f"size: {os.path.getsize(out_path)//1024} KB")
