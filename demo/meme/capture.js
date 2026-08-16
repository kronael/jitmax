// Frame-exact capture of the loop rig. Every frame is `renderFrame(i/N)` and
// nothing else, so a re-run reproduces the same PNGs — which is why the rig
// seeds its own jitter instead of calling Math.random.
//
// Usage: node demo/meme/capture.js [frames]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const N = Number(process.argv[2] ?? 192);
const OUT = path.join(ROOT, 'tmp', 'meme-frames');

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + path.join(HERE, 'rig.html'));
const stage = page.locator('#stage');

for (let i = 0; i < N; i++) {
  await page.evaluate((t) => window.renderFrame(t), i / N);
  await stage.screenshot({ path: path.join(OUT, String(i).padStart(4, '0') + '.png') });
  if (i % 24 === 0) process.stdout.write(`${i}/${N}\r`);
}
await browser.close();
console.log(`\n${N} frames -> ${OUT}`);
