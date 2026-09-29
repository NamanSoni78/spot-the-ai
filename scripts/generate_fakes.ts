/**
 * Fake image generation for Real or AI?
 * - Reads data/fake_manifest.json (slug, prompt, tier) + data/real_images.json (orientation)
 * - Generates each fake with z-ai image gen, sized to match the real's orientation
 * - Skips existing outputs (idempotent), retries failures
 * Usage: bun scripts/generate_fakes.ts
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const MANIFEST = '/home/z/my-project/data/fake_manifest.json';
const REALS = '/home/z/my-project/data/real_images.json';
const OUTDIR = '/home/z/my-project/public/content/fake';

interface FakeSpec {
  slug: string;
  prompt: string;
  tier: 1 | 2 | 3;
}

interface RealEntry {
  slug: string;
  width: number;
  height: number;
  use: string;
}

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

async function genOne(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  spec: FakeSpec,
  size: string,
  attempt: number,
): Promise<Buffer> {
  // vary prompt slightly on retries so we don't get the same failure
  const prompt = spec.prompt + TIER_STYLE[spec.tier] + (attempt > 1 ? ` (variation ${attempt})` : '');
  const res = await zai.images.generations.create({ prompt, size: size as '1024x1024' });
  const b64 = res.data?.[0]?.base64;
  if (!b64) throw new Error('no image in response');
  return Buffer.from(b64, 'base64');
}

async function main() {
  const manifestAll = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  const specs: FakeSpec[] = manifestAll.image;
  const reals: RealEntry[] = JSON.parse(fs.readFileSync(REALS, 'utf-8'));
  const bySlug = new Map(reals.map((r) => [r.slug, r]));
  fs.mkdirSync(OUTDIR, { recursive: true });

  const zai = await ZAI.create();
  const CONCURRENCY = Number(process.env.GEN_CONC ?? '3');
  const INTER_DELAY = Number(process.env.GEN_DELAY_MS ?? '0');
  const queue = [...specs];
  const results: Record<string, string> = {};
  let done = 0;

  async function worker(id: number) {
    while (queue.length > 0) {
      const spec = queue.shift();
      if (!spec) break;
      const dest = path.join(OUTDIR, `${spec.slug}.jpg`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
        results[spec.slug] = 'cached';
        done++;
        continue;
      }
      const real = bySlug.get(spec.slug);
      if (!real) {
        results[spec.slug] = 'NO REAL MATCH';
        continue;
      }
      const size = sizeFor(real.width, real.height);
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          const buf = await genOne(zai, spec, size, attempt);
          fs.writeFileSync(dest, buf);
          results[spec.slug] = `ok ${Math.round(buf.length / 1024)}KB ${size} t${spec.tier}`;
          ok = true;
        } catch (e) {
          console.error(`[w${id}] ${spec.slug} attempt ${attempt} failed: ${(e as Error).message}`);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
      if (!ok) results[spec.slug] = 'FAILED';
      if (INTER_DELAY > 0) await new Promise((r) => setTimeout(r, INTER_DELAY));
      done++;
      console.log(`[w${id}] ${done}/${specs.length} ${spec.slug}: ${results[spec.slug]}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  fs.writeFileSync('/home/z/my-project/data/fake_gen_results.json', JSON.stringify(results, null, 1));
  const failed = Object.entries(results).filter(([, v]) => v === 'FAILED');
  console.log(`\nDone. ${specs.length - failed.length}/${specs.length} generated. Failed: ${failed.map(([k]) => k).join(', ') || 'none'}`);
}

void main();
