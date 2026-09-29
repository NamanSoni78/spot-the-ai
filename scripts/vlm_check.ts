import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  const file = process.argv[2];
  const question = process.argv[3] || 'Describe this screenshot of a game UI. Note any visual/layout problems: overlapping text, cut-off elements, broken images, contrast issues. Be terse.';
  const b64 = fs.readFileSync(file).toString('base64');
  const messages: VisionMessage[] = [{
    role: 'user',
    content: [
      { type: 'text', text: question },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    ],
  }];
  const res = await zai.chat.completions.createVision({ model: 'glm-4.6v', messages, thinking: { type: 'disabled' } });
  console.log(res.choices?.[0]?.message?.content);
}
void main();
