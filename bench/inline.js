// Workload behind closed-world. The rule reports calls the checker cannot see
// into. This measures what an opaque call can cost you, by isolating the one
// mechanism a call boundary controls: inlining.
//
//   small  — helper is a few bytes of bytecode, well under the inlining budget
//   large  — the SAME helper, with dead code padding its bytecode past
//            max_inlined_bytecode_size (460, src/flags/flag-definitions.h:1606)
//
// The padding sits behind a runtime-false flag, so it inflates the bytecode the
// inliner budgets against and never executes. Both variants therefore do
// identical arithmetic and return identical values — the only difference is
// whether V8 was allowed to inline the call.
//
//   node bench/inline.js <small|large> <n> <mode> <reps> <seed>

const [variant, n, mode, reps, seed] = [
  process.argv[2],
  Number(process.argv[3]),
  process.argv[4],
  Number(process.argv[5]),
  Number(process.argv[6]),
];

let s = seed;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const source = Array.from({ length: n }, () => Math.floor(rand() * 1000));

// Runtime-false. Derived from argv so V8 cannot fold the branch away at parse
// time and drop the padding it is there to create.
const never = process.argv.length > 99;

// The padding is in helperLarge's OWN body. An earlier version put it in a
// separate function, which left helperLarge tiny — V8 inlined both variants and
// the cell measured nothing. Verified with --trace-turbo-inlining.
function helperSmall(v) {
  return v * 2 + 1;
}

