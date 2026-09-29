#!/usr/bin/env python3
"""Probe Commons category structure with polite throttling + backoff."""
import json, time, sys, urllib.request, urllib.parse

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'RealOrAI-Quest-Game/1.0 (one-time content curation for an educational guessing game)'

def api(params, retries=5):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                time.sleep(1.5)  # be polite
                return json.load(r)
        except Exception as e:
            wait = 8 * (attempt + 1)
            print(f'  wait {wait}s after error: {e}', file=sys.stderr)
            time.sleep(wait)
    return None

cats = sys.argv[1:] if len(sys.argv) > 1 else [
    'Category:Featured pictures', 'Category:Featured pictures by topic',
    'Category:Quality images', 'Category:Quality images by topic']
for cat in cats:
    r = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat,
             'cmtype': 'subcat', 'cmlimit': 500})
    subs = [c['title'] for c in (r or {}).get('query', {}).get('categorymembers', [])]
    print(f'{cat}: {len(subs)} subcats')
    for s in subs[:60]:
        print('   ', s)
    print()
