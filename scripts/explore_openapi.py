#!/usr/bin/env python3
"""Explore the Pollinations OpenAPI spec: paths, auth schemes, free tier hints."""
import json, re, sys

with open('/tmp/oapi.json') as f:
    spec = json.load(f)

print("== INFO ==")
info = spec.get('info', {})
print("title:", info.get('title'))
print("version:", info.get('version'))
desc = info.get('description', '')
# Print first 2500 chars of description
print(desc[:2500])

print("\n== SECURITY SCHEMES ==")
print(json.dumps(spec.get('components', {}).get('securitySchemes', {}), indent=2)[:2000])

print("\n== SERVERS ==")
print(json.dumps(spec.get('servers', []), indent=2))

print("\n== PATHS ==")
for path, item in spec.get('paths', {}).items():
    for method, op in item.items():
        if method in ('get', 'post', 'put', 'delete'):
            sec = op.get('security', spec.get('security', 'INHERIT'))
            print(f"{method.upper():6} {path}  security={sec}")

# Search whole spec for 'anonymous', 'free', 'tier', 'referrer'
print("\n== KEYWORD SEARCH (anonymous/free/tier/referrer) ==")
raw = json.dumps(spec)
for kw in ['anonymous', 'free tier', 'referrer', 'pollen', 'no-auth', 'without auth']:
    idxs = [m.start() for m in re.finditer(kw, raw, re.IGNORECASE)][:3]
    print(f"\n-- '{kw}' x{len([m for m in re.finditer(kw, raw, re.IGNORECASE)])}")
    for i in idxs:
        print("   ...", raw[max(0,i-150):i+250].replace('\\n',' '))
