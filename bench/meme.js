// The meme is generated from the raw sweeps, so it cannot drift from the
// measurement. Both sweeps are plotted as a range: the second one showed that
// anything under ~1.7x on this machine is not reproducible, and a picture that
// hid that would mislead in exactly the way this project exists to prevent.
//   node bench/meme.js > meme.svg

import fs from 'node:fs';
import path from 'node:path';

const read = (f) =>
  fs
    .readFileSync(path.join(import.meta.dirname, f), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter((r) => r.mode === 'excl' && r.size === 'L1');

// One sweep, one method, and the bar shows that cell's own 95% interval. The
// earlier version plotted the range across two sweeps measured by the old
// calibration, which mixed two methods inside one bar.
const sweep = read('shapes-calibrated.jl');

const bars = [1, 2, 3, 4, 5].map((shapes) => {
  if (shapes === 1) return { shapes, lo: 1, hi: 1 };
  const cell = sweep.find((r) => r.shapes === shapes);
  if (!cell) throw new Error(`no calibrated cell for ${shapes} shapes`);
  return { shapes, lo: cell.lo, hi: cell.hi, ratio: cell.ratio };
});
const peak = Math.max(...bars.map((b) => b.hi));
// The headline is derived, not typed. A hand-written number is exactly the
// kind of drift between claim and measurement this project exists to catch.
const cliff = bars[bars.length - 1];
const headline = `The fifth object shape costs ${cliff.ratio.toFixed(1)}x.`;

const W = 1200;
const H = 630;
const BASE = 505;
const x = (i) => 130 + i * 190;
const y = (r) => BASE - (((r - 1) / (peak - 1)) * 250 + 24);

// krons palette (pub/krons/CLAUDE.md): blue is primary, red is the sparse
// "extreme" signal. The fifth shape is the only extreme thing on this chart.
const BLUE = '#60a5fa';
const RED = '#f87171';

const bar = (b, i) => {
  const hot = b.lo > 2;
  const color = hot ? RED : BLUE;
  const label = b.shapes === 1 ? '1.00x' : `${b.lo.toFixed(2)}-${b.hi.toFixed(2)}x`;
  return `
  <rect x="${x(i)}" y="${y(b.hi)}" width="120" height="${BASE - y(b.hi)}" rx="3"
        fill="${color}" opacity="${hot ? 0.9 : 0.35}"/>
  <rect x="${x(i)}" y="${y(b.hi)}" width="120" height="${y(b.lo) - y(b.hi)}"
        fill="${color}" opacity="0.25"/>
  <text x="${x(i) + 60}" y="${y(b.hi) - 14}" text-anchor="middle"
        font-size="${hot ? 34 : 21}" font-weight="700"
        fill="${color}">${label}</text>
  <text x="${x(i) + 60}" y="${BASE + 34}" text-anchor="middle" font-size="24"
        fill="#a0a8b8">${b.shapes} shape${b.shapes > 1 ? 's' : ''}</text>`;
};

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">
  <rect width="${W}" height="${H}" fill="#0a0e1a"/>
  <text x="130" y="96" font-size="46" font-weight="700" fill="#f5f5f0">
    ${headline}
  </text>
  <text x="130" y="146" font-size="23" fill="#a0a8b8">
    V8's inline cache holds four maps. The fifth makes every load megamorphic.
  </text>
  <text x="130" y="186" font-size="22" fill="#5a6478">
    256 objects, reads only, 20 paired runs, bars show the 95% interval
  </text>
  ${bars.map(bar).join('')}
  <line x1="110" y1="${BASE}" x2="${W - 110}" y2="${BASE}" stroke="#1a2332" stroke-width="2"/>
  <text x="130" y="588" font-size="25" fill="#f5f5f0">
    <tspan fill="${BLUE}">/** @turbocharge */</tspan>
    <tspan fill="#a0a8b8"> — it tells you which side you are on.</tspan>
  </text>
</svg>
`);
