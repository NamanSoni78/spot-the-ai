/**
 * Text rounds pipeline for Real or AI?
 * 1. Combines existing real_texts.json (novels + 1 poem) with hardcoded
 *    public-domain poems, traditional proverbs, and Commons captions.
 * 2. Generates one AI fake per real text via z-ai LLM (tiered difficulty),
 *    asking for the fake + self-described "tells" in JSON.
 * 3. Saves data/text_rounds_raw.json
 * Usage: bun scripts/build_text_rounds.ts
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const OUT = '/home/z/my-project/data/text_rounds_raw.json';

interface Entry {
  slug: string;
  kind: 'novel' | 'poem' | 'proverb' | 'caption';
  title: string;
  author: string;
  year: number;
  sourceUrl: string;
  text: string;
  tier: 1 | 2 | 3;
  /** for captions: subject hint */
  subject?: string;
}

const POEMS: Omit<Entry, 'kind'>[] = [
  {
    slug: 'poem-tyger', title: 'The Tyger', author: 'William Blake', year: 1794,
    sourceUrl: 'https://en.wikipedia.org/wiki/The_Tyger', tier: 1,
    text: 'Tyger Tyger, burning bright,\nIn the forests of the night;\nWhat immortal hand or eye,\nCould frame thy fearful symmetry?\nIn what distant deeps or skies,\nBurnt the fire of thine eyes?\nOn what wings dare he aspire?\nWhat the hand, dare seize the fire?',
  },
  {
    slug: 'poem-daffodils', title: 'I Wandered Lonely as a Cloud', author: 'William Wordsworth', year: 1807,
    sourceUrl: 'https://en.wikipedia.org/wiki/I_Wandered_Lonely_as_a_Cloud', tier: 1,
    text: 'I wandered lonely as a cloud\nThat floats on high o\u2019er vales and hills,\nWhen all at once I saw a crowd,\nA host, of golden daffodils;\nBeside the lake, beneath the trees,\nFluttering and dancing in the breeze.',
  },
  {
    slug: 'poem-fog', title: 'Fog', author: 'Carl Sandburg', year: 1916,
    sourceUrl: 'https://en.wikipedia.org/wiki/Fog_(poem)', tier: 1,
    text: 'The fog comes\non little cat feet.\n\nIt sits looking\nover harbor and city\non silent haunches\nand then moves on.',
  },
  {
    slug: 'poem-to-autumn', title: 'To Autumn (stanza I)', author: 'John Keats', year: 1820,
    sourceUrl: 'https://en.wikipedia.org/wiki/To_Autumn', tier: 2,
    text: 'Season of mists and mellow fruitfulness,\nClose bosom-friend of the maturing sun;\nConspiring with him how to load and bless\nWith fruit the vines that round the thatch-eves run;\nTo bend with apples the moss\u2019d cottage-trees,\nAnd fill all fruit with ripeness to the core;\nTo swell the gourd, and plump the hazel shells\nWith a sweet kernel; to set budding more,\nAnd still more, later flowers for the bees,\nUntil they think warm days will never cease,\nFor Summer has o\u2019er-brimm\u2019d their clammy cells.',
  },
  {
    slug: 'poem-ozymandias', title: 'Ozymandias', author: 'Percy Bysshe Shelley', year: 1818,
    sourceUrl: 'https://en.wikipedia.org/wiki/Ozymandias', tier: 2,
    text: 'I met a traveller from an antique land,\nWho said\u2014\u201cTwo vast and trunkless legs of stone\nStand in the desert. . . . Near them, on the sand,\nHalf sunk a shattered visage lies, whose frown,\nAnd wrinkled lip, and sneer of cold command,\nTell that its sculptor well those passions read\nWhich yet survive, stamped on these lifeless things,\nThe hand that mocked them, and the heart that fed;',
  },
  {
    slug: 'poem-hope', title: '\u201cHope\u201d is the thing with feathers', author: 'Emily Dickinson', year: 1861,
    sourceUrl: 'https://en.wikipedia.org/wiki/%22Hope%22_is_the_thing_with_feathers', tier: 2,
    text: 'Hope is the thing with feathers \u2014\nThat perches in the soul \u2014\nAnd sings the tune without the words \u2014\nAnd never stops \u2014 at all \u2014\n\nAnd sweetest \u2014 in the Gale \u2014 is heard \u2014\nAnd sore must be the storm \u2014\nThat could abash the little Bird\nThat kept so many warm \u2014',
  },
  {
    slug: 'poem-annabel-lee', title: 'Annabel Lee (stanzas I\u2013II)', author: 'Edgar Allan Poe', year: 1849,
    sourceUrl: 'https://en.wikipedia.org/wiki/Annabel_Lee', tier: 3,
    text: 'It was many and many a year ago,\n   In a kingdom by the sea,\nThat a maiden there lived whom you may know\n   By the name of Annabel Lee;\nAnd this maiden she lived with no other thought\n   Than to love and be loved by me.\n\nI was a child and she was a child,\n   In this kingdom by the sea,\nBut we loved with a love that was more than love \u2014\n   I and my Annabel Lee \u2014',
  },
  {
    slug: 'poem-stopping-by-woods', title: 'Stopping by Woods on a Snowy Evening (stanzas I\u2013II)', author: 'Robert Frost', year: 1923,
    sourceUrl: 'https://en.wikipedia.org/wiki/Stopping_by_Woods_on_a_Snowy_Evening', tier: 3,
    text: 'Whose woods these are I think I know.\nHis house is in the village though;\nHe will not see me stopping here\nTo watch his woods fill up with snow.\n\nMy little horse must think it queer\nTo stop without a farmhouse near\nBetween the woods and frozen lake\nThe darkest evening of the year.',
  },
];

