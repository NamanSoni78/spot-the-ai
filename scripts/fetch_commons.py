#!/usr/bin/env python3
"""
Fetch Wikimedia Commons Featured Pictures (by subject) with full metadata.
Polite: 1.5s+ between requests, batched imageinfo (50 titles/call), backoff on 403.
Saves to /home/z/my-project/data/commons_candidates.json
"""
import json, time, re, sys, urllib.request, urllib.parse

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'RealOrAI-Quest-Game/1.0 (one-time build-time curation for an educational guessing game)'
OUT = '/home/z/my-project/data/commons_candidates.json'

def api(params, retries=6):
    import subprocess, shlex
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            out = subprocess.run(
                ['curl', '-s', '--max-time', '90', '--compressed',
                 '-H', 'User-Agent: ' + UA,
                 '-H', 'Accept: application/json',
                 url], capture_output=True, text=True, timeout=120)
            if out.returncode != 0:
                raise RuntimeError(f'curl exit {out.returncode}')
            data = json.loads(out.stdout)
            time.sleep(1.6)
            return data
        except urllib.error.HTTPError as e:
            wait = 10 * (attempt + 1)
            print(f'  HTTP {e.code}, backing off {wait}s', file=sys.stderr)
            time.sleep(wait)
        except Exception as e:
            print(f'  err {e}, retry', file=sys.stderr)
            time.sleep(6)
    return None

def strip_html(s):
    if not s: return ''
    s = re.sub(r'<[^>]+>', ' ', s)
    for a, b in [('&nbsp;',' '), ('&amp;','&'), ('&quot;','"'), ('&#039;',"'"),
                 ('&lt;','<'), ('&gt;','>'), ('&#\d+;', "'")]:
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()

def clean(s, maxlen=700):
    return strip_html(s)[:maxlen]

# --- Step 1: subject subcategories ---
print('Getting FP subject subcategories...')
r = api({'action': 'query', 'list': 'categorymembers',
         'cmtitle': 'Category:Featured pictures by subject',
         'cmtype': 'subcat', 'cmlimit': 500})
subcats = [c['title'] for c in (r or {}).get('query', {}).get('categorymembers', [])]
print(f'{len(subcats)} subject subcats')

WANT = ['Animal', 'Plant', 'Fungus', 'Landscape', 'Nature', 'Space', 'Astronomy',
        'Weather', 'Bird', 'Insect', 'Mammal', 'Flower', 'Underwater', 'Architecture',
        'Place', 'Geology', 'Sky', 'Tree', 'Ocean', 'Mountain']
chosen = [s for s in subcats if any(w.lower() in s.lower() for w in WANT)]
print(f'Chosen {len(chosen)}:')
for s in chosen: print('  *', s)

# --- Step 2: file members ---
all_files = {}
for cat in chosen:
    cont = None
    fetched = 0
    while fetched < 250:
        p = {'action': 'query', 'generator': 'categorymembers',
             'gcmtitle': cat, 'gcmtype': 'file', 'gcmlimit': 100}
        if cont: p['gcmcontinue'] = cont
        rr = api(p)
        if not rr: break
        pages = (rr.get('query', {}) or {}).get('pages', [])
        for pg in pages:
            t = pg.get('title', '')
            if t not in all_files:  # keep first (most specific) category
                all_files[t] = cat
        fetched += len(pages)
        cont = (rr.get('continue') or {}).get('gcmcontinue')
        if not cont: break
    print(f'{cat}: total {len(all_files)}', flush=True)

print(f'\nTotal candidate files: {len(all_files)}')

# --- Step 3: batched imageinfo ---
titles = sorted(all_files.keys())
candidates = []
BATCH = 50
for i in range(0, len(titles), BATCH):
    batch = titles[i:i+BATCH]
    rr = api({'action': 'query', 'titles': '|'.join(batch),
              'prop': 'imageinfo',
              'iiprop': 'url|size|mime|mediatype|extmetadata',
              'iiurlwidth': 1024})
    if not rr: continue
    for pg in (rr.get('query', {}) or {}).get('pages', []):
        title = pg.get('title', '')
        iis = pg.get('imageinfo') or []
        if not iis: continue
        ii = iis[0]
        em = ii.get('extmetadata', {}) or {}
        def emv(k): return clean(em.get(k, {}).get('value', ''))
        candidates.append({
            'title': title,
            'category': all_files.get(title, ''),
            'mime': ii.get('mime', ''),
            'mediatype': ii.get('mediatype', ''),
            'w': ii.get('width', 0), 'h': ii.get('height', 0),
            'thumburl': ii.get('thumburl', ''),
            'url': ii.get('url', ''),
            'descurl': ii.get('descriptionurl', ''),
            'description': emv('ImageDescription'),
            'objectName': emv('ObjectName'),
            'artist': emv('Artist'),
            'credit': emv('Credit'),
            'license': emv('LicenseShortName'),
            'licenseUrl': emv('LicenseUrl'),
        })
    print(f'  metadata {i+len(batch)}/{len(titles)}', flush=True)

print(f'\nGot metadata for {len(candidates)} files')

# --- Step 4: filter to clean photographs ---
def ok(rec):
    if rec['mime'] != 'image/jpeg': return False
    mt = rec['mediatype'].upper()
    if mt not in ('BITMAP', 'PHOTOGRAPH'): return False
    if rec['w'] < 900 or rec['h'] < 600: return False
    if not rec['license'] or not rec['artist']: return False
    if len(rec['description']) < 25: return False
    ar = rec['w'] / max(rec['h'], 1)
    if ar > 2.6 or ar < 0.75: return False
    # avoid text-heavy / scan-like content heuristics
    bad_words = ['map', 'diagram', 'chart', 'scan', 'drawing', 'illustration',
                 'painting', 'manuscript', 'logo', 'svg', 'poster', 'engraving']
    blob = (rec['title'] + ' ' + rec['description']).lower()
    if sum(1 for w in bad_words if w in blob) >= 2: return False
    return True

filtered = [r for r in candidates if ok(r)]
print(f'After filter: {len(filtered)} photo candidates')

with open(OUT, 'w') as f:
    json.dump(filtered, f, indent=1, ensure_ascii=False)
print(f'Saved -> {OUT}')

from collections import Counter
print('\nBy category:')
for c, n in Counter(r['category'] for r in filtered).most_common(25):
    print(f'  {n:4} {c}')
