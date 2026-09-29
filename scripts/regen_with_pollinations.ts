/**
 * Optional: regenerate the fake images with the real Pollinations API.
 *
 * The game ships fully playable with pre-baked fakes (no keys needed).
 * If you HAVE a Pollinations API key (get one at https://enter.pollinations.ai/keys),
 * you can regenerate all 60 fakes with live models:
 *
 *   POLLINATIONS_API_KEY=pk_xxx bun run content:regen
 *
 * Notes
 * - Uses the new OpenAI-compatible endpoint: POST https://gen.pollinations.ai/v1/images/generations
 * - Sizes are picked to match each real photo's orientation.
 * - Existing files are skipped unless FORCE=1 is set.
 * - After regenerating you should also refresh the "tells" (see README).
 */
import fs from 'fs';
import path from 'path';

const MANIFEST = '/home/z/my-project/data/fake_manifest.json';
const REALS = '/home/z/my-project/data/real_images.json';
const OUTDIR = '/home/z/my-project/public/content/fake';

const API_URL = 'https://gen.pollinations.ai/v1/images/generations';
const KEY = process.env.POLLINATIONS_API_KEY;

if (!KEY) {
  console.error(
    'Missing POLLINATIONS_API_KEY.\n' +
    'Get a free key at https://enter.pollinations.ai/keys then run:\n' +
    '  POLLINATIONS_API_KEY=pk_xxx bun run content:regen',
  );
  process.exit(1);
}

interface FakeSpec { slug: string; prompt: string; tier: 1 | 2 | 3 }
interface RealEntry { slug: string; width: number; height: number }

const TIER_STYLE: Record<number, string> = {
  1: ', beautiful perfect lighting, vivid saturated colors, dreamy polished aesthetic, flawless composition',
  2: ', photorealistic, natural colors, realistic lighting, fine detail, professional photograph',
  3: ', candid amateur photograph, natural imperfect lighting, realistic muted colors, slight film grain, imperfect framing',
};

function sizeFor(w: number, h: number): '1344x768' | '864x1152' | '1024x1024' {
  const ar = w / h;
  if (ar > 1.2) return '1344x768';
  if (ar < 0.83) return '864x1152';
  return '1024x1024';
}

async function main() {
  const specs: FakeSpec[] = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')).image;
  const reals: RealEntry[] = JSON.parse(fs.readFileSync(REALS, 'utf-8'));
  const bySlug = new Map(reals.map((r) => [r.slug, r]));
  const force = process.env.FORCE === '1';
  fs.mkdirSync(OUTDIR, { recursive: true });

  let done = 0; let skipped = 0; let failed = 0;
  for (const spec of specs) {
    const dest = path.join(OUTDIR, `${spec.slug}.jpg`);
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
      skipped++; continue;
    }
    const real = bySlug.get(spec.slug);
    if (!real) { console.error(`no real match for ${spec.slug}`); failed++; continue; }
    const size = sizeFor(real.width, real.height);
    const prompt = spec.prompt + TIER_STYLE[spec.tier];
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${KEY}`,
          },
          body: JSON.stringify({
            model: 'flux',
            prompt,
            size,
            // seed omitted → provider picks; set a seed for reproducible builds
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 140)}`);
        const json = (await res.json()) as {
          data?: { b64_json?: string; url?: string }[];
        };
        const item = json.data?.[0];
        let buf: Buffer | null = null;
        if (item?.b64_json) buf = Buffer.from(item.b64_json, 'base64');
        else if (item?.url) {
          const imgRes = await fetch(item.url);
          if (!imgRes.ok) throw new Error(`download HTTP ${imgRes.status}`);
          buf = Buffer.from(await imgRes.arrayBuffer());
        }
        if (!buf || buf.length < 5000) throw new Error('empty image');
        fs.writeFileSync(dest, buf);
        ok = true;
        done++;
        console.log(`ok ${spec.slug} (${size}, ${Math.round(buf.length / 1024)}KB)`);
      } catch (e) {
        console.error(`${spec.slug} attempt ${attempt}: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
    if (!ok) failed++;
    await new Promise((r) => setTimeout(r, 1200)); // be polite
  }
  console.log(`\nRegenerated ${done}, skipped ${skipped}, failed ${failed}.`);
  if (done > 0) {
    console.log('TIP: the bundled tells were written for the pre-baked images.');
    console.log('Refresh them with a vision model or edit data/fake_tells.json, then:');
    console.log('  python3 scripts/build_rounds.py');
  }
}

void main();
