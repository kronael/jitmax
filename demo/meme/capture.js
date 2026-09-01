// Frame-exact capture of the rig. Every frame is `renderFrame(t)` and nothing
// else, so a re-run reproduces the same PNGs — which is why the rig seeds its
// own jitter instead of calling Math.random.
//
// Usage: node demo/meme/capture.js <frames> [from] [to] [outdir]
//
// The range lets compose.sh capture the two rig acts at different durations.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { N as NUMBERS } from '../../lib/numbers.ts';
import { EVIDENCE } from '../../lib/rules.ts';

const N = Number(process.argv[2] ?? 192);
const FROM = Number(process.argv[3] ?? 0);
const TO = Number(process.argv[4] ?? 1);
const OUT = path.join('tmp', process.argv[5] ?? 'meme-frames');

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + path.resolve('demo/meme/rig.html'));
// Every published number is derived, never typed: the rig's captions hold
// {key} placeholders and this injection resolves them from lib/numbers.ts.
// A key the table lacks throws here and fails the capture.
await page.evaluate((nums) => window.setNumbers(nums), NUMBERS);
// The names on the burning room are the rules the tool ships, read from the
// same table the checker reports from — never a list typed into the rig.
await page.evaluate((names) => window.setRules(names), Object.keys(EVIDENCE));
const stage = page.locator('#stage');

for (let i = 0; i < N; i++) {
  const t = FROM + (TO - FROM) * (i / N);
  await page.evaluate((x) => window.renderFrame(x), t);
  await stage.screenshot({ path: path.join(OUT, String(i).padStart(4, '0') + '.png') });
  if (i % 24 === 0) process.stdout.write(`${i}/${N}\r`);
}
await browser.close();
console.log(`\n${N} frames of t=[${FROM}, ${TO}) -> ${OUT}`);
