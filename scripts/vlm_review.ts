/**
 * VLM review of Commons shortlist contact sheets.
 * For each numbered cell: is it a photo, subject description, game-suitability.
 * Usage: bun scripts/vlm_review.ts
 */
import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const SHEETS_DIR = '/home/z/my-project/data/sheets';
const OUT = '/home/z/my-project/data/vlm_review.json';

const PROMPT = `This contact sheet shows numbered photographs (#N in yellow, top-left of each cell) from Wikimedia Commons featured pictures. For EVERY numbered cell, output one JSON object in a JSON array. Each object:
{"id": <number>, "photo": true|false, "subject": "<what it shows in <=12 words, be specific about species/scene>", "style": "<e.g. wildlife macro photo, landscape wide shot, b&w portrait, telescope image, night long-exposure>", "concern": "<short issue if any: watermark/text overlay, collage/composite of multiple photos, diagram, painting, low contrast, too wide pano; else empty>"}
Rules: "photo" false if it's a diagram, painting, drawing, scan, screenshot or montage of several separate photos. Be precise and terse. Output ONLY the JSON array, nothing else.`;

async function main() {
  const zai = await ZAI.create();
  const files = fs.readdirSync(SHEETS_DIR).filter((f) => f.endsWith('.jpg')).sort();
  const all: unknown[] = [];
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(SHEETS_DIR, f)).toString('base64');
    const messages: VisionMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      },
    ];
    try {
      const res = await zai.chat.completions.createVision({
        model: 'glm-4.6v',
        messages,
        thinking: { type: 'disabled' },
      });
      const reply = res.choices?.[0]?.message?.content ?? '';
      // extract JSON array from reply
      const m = reply.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        all.push(...arr);
        console.log(`${f}: ${arr.length} entries`);
      } else {
        console.log(`${f}: NO JSON FOUND -> ${reply.slice(0, 200)}`);
      }
    } catch (e) {
      console.error(`${f} failed:`, (e as Error).message);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
  console.log(`saved ${all.length} entries -> ${OUT}`);
}

void main();
