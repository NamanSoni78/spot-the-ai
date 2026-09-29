#!/usr/bin/env python3
"""Test legacy Pollinations image endpoint: rate limits, determinism, params."""
import time, urllib.request, urllib.error, hashlib, os

OUT = '/home/z/my-project/data/ratetest'
os.makedirs(OUT, exist_ok=True)

def gen(name, prompt, **params):
    from urllib.parse import quote
    qs = '&'.join(f'{k}={v}' for k, v in params.items())
    url = f'https://image.pollinations.ai/prompt/{quote(prompt)}?{qs}'
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'RealOrAI/1.0'})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
            dt = time.time() - t0
            h = hashlib.md5(data).hexdigest()[:10]
            path = f'{OUT}/{name}.jpg'
            with open(path, 'wb') as f:
                f.write(data)
            print(f'{name:24} {r.status} {len(data):7d}B {dt:5.1f}s md5={h} ct={r.headers.get("content-type")}')
            return h
    except urllib.error.HTTPError as e:
        print(f'{name:24} HTTP {e.code} after {time.time()-t0:.1f}s body={e.read()[:120]}')
    except Exception as e:
        print(f'{name:24} ERR {type(e).__name__}: {e}')
    return None

# 1) determinism: same seed twice
h1 = gen('det1', 'a green tree frog on a leaf, macro photo', model='sana', seed=123, width=512, height=384)
h2 = gen('det2', 'a green tree frog on a leaf, macro photo', model='sana', seed=123, width=512, height=384)
print('deterministic:', h1 == h2 and h1 is not None)

# 2) rapid-fire: 5 sequential, no delay — detect rate limiting
for i in range(5):
    gen(f'rapid{i}', f'test image number {i} abstract shapes', model='sana', seed=1000+i, width=512, height=384)

# 3) model param that doesn't exist on legacy — does it fall back?
gen('modelflux', 'test with flux model param', model='flux', seed=5, width=512, height=384)

# 4) bigger size + nologo
gen('big', 'golden retriever puppy running through a meadow, photorealistic', model='sana', seed=77, width=896, height=672, nologo='true')
print('done')