const PROVERBS: Omit<Entry, 'kind'>[] = [
  { slug: 'prov-stitch', title: 'A stitch in time saves nine', author: 'Traditional English proverb', year: 1732,
    sourceUrl: 'https://en.wiktionary.org/wiki/a_stitch_in_time_saves_nine', tier: 1,
    text: 'A stitch in time saves nine.' },
  { slug: 'prov-early-bird', title: 'The early bird catches the worm', author: 'Traditional English proverb', year: 1636,
    sourceUrl: 'https://en.wiktionary.org/wiki/the_early_bird_gets_the_worm', tier: 1,
    text: 'The early bird catches the worm.' },
  { slug: 'prov-rolling-stone', title: 'A rolling stone gathers no moss', author: 'Traditional English proverb', year: 1546,
    sourceUrl: 'https://en.wiktionary.org/wiki/a_rolling_stone_gathers_no_moss', tier: 2,
    text: 'A rolling stone gathers no moss.' },
  { slug: 'prov-cooks', title: 'Too many cooks spoil the broth', author: 'Traditional English proverb', year: 1575,
    sourceUrl: 'https://en.wiktionary.org/wiki/too_many_cooks_spoil_the_broth', tier: 2,
    text: 'Too many cooks spoil the broth.' },
  { slug: 'prov-rome', title: 'When in Rome, do as the Romans do', author: 'Traditional English proverb', year: 1770,
    sourceUrl: 'https://en.wiktionary.org/wiki/when_in_Rome,_do_as_the_Romans_do', tier: 2,
    text: 'When in Rome, do as the Romans do.' },
  { slug: 'prov-moss-oak', title: 'Mighty oaks from little acorns grow', author: 'Traditional English proverb', year: 1382,
    sourceUrl: 'https://en.wiktionary.org/wiki/great_oaks_from_little_acorns_grow', tier: 3,
    text: 'Mighty oaks from little acorns grow.' },
  { slug: 'prov-spade', title: 'Call a spade a spade', author: 'Traditional English proverb', year: 1542,
    sourceUrl: 'https://en.wiktionary.org/wiki/call_a_spade_a_spade', tier: 3,
    text: 'Call a spade a spade.' },
  { slug: 'prov-horn-plenty', title: 'Empty sacks will never stand upright', author: 'Traditional English proverb', year: 1721,
    sourceUrl: 'https://en.wiktionary.org/wiki/an_empty_sack_cannot_stand_upright', tier: 3,
    text: 'Empty sacks will never stand upright.' },
];

