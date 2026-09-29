#!/usr/bin/env python3
"""
Optimize shortlisted real photos into public/content/real/ and build
the real-images manifest with full attribution (title, author, license, links).
"""
import json, os, re
from PIL import Image, ImageOps

UNIQ = '/home/z/my-project/data/commons_uniq.json'
VLM = '/home/z/my-project/data/vlm_review.json'
DL = '/home/z/my-project/data/shortlist'
OUTDIR = '/home/z/my-project/public/content/real'
MANIFEST = '/home/z/my-project/data/real_images.json'

# idx -> slug (readable filenames) and category labels
IMAGE_ROUNDS = {
    # landscapes
    8:   ('mountain-sunbeams', 'Landscape'),
    52:  ('sunrise-ridges', 'Landscape'),
    58:  ('wheat-fields', 'Landscape'),
    61:  ('baobab-savanna', 'Landscape'),
    88:  ('volcano-salt-flat', 'Landscape'),
    55:  ('desert-rock-formations', 'Landscape'),
    25:  ('autumn-mountain-slopes', 'Landscape'),
    79:  ('grassland-road-sunset', 'Landscape'),
    99:  ('dead-tree-clay-pan', 'Landscape'),
    # fungi
    216: ('yellow-jelly-fungus', 'Macro Nature'),
    230: ('orange-bracket-fungus', 'Macro Nature'),
    196: ('fly-agaric', 'Macro Nature'),
    227: ('earthstar-fungus', 'Macro Nature'),
    202: ('mushroom-basket', 'Macro Nature'),
    195: ('caesars-amanita', 'Macro Nature'),
    # plants
    194: ('dog-rose', 'Macro Nature'),
    171: ('pink-meadow-flower', 'Macro Nature'),
    183: ('round-leaved-plant', 'Macro Nature'),
    175: ('mossy-bracket-fungus', 'Macro Nature'),
    172: ('stump-texture-bw', 'Macro Nature'),
    # people
    355: ('cheroot-smoker', 'People'),
    346: ('elderly-man-rhodes-bw', 'People'),
    342: ('hammerhead-carrier', 'People'),
    349: ('roadside-workshop', 'People'),
    344: ('bearded-pipe-smoker-bw', 'People'),
    336: ('subway-escalator-bw', 'People'),
    347: ('girl-at-stove', 'People'),
    354: ('man-with-donkey', 'People'),
    359: ('cotton-miller', 'People'),
    # night
    320: ('milky-way-silhouette', 'Night'),
    314: ('gothic-cathedral-night', 'Night'),
    299: ('light-arches-street', 'Night'),
    298: ('museum-at-night', 'Night'),
    316: ('chateau-chillon-dusk', 'Night'),
    # cityscapes
    286: ('singapore-skyline', 'Cityscapes'),
    265: ('cliffside-village', 'Cityscapes'),
    285: ('waterfront-canal-houses', 'Cityscapes'),
    260: ('amsterdam-canal', 'Cityscapes'),
    # astronomy
    30:  ('rho-ophiuchi', 'Space'),
    74:  ('crab-nebula', 'Space'),
    73:  ('comet-neowise', 'Space'),
    111: ('perseid-meteor', 'Space'),
    69:  ('aurora-star-trails', 'Space'),
    # birds
    418: ('bird-red-flowers', 'Birds'),
    401: ('bohemian-waxwing', 'Birds'),
    404: ('verditer-flycatcher', 'Birds'),
    396: ('reed-parrotbill', 'Birds'),
    403: ('weaver-bird-nest', 'Birds'),
    # architecture
    126: ('infinity-pool-pavilion', 'Architecture'),
    131: ('alhambra-arcade', 'Architecture'),
    115: ('alhambra-courtyard', 'Architecture'),
    29:  ('station-clock-bw', 'Architecture'),
    80:  ('astronomical-clock', 'Architecture'),
    # in flight
    380: ('bee-mid-air', 'In Flight'),
    389: ('hummingbird-hawkmoth', 'In Flight'),
    395: ('bat-in-sky', 'In Flight'),
    390: ('dragonfly-in-flight', 'In Flight'),
    # whales
    431: ('humpback-with-calf', 'Underwater'),
    432: ('dolphin-leap', 'Underwater'),
    # still life
    363: ('bolts-city-bw', 'Still Life'),
    367: ('pepper-bw', 'Still Life'),
}

