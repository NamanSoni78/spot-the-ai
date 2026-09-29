#!/usr/bin/env python3
"""
Fetch canonical public-domain texts from Project Gutenberg and extract
verified excerpts: novel openings and poems.
Saves data/real_texts.json
"""
import json, re, time, subprocess, html

OUT = '/home/z/my-project/data/real_texts.json'
UA = 'RealOrAI-Quest-Game/1.0 (educational game; one-time text curation)'

def fetch(url, tries=3):
    for t in range(tries):
        out = subprocess.run(['curl', '-s', '-L', '--max-time', '90', '--compressed',
                              '-H', 'User-Agent: ' + UA, url],
                             capture_output=True, text=True, timeout=120)
        if out.returncode == 0 and len(out.stdout) > 1000:
            time.sleep(1.5)
            return out.stdout
        time.sleep(5)
    return None

def strip_headers(txt):
    """Remove Gutenberg header/footer."""
    m = re.search(r'\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK [^\*]*\*\*\*', txt)
    if m:
        txt = txt[m.end():]
    m = re.search(r'\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK', txt)
    if m:
        txt = txt[:m.start()]
    return txt

def normalize(s):
    return re.sub(r'\s+', ' ', s).strip()

texts = []

# ---------------- novel openings ----------------
NOVELS = [
    # (gutenberg id, title, author, year, matcher regex applied on normalized text)
    (2701, 'Moby Dick', 'Herman Melville', 1851, r'Call me Ishmael\.'),
    (1342, 'Pride and Prejudice', 'Jane Austen', 1813, r'It is a truth universally acknowledged,'),
    (98, 'A Tale of Two Cities', 'Charles Dickens', 1859, r'It was the best of times, it was the worst of times'),
    (84, 'Frankenstein', 'Mary Shelley', 1818, r'I am by birth a Genevese;'),
    (11, "Alice's Adventures in Wonderland", 'Lewis Carroll', 1865, r'Alice was beginning to get very tired of sitting by her sister'),
    (345, 'Dracula', 'Bram Stoker', 1897, r'Left Munich at 8:35 P\.M\., on 1st May'),
    (1260, 'Jane Eyre', 'Charlotte Brontë', 1847, r'There was no possibility of taking a walk that day\.'),
    (64317, 'The Great Gatsby', 'F. Scott Fitzgerald', 1925, r'In my younger and more vulnerable years'),
    (768, 'Wuthering Heights', 'Emily Brontë', 1847, r'I have just returned from a visit to my landlord'),
    (35, 'The Time Machine', 'H. G. Wells', 1895, r'The Time Traveller \(for so it will be convenient to speak of him\)'),
]

for gid, title, author, year, matcher in NOVELS:
    txt = fetch(f'https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt')
    if not txt:
        print(f'!! fetch failed: {title}')
        continue
    body = normalize(strip_headers(txt))
    m = re.search(matcher, body)
    if not m:
        print(f'!! matcher failed: {title}')
        continue
    # take up to ~2 sentences (max 420 chars) after the match
    rest = body[m.start():m.start() + 600]
    # split on sentence enders followed by space+capital or quote
    sentences = re.split(r'(?<=[.!?…”"]) +', rest)
    excerpt, ln = '', 0
    for s in sentences[:3]:
        if ln + len(s) > 430:
            break
        excerpt += (' ' if excerpt else '') + s
        ln += len(s)
    texts.append({
        'kind': 'novel', 'title': title, 'author': author, 'year': year,
        'sourceUrl': f'https://www.gutenberg.org/ebooks/{gid}',
        'text': excerpt.strip(),
    })
    print(f'OK novel: {title} ({len(excerpt)} chars)')
    print('   ', excerpt[:120], '...')

# ---------------- poems ----------------
POEMS = [
    (12242, "I'm Nobody! Who are you?", 'Emily Dickinson', 1891, r"I'm Nobody! Who are you\?"),
    (2822, 'Nothing Gold Can Stay', 'Robert Frost', 1923, r'Nature\u2019s first green is gold,|Nature\'s first green is gold,'),
    (2822, 'The Sick Rose', 'William Blake', 1794, r'O Rose thou art sick\.'),
    (36, 'Who has seen the wind?', 'Christina Rossetti', 1872, r'Who has seen the wind\?'),
    (265, 'My heart leaps up', 'William Wordsworth', 1807, r'My heart leaps up when I behold'),
    (12242, 'Because I could not stop for Death', 'Emily Dickinson', 1890, r'Because I could not stop for Death,'),
]

for gid, title, author, year, matcher in POEMS:
    txt = fetch(f'https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt')
    if not txt:
        print(f'!! fetch failed: {title}')
        continue
    body = normalize(strip_headers(txt))
    m = re.search(matcher, body)
    if not m:
        print(f'!! matcher failed: {title}')
        continue
    # poems: take a fixed number of words by poem length
    limits = {'Nothing Gold Can Stay': 8 * 8, 'The Sick Rose': 8 * 8,
              'Who has seen the wind?': 8 * 8, 'My heart leaps up': 9 * 7,
              "I'm Nobody! Who are you?": 8 * 8, 'Because I could not stop for Death': 6 * 8}
    nchars = limits.get(title, 64) * 6
    excerpt = body[m.start():m.start() + nchars]
    # cut at a line boundary: stop at a period near the limit
    end = excerpt.rfind('.')
    if end > 60:
        excerpt = excerpt[:end + 1]
    texts.append({
        'kind': 'poem', 'title': title, 'author': author, 'year': year,
        'sourceUrl': f'https://www.gutenberg.org/ebooks/{gid}',
        'text': excerpt.strip(),
    })
    print(f'OK poem: {title} ({len(excerpt)} chars)')
    print('   ', excerpt[:100].replace('\n', ' '), '...')

json.dump(texts, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(f'\nSaved {len(texts)} real texts -> {OUT}')
