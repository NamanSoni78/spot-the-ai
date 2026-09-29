#!/usr/bin/env python3
"""Fix-ups: 3 novel excerpts + poems via Wikisource API."""
import json, re, time, subprocess

UA = 'RealOrAI-Quest-Game/1.0 (educational game; one-time text curation)'
OUT = '/home/z/my-project/data/real_texts.json'

def fetch(url, tries=3, accept=None):
    for t in range(tries):
        out = subprocess.run(['curl', '-s', '-L', '--max-time', '90', '--compressed',
                              '-H', 'User-Agent: ' + UA] +
                             (['-H', 'Accept: ' + accept] if accept else []) +
                             [url], capture_output=True, text=True, timeout=120)
        if out.returncode == 0 and len(out.stdout) > 200:
            time.sleep(1.2)
            return out.stdout
        time.sleep(5)
    return None

def normalize(s):
    return re.sub(r'\s+', ' ', s).strip()

def take_sentences(body, start, max_chars=520, max_sent=3):
    rest = body[start:start + 900]
    sentences = re.split(r'(?<=[.!?…”"]) +', rest)
    excerpt, ln = '', 0
    for s in sentences[:max_sent]:
        if excerpt and ln + len(s) > max_chars:
            break
        excerpt += (' ' if excerpt else '') + s
        ln += len(s)
    if len(excerpt) > max_chars + 120:  # single huge sentence — cut at word boundary
        excerpt = excerpt[:max_chars]
        excerpt = excerpt[:excerpt.rfind(' ')] + '…'
    return excerpt.strip()

texts = json.load(open(OUT))
texts = [t for t in texts if t['text']]  # drop the empty Tale of Two Cities stub

def strip_headers(txt):
    m = re.search(r'\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK [^\*]*\*\*\*', txt)
    if m: txt = txt[m.end():]
    m = re.search(r'\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK', txt)
    if m: txt = txt[:m.start()]
    return txt

FIX_NOVELS = [
    (98, 'A Tale of Two Cities', 'Charles Dickens', 1859, r'It was the best of times, it was the worst of times'),
    (84, 'Frankenstein', 'Mary Shelley', 1818, r'I am by birth a Genevese,'),
    (345, 'Dracula', 'Bram Stoker', 1897, r'Left Munich at 8:35'),
]
for gid, title, author, year, matcher in FIX_NOVELS:
    txt = fetch(f'https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt')
    if not txt:
        print('!! fetch failed', title); continue
    body = normalize(strip_headers(txt))
    m = re.search(matcher, body)
    if not m:
        print('!! matcher failed', title); continue
    texts.append({'kind': 'novel', 'title': title, 'author': author, 'year': year,
                  'sourceUrl': f'https://www.gutenberg.org/ebooks/{gid}',
                  'text': take_sentences(body, m.start())})
    print('OK novel:', title)

# ---- poems via Wikisource wikitext API ----
POEMS = [
    ("I'm Nobody! Who are you?", 'Emily Dickinson', 1891, "I'm Nobody! Who are you?"),
    ('Nothing Gold Can Stay', 'Robert Frost', 1923, "Nature's first green is gold,"),
    ('The Sick Rose', 'William Blake', 1794, 'O Rose thou art sick.'),
    ('Who has seen the wind?', 'Christina Rossetti', 1872, 'Who has seen the wind?'),
    ('My heart leaps up', 'William Wordsworth', 1807, 'My heart leaps up when I behold'),
]
WS = 'https://en.wikisource.org/w/api.php'
import urllib.parse
for title, author, year, firstline in POEMS:
    q = urllib.parse.quote(title.replace(' ', '_'))
    js = fetch(f'{WS}?action=parse&page={q}&prop=wikitext&format=json&formatversion=2', accept='application/json')
    if not js:
        print('!! ws fetch failed', title); continue
    try:
        data = json.loads(js)
        wikitext = data['parse']['wikitext']
    except Exception as e:
        print('!! ws parse failed', title, e); continue
    # clean wikitext: strip header/footer templates, italics, small caps, refs
    t = wikitext
    t = re.sub(r'\{\{[^\{\}]*\}\}', '', t)         # innermost templates once
    t = re.sub(r'\{\{[^\{\}]*\}\}', '', t)         # second pass
    t = re.sub(r'<[^>]+>', '', t)
    t = re.sub(r"''+", '', t)
    t = re.sub(r'&nbsp;', ' ', t)
    lines = [l.strip() for l in t.split('\n') if l.strip() and not l.strip().startswith(('=', '{{', '}}', '*', '#', '[['))]
    # find poem body: lines after the one starting with firstline
    body_lines, started = [], False
    fl = firstline.lower()[:20]
    for l in lines:
        if not started and fl in l.lower():
            started = True
        if started:
            body_lines.append(l)
    if not body_lines:
        print('!! firstline not found in ws', title); continue
    poem = '\n'.join(body_lines)
    # stanza count: keep whole stanzas until at least ~6 lines and end on stanza break
    # simple: keep all (these poems are short)
    texts.append({'kind': 'poem', 'title': title, 'author': author, 'year': year,
                  'sourceUrl': f'https://en.wikisource.org/wiki/{title.replace(" ", "_")}',
                  'text': poem[:700]})
    print('OK poem:', title, f'({len(poem)} chars)')

json.dump(texts, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(f'\nTotal real texts: {len(texts)}')
for t in texts:
    print(f"  [{t['kind']}] {t['title']} — {t['author']} ({len(t['text'])} ch)")
