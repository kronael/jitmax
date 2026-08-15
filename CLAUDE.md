# turbocharge

Mark a TypeScript function `/** @turbocharge */`. The checker walks that
function and every callee whose source is in the program, and reports patterns
measurement shows can push V8 off its fast path.

## Layout

```
lib/          scan.ts (the recursive walk), rules.ts (the rules + EVIDENCE), report.ts, ts.ts
bin/          turbocharge.ts — exit 0 clean, 1 findings, 2 the tool failed
demo/lib.ts   every rule's fixture, including the must-stay-silent ones
test/         one test per rule, plus one per silent case
bench/        one workload + one runner + one .jl per measured claim
README.md     how to use it, the rules, and the V8 citation table
BUGS.md       the review queue. Found during audits, fixed only when asked
```

## Two evidences, and how to verify each

Every rule carries **a benchmark** (what it cost here) and **a V8 citation**
(what mechanism exists). Neither substitutes for the other. A benchmark cannot
say why; a citation cannot say what it costs.

**Verify a benchmark** — re-run it. Every claim has a `make bench-*` target and
ships its raw per-pair timings beside the aggregate, so the interval is
recomputable:

```sh
make bench-dispatch        # and bench-spread, -select, -chained, -strings, -addprop, …
```

Nothing else may run on the machine during a sweep. These are timings.

**Verify a V8 citation** — `make v8-check` re-reads every quoted line in
README.md's V8 table and compares it against a local checkout of V8's source:

```sh
git clone --filter=blob:none --sparse https://github.com/v8/v8 v8src
git -C v8src sparse-checkout set src include
git -C v8src checkout c635f0d160b6e988b5ea5a907511a2929beb5d5e   # the pin, V8 15.3.0.0
make v8-check
```

`v8src/` is 96 MB and gitignored, so the check needs that clone. Without it the
check exits non-zero and says so — it never reports success when it cannot look.
When V8 moves, the check fails with the drifted line: re-read the new source and
correct the citation, never the other way round.

## Rules of this repo

- **Measure before you ship a rule.** A constant in V8's source is a hypothesis
  about cost. Only a benchmark makes it a rule.
- **Every rule records where its own benchmark found nothing**, and a test
  asserts the rule stays quiet there. A rule that fires in a case its
  measurement rejected fails `make test`.
- **A cell whose 95% interval spans 1.0 is rejected.** A refutation is a shipped
  result — the graveyard in SPEC §3 is a launch artifact, not a failure log.
- **Never overwrite a `.jl`.** Runners append. Superseded sweeps are kept
  under a suffix (`-precal`, `-oldcal`) so a reader can see what changed.
- **Never dispatch on a variant string inside a timed loop.** Resolve the kernel
  to a function once, before timing. A `switch` in a timed region produced a
  wrong result here.
- **Both halves, always**: reads-only and with construction. Measuring one half
  has reversed a verdict twice.
- **The tool must stay honest about coverage.** A truncated walk prints
  `WALK TRUNCATED` and is never reported as clean; an unreadable callee is
  listed by name.

Reality check before any release: `node bin/turbocharge.ts tmp/demo-real/src`
against a radash checkout must report exactly one finding. More than one means a
false positive shipped.