function helperLarge(v) {
  let t = 0;
  if (never) t += 1;
  if (never) t += 2;
  if (never) t += 3;
  if (never) t += 4;
  if (never) t += 5;
  if (never) t += 6;
  if (never) t += 7;
  if (never) t += 8;
  if (never) t += 9;
  if (never) t += 10;
  if (never) t += 11;
  if (never) t += 12;
  if (never) t += 13;
  if (never) t += 14;
  if (never) t += 15;
  if (never) t += 16;
  if (never) t += 17;
  if (never) t += 18;
  if (never) t += 19;
  if (never) t += 20;
  if (never) t += 21;
  if (never) t += 22;
  if (never) t += 23;
  if (never) t += 24;
  if (never) t += 25;
  if (never) t += 26;
  if (never) t += 27;
  if (never) t += 28;
  if (never) t += 29;
  if (never) t += 30;
  if (never) t += 31;
  if (never) t += 32;
  if (never) t += 33;
  if (never) t += 34;
  if (never) t += 35;
  if (never) t += 36;
  if (never) t += 37;
  if (never) t += 38;
  if (never) t += 39;
  if (never) t += 40;
  if (never) t += 41;
  if (never) t += 42;
  if (never) t += 43;
  if (never) t += 44;
  if (never) t += 45;
  if (never) t += 46;
  if (never) t += 47;
  if (never) t += 48;
  if (never) t += 49;
  if (never) t += 50;
  if (never) t += 51;
  if (never) t += 52;
  if (never) t += 53;
  if (never) t += 54;
  if (never) t += 55;
  if (never) t += 56;
  if (never) t += 57;
  if (never) t += 58;
  if (never) t += 59;
  if (never) t += 60;
  if (never) t += 61;
  if (never) t += 62;
  if (never) t += 63;
  if (never) t += 64;
  if (never) t += 65;
  if (never) t += 66;
  if (never) t += 67;
  if (never) t += 68;
  if (never) t += 69;
  if (never) t += 70;
  if (never) t += 71;
  if (never) t += 72;
  if (never) t += 73;
  if (never) t += 74;
  if (never) t += 75;
  if (never) t += 76;
  if (never) t += 77;
  if (never) t += 78;
  if (never) t += 79;
  if (never) t += 80;
  if (never) t += 81;
  if (never) t += 82;
  if (never) t += 83;
  if (never) t += 84;
  if (never) t += 85;
  if (never) t += 86;
  if (never) t += 87;
  if (never) t += 88;
  if (never) t += 89;
  if (never) t += 90;
  if (never) t += 91;
  if (never) t += 92;
  if (never) t += 93;
  if (never) t += 94;
  if (never) t += 95;
  if (never) t += 96;
  if (never) t += 97;
  if (never) t += 98;
  if (never) t += 99;
  if (never) t += 100;
  if (never) t += 101;
  if (never) t += 102;
  if (never) t += 103;
  if (never) t += 104;
  if (never) t += 105;
  if (never) t += 106;
  if (never) t += 107;
  if (never) t += 108;
  if (never) t += 109;
  if (never) t += 110;
  if (never) t += 111;
  if (never) t += 112;
  if (never) t += 113;
  if (never) t += 114;
  if (never) t += 115;
  if (never) t += 116;
  if (never) t += 117;
  if (never) t += 118;
  if (never) t += 119;
  if (never) t += 120;
  if (never) t += 121;
  if (never) t += 122;
  if (never) t += 123;
  if (never) t += 124;
  if (never) t += 125;
  if (never) t += 126;
  if (never) t += 127;
  if (never) t += 128;
  if (never) t += 129;
  if (never) t += 130;
  if (never) t += 131;
  if (never) t += 132;
  if (never) t += 133;
  if (never) t += 134;
  if (never) t += 135;
  if (never) t += 136;
  if (never) t += 137;
  if (never) t += 138;
  if (never) t += 139;
  if (never) t += 140;
  if (never) t += 141;
  if (never) t += 142;
  if (never) t += 143;
  if (never) t += 144;
  if (never) t += 145;
  if (never) t += 146;
  if (never) t += 147;
  if (never) t += 148;
  if (never) t += 149;
  if (never) t += 150;
  if (never) t += 151;
  if (never) t += 152;
  if (never) t += 153;
  if (never) t += 154;
  if (never) t += 155;
  if (never) t += 156;
  if (never) t += 157;
  if (never) t += 158;
  if (never) t += 159;
  if (never) t += 160;
  if (never) t += 161;
  if (never) t += 162;
  if (never) t += 163;
  if (never) t += 164;
  if (never) t += 165;
  if (never) t += 166;
  if (never) t += 167;
  if (never) t += 168;
  if (never) t += 169;
  if (never) t += 170;
  if (never) t += 171;
  if (never) t += 172;
  if (never) t += 173;
  if (never) t += 174;
  if (never) t += 175;
  if (never) t += 176;
  if (never) t += 177;
  if (never) t += 178;
  if (never) t += 179;
  if (never) t += 180;
  if (never) t += 181;
  if (never) t += 182;
  if (never) t += 183;
  if (never) t += 184;
  if (never) t += 185;
  if (never) t += 186;
  if (never) t += 187;
  if (never) t += 188;
  if (never) t += 189;
  if (never) t += 190;
  if (never) t += 191;
  if (never) t += 192;
  if (never) t += 193;
  if (never) t += 194;
  if (never) t += 195;
  if (never) t += 196;
  if (never) t += 197;
  if (never) t += 198;
  if (never) t += 199;
  if (never) t += 200;
  if (never) t += 201;
  if (never) t += 202;
  if (never) t += 203;
  if (never) t += 204;
  if (never) t += 205;
  if (never) t += 206;
  if (never) t += 207;
  if (never) t += 208;
  if (never) t += 209;
  if (never) t += 210;
  if (never) t += 211;
  if (never) t += 212;
  if (never) t += 213;
  if (never) t += 214;
  if (never) t += 215;
  if (never) t += 216;
  if (never) t += 217;
  if (never) t += 218;
  if (never) t += 219;
  if (never) t += 220;
  if (never) t += 221;
  if (never) t += 222;
  if (never) t += 223;
  if (never) t += 224;
  if (never) t += 225;
  if (never) t += 226;
  if (never) t += 227;
  if (never) t += 228;
  if (never) t += 229;
  if (never) t += 230;
  if (never) t += 231;
  if (never) t += 232;
  if (never) t += 233;
  if (never) t += 234;
  if (never) t += 235;
  if (never) t += 236;
  if (never) t += 237;
  if (never) t += 238;
  if (never) t += 239;
  if (never) t += 240;
  return v * 2 + 1 + t;
}

const helper = variant === 'large' ? helperLarge : helperSmall;

const sweep = (a) => {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += helper(a[i]);
  return t;
};

let sink = 0;
let t0;
let t1;

// 'excl' is the only meaningful mode here: there is nothing to construct. It is
// run in both so the cell shape matches every other sweep in this directory.
for (let w = 0; w < 3; w++) sink += sweep(source);
t0 = process.hrtime.bigint();
for (let i = 0; i < reps; i++) sink += sweep(source);
t1 = process.hrtime.bigint();

process.stdout.write(
  JSON.stringify({
    ns_per_op: Number(t1 - t0) / (reps * n),
    checksum: sweep(source).toFixed(6),
    sink: sink > 0,
    mode,
  })
);
