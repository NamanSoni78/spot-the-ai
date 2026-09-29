/**
 * VLM tells analysis for AI-generated fake images.
 * For each fake image, ask the VLM to describe it AND identify concrete
 * "tells" (clues that reveal it is AI-generated) for the game's reveal panel.
 * Resume-aware; rate-limit friendly (sequential + backoff).
 * Usage: bun scripts/analyze_fakes.ts
 */
import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const DIR = '/home/z/my-project/public/content/fake';
const MANIFEST = '/home/z/my-project/data/fake_manifest.json';
const OUT = '/home/z/my-project/data/fake_tells.json';

const PROMPT = (prompt: string) => `This image was AI-generated (text-to-image diffusion model) from the prompt: "${prompt}".

Analyze it as an expert in AI-image forensics. Reply with STRICT JSON only:
{"desc": "<what it shows in <=10 words>", "tells": ["<tell 1>", "<tell 2>", "<tell 3>"]}
Rules for tells:
- Each tell is a short concrete phrase naming a SPECIFIC visual artifact in THIS image that hints it is AI-generated.
- Best categories: physically impossible geometry, melted or fused objects, garbled or invented text/signatures, wrong biology (leaves/limbs/patterns), impossible light or shadows, plastic-looking textures, dreamy over-smooth rendering, nonsensical background details.
- tells must be OBSERVABLE by a player comparing with a real photo, not generic ("looks AI"). If the image is very convincing, the third tell can be softer (e.g. "overall too clean/idealized").
- 3 tells.`;

async function main() {
  const zai = await ZAI.create();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')).image as { slug: string; prompt: string; tier: number }[];
  let results: Record<string, { desc: string; tells: string[] }> = {};
  try { results = JSON.parse(fs.readFileSync(OUT, 'utf-8')); } catch { /* fresh */ }
  console.log(`Resuming: ${Object.keys(results).length}/${manifest.length} already analyzed`);

  for (const spec of manifest) {
    if (results[spec.slug]) continue;
    const file = path.join(DIR, `${spec.slug}.jpg`);
    if (!fs.existsSync(file)) { console.error(`missing file ${spec.slug}`); continue; }
    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      try {
        const b64 = fs.readFileSync(file).toString('base64');
        const messages: VisionMessage[] = [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT(spec.prompt) },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        }];
        const res = await zai.chat.completions.createVision({
          model: 'glm-4.6v',
          messages,
          thinking: { type: 'disabled' },
        });
        const reply = res.choices?.[0]?.message?.content ?? '';
        const m = reply.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no JSON: ' + reply.slice(0, 100));
        const parsed = JSON.parse(m[0]);
        if (!parsed.tells || !Array.isArray(parsed.tells) || parsed.tells.length < 2) throw new Error('bad fields');
        results[spec.slug] = { desc: String(parsed.desc || ''), tells: parsed.tells.slice(0, 3).map(String) };
        fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); // persist progress
        ok = true;
        console.log(`ok ${spec.slug}: ${results[spec.slug].tells[0]?.slice(0, 60)}`);
      } catch (e) {
        console.error(`${spec.slug} attempt ${attempt}: ${(e as Error).message.slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, 8000 * attempt));
      }
    }
    // gentle pacing to avoid 429
    await new Promise((r) => setTimeout(r, 1500));
  }
  const missing = manifest.filter((s) => !results[s.slug]).map((s) => s.slug);
  console.log(`\nDone. ${manifest.length - missing.length}/${manifest.length} analyzed. Missing: ${missing.join(', ') || 'none'}`);
}

void main();