const CAPTION_TIER: Record<string, 1 | 2 | 3> = {
  'ribblehead-viaduct': 2,
  'horses-on-beach': 2,
  'snow-ruins-stars': 3,
  'street-snack-seller': 1,
  'rufous-hornero-nest': 2,
  'sperm-whale-mother-calf': 3,
};

const TIER_FAKE_INSTRUCTION: Record<number, string> = {
  1: 'Make the fake noticeably AI-flavored on close reading: slightly too polished, imagery a bit generic, rhythm a bit too tidy or over-eloquent. A careful reader should spot it.',
  2: 'Make the fake a close imitation with only small giveaways: an occasional anachronistic word, over-balanced phrasing, or a slightly too-perfect structure.',
  3: 'Make the fake as convincing as possible: period-appropriate vocabulary, natural human irregularities, imperfect rhythm. Only an expert should catch it.',
};

const KIND_TASK: Record<string, (e: Entry) => string> = {
  novel: (e) => `Write ONE opening paragraph of a nonexistent 19th/early-20th-century novel in a similar register to a real classic opening. Do NOT copy or parody any real novel. Match this approximate length (${Math.round(e.text.length * 0.9)}-${Math.round(e.text.length * 1.1)} characters).`,
  poem: (e) => `Write ONE original poem in the general style of ${e.author} (${e.year}s). Similar length (${e.text.split('\n').length} lines). Do NOT copy any real poem.`,
  proverb: (e) => `Invent ONE proverb that sounds like a genuine old English proverb. Keep it to one short sentence with similar brevity (${e.text.length} characters). Do NOT use any real proverb.`,
  caption: (e) => `Write ONE factual-sounding photo caption in the dry descriptive style of Wikimedia Commons captions, for a photo of: ${e.subject}. One or two sentences, similar length to ${Math.round(e.text.length * 0.9)} characters.`,
};

const KIND_TELL_HINT: Record<string, string> = {
  novel: 'e.g. rhythm too even, imagery too generic, a word too modern for the era',
  poem: 'e.g. rhyme scheme too regular, imagery too collected, phrasing too smooth',
  proverb: 'e.g. structure too parallel, metaphor too on-the-nose, not attested in tradition',
  caption: 'e.g. too descriptive/tidy, lacks the awkward specificity of a real caption, reads like a caption generator',
};