# caption rounds keep the image too (displayed with the caption pair)
CAPTION_IDS = {
    16:  ('ribblehead-viaduct', 'Landscape'),
    109: ('horses-on-beach', 'Landscape'),
    297: ('snow-ruins-stars', 'Night'),
    337: ('street-snack-seller', 'People'),
    343: ('man-at-stove', 'People'),
    415: ('rufous-hornero-nest', 'Birds'),
    425: ('sperm-whale-mother-calf', 'Underwater'),
}

uniq = json.load(open(UNIQ))
vlm = {}
for e in json.load(open(VLM)):
    vlm[e['id']] = e
# extra people batch results (from the inline run)
vlm_extra = {
    336: {"photo": True, "subject": "People walking down a long subway escalator"},
    342: {"photo": True, "subject": "Person carrying large fish on back in street"},
    347: {"photo": True, "subject": "Woman crouching near a fire or stove"},
    354: {"photo": True, "subject": "Man standing with donkey carrying green fodder"},
    359: {"photo": True, "subject": "Person working with fibers inside a dark hut"},
    349: {"photo": True, "subject": "People sitting at an open-air roadside shop"},
    355: {"photo": True, "subject": "Close-up of man smoking a cigarette"},
}
vlm.update(vlm_extra)

os.makedirs(OUTDIR, exist_ok=True)
manifest = []
fails = []

def process(idx, slug, category):
    src = f'{DL}/{idx}.jpg'
    if not os.path.exists(src):
        fails.append((idx, 'missing file'))
        return None
    rec = uniq[idx]
    try:
        im = Image.open(src)
        im = ImageOps.exif_transpose(im)
        im.thumbnail((1024, 1024), Image.LANCZOS)
        if im.mode != 'RGB':
            im = im.convert('RGB')
        fname = f'{slug}.jpg'
        dest = f'{OUTDIR}/{fname}'
        im.save(dest, 'JPEG', quality=84, optimize=True, progressive=True)
        w, h = im.size
        title = rec.get('objectName') or rec['title'].replace('File:', '')
        entry = {
            'idx': idx,
            'slug': slug,
            'file': f'/content/real/{fname}',
            'category': category,
            'title': title[:120],
            'description': rec['description'][:500],
            'author': rec['artist'][:120],
            'license': rec['license'],
            'licenseUrl': rec.get('licenseUrl', ''),
            'sourceUrl': rec['descurl'],
            'width': w, 'height': h,
        }
        return entry
    except Exception as e:
        fails.append((idx, str(e)))
        return None

for idx, (slug, cat) in IMAGE_ROUNDS.items():
    e = process(idx, slug, cat)
    if e:
        e['use'] = 'image'
        manifest.append(e)
for idx, (slug, cat) in CAPTION_IDS.items():
    e = process(idx, slug, cat)
    if e:
        e['use'] = 'caption'
        manifest.append(e)

manifest.sort(key=lambda x: x['idx'])
json.dump(manifest, open(MANIFEST, 'w'), indent=1, ensure_ascii=False)

total = sum(os.path.getsize(f'{OUTDIR}/{f}') for f in os.listdir(OUTDIR))
print(f'processed {len(manifest)} images ({len(fails)} fails), total {total//1024} KB -> {OUTDIR}')
for f in fails:
    print('FAIL', f)
from collections import Counter
print(Counter(m['category'] for m in manifest))
