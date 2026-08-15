# Array benchmarks, round 2 — size sweep, construction cost, arrays of objects

2026-08-09. Fixes the two round-1 defects (single ~8 MB working set;
construction excluded) and adds the missing arrays-of-objects suite.
Methodology: SPEC.md §4. Predictions in this file were committed before
any measured pair ran.

## Environment

- CPU: AMD Ryzen 9 5950X (VM, 2 vCPUs exposed). VM-visible caches: L1d
  64 KB per vCPU (lscpu: 128 KiB / 2 instances), L2 512 KB per vCPU
  (1 MiB / 2), L3 16 MB per instance (32 MiB / 2). Microcode 0xa20102d.
- Governor: unavailable (VM). Turbo policy: unknown (VM) — recorded as a
  limitation, per SPEC §4.9.
- Core affinity: every benchmark child runs under `taskset -c 1`; the
  driver is unpinned.
- Node v22.23.2, V8 12.4.254.21-node.56, kernel 6.1.0-43-amd64, no extra
  V8 flags, default heap flags. Node binary hash: not recorded (single
  machine, single binary at `~/.local/bin/node`).
- Cache-level mapping used below: 4 KB → L1, 256 KB → L2, 4 MB → L3,
  64 MB → RAM. Size classes are defined by **payload bytes** (the x,y
  doubles); true per-variant footprints are measured and reported, and
  object variants exceed the nominal class by ~4-5x — interpretation
  against the VM's actual cache sizes uses the measured footprint column.

## Methodology (as implemented)

Per SPEC §4, with the sanctioned reduction: **20 measured pairs per
comparison, not 50** — 72 comparison cells × (10 pilot + 20 measured)
pairs × 2 processes ≈ 4,300 process spawns already cost ~an hour of
serial wall-clock on this VM; 50 pairs would triple it.

- One fresh OS process per observation; a process loads exactly one
  variant (`bench/arrays_kind.js`, `bench/arrays_obj.js`).
- Randomized AB/BA order within each pair; both members get the same
  seed, and the row-value PRNG stream is identical across variants, so
  the verification checksum must match within every pair — the driver
  aborts on mismatch (this is also the correctness check).
- 10 pilot pairs per cell, discarded; they fix the per-variant rep count
  R (median of adaptive pilots targeting ~120 ms timed regions).
- 20 predeclared measured pairs; statistic = ratio of mean per-op times
  (test/base); paired bootstrap (2,000 resamples over pair indices),
  95% percentile interval. Raw observations are in `bench/results.jsonl`.
- Dead-code defense: runtime-seeded input, timed reps folded into a sink
  printed with the result, one untimed verification pass after timing
  produces the compared checksum. No I/O in the timed region.
- Modes: `excl` = build untimed, timed region is R traversal passes;
  `incl` = timed region is R × (build + one traversal).
- Elements kinds and map distinctness verified once, outside evidence
  runs, with `--allow-natives-syntax` (`bench/verify_kinds.js`); evidence
  runs use no tracing, no natives (SPEC §4.8).

## Committed predictions (written before measurement)

Ratios are test/base per-op time; >1 means test is slower. Point
prediction with a plausible range in parentheses.

### Suite A — elements kinds, base = packed-double `number[]`

| pair | mode | 4KB/L1 | 256KB/L2 | 4MB/L3 | 64MB/RAM |
|---|---|---|---|---|---|
| holey/double | excl | 1.15 (1.0-1.4) | 1.15 (1.0-1.4) | 1.10 (1.0-1.3) | 1.05 (1.0-1.15) |
| holey/double | incl | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) | 0.95 (0.85-1.1) |
| boxed/double | excl | 2.5 (2-4) | 2.5 (2-4) | 2.0 (1.5-3) | 1.7 (1.3-2.5) |
| boxed/double | incl | 3.0 (2-5) | 3.0 (2-5) | 2.5 (1.8-4) | 2.0 (1.5-3) |
| f64/double | excl | 1.0 (0.9-1.1) | 1.0 (0.9-1.1) | 1.0 (0.9-1.1) | 1.0 (0.9-1.1) |
| f64/double | incl | 0.9 (0.8-1.0) | 0.9 (0.8-1.0) | 0.9 (0.8-1.0) | 0.9 (0.8-1.05) |

Committed reasoning: round 1's 1.2x boxed figure was bandwidth-masked and
construction-blind; in-cache and with allocation included it should be
2-5x. Holey stays mild everywhere (the round-1 burial survives). Typed
arrays give no read-side win over packed double (burial survives), and
win slightly on construction.

### Suite B — arrays of objects, kernel `s += x + y` over N

Bases: variants 2, 3, 7 are measured against **variant 1 (Float64Array,
interleaved)**; variants 4, 5, 6 against **variant 3 (one-shape objects)**.

