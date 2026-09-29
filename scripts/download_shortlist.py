#!/usr/bin/env python3
"""Download shortlisted Commons thumbs and build labeled contact sheets for VLM review."""
import json, subprocess, os, sys, time
from PIL import Image, ImageDraw, ImageFont

UNIQ = '/home/z/my-project/data/commons_uniq.json'
DL = '/home/z/my-project/data/shortlist'
SHEETS = '/home/z/my-project/data/sheets'

# curated shortlist: index into commons_uniq.json
SHORTLIST = [
    # landscapes
    8, 16, 25, 55, 99, 61, 88, 109, 79, 58, 52,
    # fungi
    196, 202, 230, 227, 216, 195,
    # plants
    194, 183, 171, 175, 172,
    # people
    346, 344, 343, 337, 323,
    # night
    297, 316, 320, 299, 314, 298,
    # cityscapes
    260, 267, 285, 265, 286,
    # astronomy
    30, 74, 73, 69, 111,
    # birds
    401, 396, 415, 418, 403, 404,
    # architecture
    29, 131, 80, 126, 115,
    # animals in flight
    380, 389, 395, 390,
    # cetacea
    425, 431, 432,
    # still life
    367, 363,
]

uniq = json.load(open(UNIQ))
os.makedirs(DL, exist_ok=True)
os.makedirs(SHEETS, exist_ok=True)

def fetch(idx, url, tries=3):
    path = f'{DL}/{idx}.jpg'
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        return path
    for t in range(tries):
        out = subprocess.run(['curl', '-s', '-L', '--max-time', '120',
                              '-H', 'User-Agent: RealOrAI-Quest-Game/1.0 (curation)',
                              '-o', path, '-w', '%{http_code}', url],
                             capture_output=True, text=True, timeout=150)
        if out.stdout == '200' and os.path.getsize(path) > 5000:
            return path
        time.sleep(4 + 3 * t)
    print(f'FAILED {idx}', file=sys.stderr)
    if os.path.exists(path):
        os.remove(path)
    return None

ok_idx = []
for i in SHORTLIST:
    url = uniq[i]['thumburl']
    if not url:
        print(f'no thumb for {i}', file=sys.stderr)
        continue
    p = fetch(i, url)
    if p:
        ok_idx.append(i)
        print(f'{i} ok ({os.path.getsize(p)//1024}KB)', flush=True)
    time.sleep(1.0)

json.dump(ok_idx, open('/home/z/my-project/data/shortlist_ok.json', 'w'))
print(f'\nDownloaded {len(ok_idx)}/{len(SHORTLIST)}')

# ---- contact sheets: 3 cols x 4 rows, thumb 320x240 + label ----
COLS, ROWS = 3, 4
TW, TH = 320, 240
PER = COLS * ROWS
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception:
    font = ImageFont.load_default()

sheets = 0
for s in range(0, len(ok_idx), PER):
    batch = ok_idx[s:s+PER]
    sheet = Image.new('RGB', (COLS * TW, ROWS * (TH + 28)), (18, 18, 24))
    draw = ImageDraw.Draw(sheet)
    for k, idx in enumerate(batch):
        r, c = divmod(k, COLS)
        try:
            im = Image.open(f'{DL}/{idx}.jpg').convert('RGB')
            im.thumbnail((TW, TH))
            ox = c * TW + (TW - im.width) // 2
            oy = r * (TH + 28) + 28 + (TH - im.height) // 2
            sheet.paste(im, (ox, oy))
        except Exception as e:
            print(f'sheet err {idx}: {e}', file=sys.stderr)
        draw.text((c * TW + 8, r * (TH + 28) + 4), f'#{idx}', fill=(255, 220, 60), font=font)
    sp = f'{SHEETS}/sheet_{sheets:02d}.jpg'
    sheet.save(sp, quality=88)
    print('saved', sp, 'entries:', batch)
    sheets += 1