async function main() {
  const existing = JSON.parse(fs.readFileSync('/home/z/my-project/data/real_texts.json', 'utf-8'));
  const realImages = JSON.parse(fs.readFileSync('/home/z/my-project/data/real_images.json', 'utf-8'));

  // novel tier plan: famous openers easier
  const NOVEL_TIER: Record<string, 1 | 2 | 3> = {
    'Moby Dick': 1, "Pride and Prejudice": 1, "Alice's Adventures in Wonderland": 1,
    'A Tale of Two Cities': 1, 'The Great Gatsby': 2, 'Jane Eyre': 2,
    'Wuthering Heights': 2, 'The Time Machine': 2, 'Frankenstein': 3, 'Dracula': 3,
  };

  const entries: Entry[] = [];
  for (const t of existing) {
    if (t.kind === 'novel') {
      entries.push({
        slug: 'novel-' + t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        kind: 'novel', title: t.title, author: t.author, year: t.year,
        sourceUrl: t.sourceUrl, text: t.text, tier: NOVEL_TIER[t.title] ?? 2,
      });
    } else if (t.kind === 'poem') {
      entries.push({
        slug: 'poem-because-i-could-not-stop', kind: 'poem', title: t.title, author: t.author,
        year: t.year, sourceUrl: t.sourceUrl, text: t.text, tier: 3,
      });
    }
  }
  for (const p of POEMS) entries.push({ ...p, kind: 'poem' });
  for (const p of PROVERBS) entries.push({ ...p, kind: 'proverb' });
  for (const c of realImages) {
    if (c.use === 'caption' && CAPTION_TIER[c.slug]) {
      entries.push({
        slug: 'caption-' + c.slug, kind: 'caption',
        title: c.title, author: c.author, year: c.year ?? 2015,
        sourceUrl: c.sourceUrl, text: (c.description || '').trim(),
        tier: CAPTION_TIER[c.slug], subject: c.title,
      });
    }
  }

  console.log(`Total text entries: ${entries.length} (${entries.filter(e => e.kind === 'novel').length} novels, ${entries.filter(e => e.kind === 'poem').length} poems, ${entries.filter(e => e.kind === 'proverb').length} proverbs, ${entries.filter(e => e.kind === 'caption').length} captions)`);

  const zai = await ZAI.create();
  const results: Record<string, { fake: string; tells: string[] }> = {};
  // resume support: keep previously generated fakes
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf-8'));
    for (const p of prev) {
      if (p.fake) results[p.slug] = { fake: p.fake, tells: p.tells };
    }
    console.log(`Resuming: ${Object.keys(results).length} fakes already generated`);
  } catch { /* no previous file */ }

  for (const e of entries) {
    if (results[e.slug]) continue;
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const sys = `You are building a "real or AI?" guessing game where players see two texts side by side (one genuine, one AI) and must spot the AI one. You produce the AI text plus self-analysis.`;
        const user = `REAL TEXT (for reference only — never copy it):
"""
${e.text}
"""

TASK: ${KIND_TASK[e.kind](e)}
${TIER_FAKE_INSTRUCTION[e.tier]}

Return STRICT JSON only: {"fake": "<your fake text>", "tells": ["<tell 1>", "<tell 2>", "<tell 3>"]}
Each tell must be a short phrase naming a specific concrete giveaway in YOUR fake text (${KIND_TELL_HINT[e.kind]}).`;
        const res = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ],
          temperature: 0.9,
        });
        const raw = (res.choices?.[0]?.message?.content || '').trim();
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no JSON in response: ' + raw.slice(0, 120));
        const parsed = JSON.parse(m[0]);
        if (!parsed.fake || !Array.isArray(parsed.tells) || parsed.tells.length < 2) {
          throw new Error('missing fields');
        }
        // sanity: fake must not be near-identical to real
        if (parsed.fake.trim() === e.text.trim()) throw new Error('fake identical to real');
        results[e.slug] = { fake: parsed.fake.trim(), tells: parsed.tells.slice(0, 3).map(String) };
        ok = true;
        fs.writeFileSync(OUT, JSON.stringify(entries.map((x) => ({
          ...x,
          fake: results[x.slug]?.fake ?? null,
          tells: results[x.slug]?.tells ?? null,
        })), null, 1)); // persist progress after each success
        console.log(`ok ${e.slug} (t${e.tier}) fake ${parsed.fake.length} chars`);
      } catch (err) {
        console.error(`${e.slug} attempt ${attempt} failed: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 2500 * attempt));
      }
    }
    if (!ok) console.error(`!! GIVING UP on ${e.slug}`);
  }

  const out = entries.map((e) => ({
    ...e,
    fake: results[e.slug]?.fake ?? null,
    tells: results[e.slug]?.tells ?? null,
  }));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const failed = out.filter((o) => !o.fake);
  console.log(`\nDone. ${out.length - failed.length}/${out.length} fakes generated. Failed: ${failed.map((f) => f.slug).join(', ') || 'none'}`);
}

void main();