| pair | mode | 4KB/L1 | 256KB/L2 | 4MB/L3 | 64MB/RAM |
|---|---|---|---|---|---|
| 2 nums/f64 | excl | 1.1 (1.0-1.3) | 1.1 (1.0-1.3) | 1.1 (1.0-1.3) | 1.05 (1.0-1.25) |
| 2 nums/f64 | incl | 1.4 (1.2-1.8) | 1.4 (1.2-1.8) | 1.4 (1.2-1.8) | 1.4 (1.2-1.8) |
| 3 shape1/f64 | excl | 2.5 (2-4) | 3.0 (2-4.5) | 4.0 (3-6) | 5.0 (3.5-8) |
| 3 shape1/f64 | incl | 4.0 (3-6) | 4.0 (3-6) | 5.0 (3.5-7) | 6.0 (4-9) |
| 7 soa/f64 | excl | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) |
| 7 soa/f64 | incl | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) | 1.0 (0.9-1.2) |
| 4 shape2/shape1 | excl | 1.1 (1.0-1.3) | 1.1 (1.0-1.3) | 1.1 (1.0-1.3) | 1.05 (1.0-1.2) |
| 4 shape2/shape1 | incl | 1.05 (1.0-1.2) | 1.05 (1.0-1.2) | 1.05 (1.0-1.2) | 1.05 (1.0-1.2) |
| 5 shape5/shape1 | excl | 2.2 (1.6-3.5) | 1.8 (1.4-2.8) | 1.5 (1.2-2.2) | 1.3 (1.1-1.8) |
| 5 shape5/shape1 | incl | 1.6 (1.3-2.5) | 1.4 (1.2-2.0) | 1.25 (1.1-1.7) | 1.15 (1.05-1.5) |
| 6 scatter/shape1 | excl | 1.1 (1.0-1.3) | 1.6 (1.2-2.2) | 2.0 (1.5-3) | 2.5 (1.8-4) |
| 6 scatter/shape1 | incl | 1.8 (1.4-2.8) | 2.0 (1.5-3) | 2.2 (1.6-3.2) | 2.5 (1.8-3.5) |

Committed adjudication call: **in cache, shape (5v3) beats locality
(6v3); out of cache, locality beats shape.** If 6v3 ≥ 5v3 broadly, the
object-shape cost is mostly a locality cost, the linter cannot detect it
statically, and the shape rule joins the graveyard per the coordinator's
criterion.

Notes committed with the predictions:

- Object variants carry a third field `z` (drawn from a separate PRNG
  stream so x,y stay identical across variants). Three fields are needed
  to give five distinct maps identical object size via key order alone.
  The kernel never reads `z`.
- Scatter retains its filler objects for the whole run so young-gen
  evacuation cannot re-compact the rows; its construction-included cost
  includes allocating the fillers, which is disclosed as a diagnostic
  (scatter is an instrument that isolates locality, not a lintable
  pattern).
- Under pointer compression, `x`/`y`/`z` double fields are heap-boxed
  (SPEC §10), so each row is a JSObject plus up to three HeapNumbers —
  the estimated ~72 B/element footprint, to be replaced by the measured
  column.

## Results

**This section was never filled in, and the runs it describes were never made.**
It read, in full, *"(filled in after the runs; raw observations in
`bench/results.jsonl`)"*. There is no `bench/results.jsonl`, and neither
`bench/arrays_kind.js` nor `bench/arrays_obj.js` — the kernels named in
§Methodology above — was ever written. The suite A figures that reached
`SPEC.md` §3 and `boxed-elements`' `EVIDENCE` string, 1.45-1.89x on reads and
2.36-3.28x with construction, survived only as a table. Recorded as `BUGS.md`
TC-14 on 2026-08-14.

**Suite A was run on 2026-08-15 and is in `bench/arrays.jl`** — `bench/arrays.js`,
`bench/run-arrays.js`, `make bench-arrays`, 20 cells, 20 pairs each, every cell
replicated three times per SPEC §4 rule 13. The results and what they did to the
rule are in SPEC §3; in brief, the committed prediction of 2-5x for boxed reads
and 2-5x with construction was too high on both halves (1.39-1.66x and
1.07-1.69x), the holey and `Float64Array` burials held, and the rule was
withdrawn — not for its magnitude but for its trigger, which is the declared
element type and does not decide the elements kind.

**Suite B has not been run.** The arrays-of-objects shape question it predicts
was answered instead by `bench/shapes-calibrated.jl` and `bench/dispatch.jl`,
which measure shape count at a load site and at a call site directly. The
locality-versus-shape adjudication this suite was designed for is still
unmeasured, and no claim in this project rests on it.
