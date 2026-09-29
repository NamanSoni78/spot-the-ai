#!/usr/bin/env python3
"""
Fetch Commons Featured Pictures with ONE combined request per category
(generator=categorymembers + prop=imageinfo in the same call).
Polite: 5s spacing, honors 429 with 60s+ backoff. Uses curl (urllib TLS is blocked).
Saves to /home/z/my-project/data/commons_candidates.json (merges with existing).
"""
import json, time, re, sys, subprocess, urllib.parse

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'RealOrAI-Quest-Game/1.0 (educational spot-the-AI game; one-time curation)'
OUT = '/home/z/my-project/data/commons_candidates.json'

def curl_api(params, retries=5):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            out = subprocess.run(
                ['curl', '-s', '--max-time', '120', '--compressed',
                 '-H', 'User-Agent: ' + UA, '-H', 'Accept: application/json',
                 '-w', '\n%{http_code}', url],
                capture_output=True, text=True, timeout=150)
            body, _, code = out.stdout.rpartition('\n')
            if code == '429':
                wait = 70 + attempt * 30
                print(f'  429 -> sleep {wait}s', file=sys.stderr, flush=True)
                time.sleep(wait)
                continue
            if code != '200':
                raise RuntimeError(f'HTTP {code}')
            time.sleep(5)
            return json.loads(body)
        except Exception as e:
            print(f'  err {e}', file=sys.stderr, flush=True)
            time.sleep(12)
    return None

def strip_html(s):
    if not s: return ''
    s = re.sub(r'<[^>]+>', ' ', s)
    for a, b in [('&nbsp;',' '), ('&amp;','&'), ('&quot;','"'), ('&#039;',"'"),
                 ('&lt;','<'), ('&gt;','>')]:
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()

def clean(s, maxlen=700):
    return strip_html(s)[:maxlen]

def fetch_category(cat, want_extra=None):
    """Combined query: members + imageinfo in one call. Returns list of records."""
    recs, cont = [], None
    pages_seen = 0
    while pages_seen < 320:
        p = {'action': 'query', 'generator': 'categorymembers',
             'gcmtitle': cat, 'gcmtype': 'file', 'gcmlimit': 200,
             'prop': 'imageinfo',
             'iiprop': 'url|size|mime|mediatype|extmetadata',
             'iiurlwidth': 1024}
        if cont: p['gcmcontinue'] = cont
        r = curl_api(p)
        if not r: break
        pages = (r.get('query', {}) or {}).get('pages', [])
        for pg in pages:
            iis = pg.get('imageinfo') or []
            if not iis: continue
            ii = iis[0]
            em = ii.get('extmetadata', {}) or {}
            def emv(k): return clean(em.get(k, {}).get('value', ''))
            recs.append({
                'title': pg.get('title', ''),
                'category': cat.replace('Category:Featured pictures of ', '').replace('Category:Featured pictures ', ''),
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
        pages_seen += len(pages)
        cont = (r.get('continue') or {}).get('gcmcontinue')
        if not cont: break
    print(f'{cat}: {len(recs)} files', flush=True)
    return recs

# --- discover subject categories ---
print('Discovering subject subcats...', flush=True)
r = curl_api({'action': 'query', 'list': 'categorymembers',
              'cmtitle': 'Category:Featured pictures by subject',
              'cmtype': 'subcat', 'cmlimit': 500})
subcats = [c['title'] for c in (r or {}).get('query', {}).get('categorymembers', [])]
print('\n'.join(subcats), flush=True)

chosen = ['Category:Featured pictures of Passeriformes',
          'Category:Featured pictures of Carnivora',
          'Category:Featured pictures of Artiodactyla',
          'Category:Featured pictures of Insecta',
          'Category:Featured pictures of Cetacea',
          'Category:Featured pictures of Primates']
print(f'\nFetching {len(chosen)} categories...', flush=True)

all_recs = []
for cat in chosen:
    all_recs.extend(fetch_category(cat))

# --- merge with previous run if present ---
try:
    prev = json.load(open(OUT))
    have = {p['title'] for p in prev}
    all_recs = prev + [r for r in all_recs if r['title'] not in have]
    print(f'merged with previous: {len(all_recs)} total')
except Exception:
    pass

# --- filter to clean photographs ---
def ok(rec):
    if rec['mime'] != 'image/jpeg': return False
    mt = rec['mediatype'].upper()
    if mt not in ('BITMAP', 'PHOTOGRAPH'): return False
    if rec['w'] < 900 or rec['h'] < 600: return False
    if not rec['license'] or not rec['artist']: return False
    if len(rec['description']) < 25: return False
    ar = rec['w'] / max(rec['h'], 1)
    if ar > 2.6 or ar < 0.75: return False
    bad_words = ['map', 'diagram', 'chart', 'scan', 'drawing', 'illustration',
                 'painting', 'manuscript', 'logo', 'poster', 'engraving', 'animation']
    blob = (rec['title'] + ' ' + rec['description']).lower()
    if sum(1 for w in bad_words if w in blob) >= 2: return False
    return True

filtered = [r for r in all_recs if ok(r)]
print(f'\nAfter filter: {len(filtered)} candidates from {len(all_recs)} files')

with open(OUT, 'w') as f:
    json.dump(filtered, f, indent=1, ensure_ascii=False)
print(f'Saved -> {OUT}')

from collections import Counter
print('\nBy category:')
for c, n in Counter(r['category'] for r in filtered).most_common(30):
    print(f'  {n:4} {c}')
