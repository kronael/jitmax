# Changelog

## [v0.13.1] — 20260902

> jitmax v0.13.1 — the select numbers were re-measured, and one of them did not survive
>
> `allocating-select` cited eighteen rows that recorded the machine's state as one number stamped across a whole evening. The machine was quieted and all six cells were measured again, three sweeps each, with the reading taken as every row was written.
>
> • The rule's cost is confirmed, not moved: 2.56-2.87x becomes 2.60-2.89x, and every figure now rests on a row whose machine state a reader can check.
> • The silent clause loses a claim. It said the effect on numbers "changes sign with the working set"; the n=100000 cell reads 0.89x, 0.97x and 1.03x, rule 13 withdraws it, and there is no sign left to change.
> • Resume counted a frozen reading as a measured run, which is why those six cells could never re-measure themselves however often the sweep was re-run.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Fixed

- **Six cells were permanently unmeasurable.** `bench/resume.ts` counted any
  in-gate row as a finished run, including a row whose only reading of the
  machine was frozen into the sweep record and copied onto every row of an
  evening's work. `select.jl`'s six cells each had three such rows, so the
  runner skipped them every time the sweep ran. `frozen()` in `bench/env.ts`
  now separates the two cases: a row with NO reading predates the mechanism and
  is still counted, a row that claims to answer rule 9 and answers with one
  stale number is not a run of anything (TC-134).
- **`allocating-select` published from rows nobody could check.** Its six
  citations in `lib/derive.ts` now ask `hasReading`, so they read the
  re-measurement and not the frozen eighteen. The old rows stay in the file —
  runners append — and back no published number.

### Changed

- **The silent clause on numbers is smaller and truer.** It read "the effect is
  small and changes sign with the working set", quoting one range across both
  sizes. The re-measurement withdraws the n=100000 cell under rule 13, so the
  clause now states each size separately: n=10000 costs 1.10-1.19x with a lower
  bound under the broad-warning bar, and n=100000 has no measurement to warn
  from. The rule stays quiet on numbers, for the third time and on a smaller
  margin each time.
- **`bench/select.jl` gained eighteen rows**, none void, `runnable` 0 on every
  one. The two sweeps agree cell for cell; the frozen sweep's numbers were
  right, and could not be shown to be.

### Known

- **689 published rows carry no reading of the machine at all** (TC-136). Of
  976 rows under the current runner, 269 carry a per-row `load1` and `runnable`
  and 707 do not; 18 were select's and are now superseded. The rest predate the
  field across ten sweeps. `overGate` reports them as unjudgeable rather than
  contaminated, and the one re-measurement run so far found the old numbers
  correct — but rule 9 asks for the environment in every row, and these do not
  carry it. Withdrawing them is a re-measurement of ten sweeps, so it is in the
  queue for a decision rather than shipped here.

## [v0.13.0] — 20260901

> jitmax v0.13.0 — thirteen defects closed, and the page stops selling a rejection
>
> Four parallel audits of the checker, the report, the benchmark harness and the published evidence. Seventeen queue entries retired; two of them had been closed for weeks and nobody had noticed.
>
> • `jitmax` and `jitmax .` gave different verdicts on the same project. A path argument now chooses the file list and nothing else.
> • Fourteen ratios typed into `examples/*.ts` had drifted from the data. That surface is now checked prose.
> • The page sold a cell the protocol rejects as "three to twelve percent". It says rejected.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Fixed

- **The two invocations disagreed about the same project, in both directions.**
  `lib/ts.ts` spread the project's options over built-in NodeNext defaults, so
  every option a project left unset kept the tool's: `jitmax` exited 0 and
  `jitmax .` exited 1 on the same files. The defaults now apply only when no
  tsconfig was found (TC-32). A review of that fix found the other half — the
  bare run passed `parsed.options` alone, without the `allowJs` the path run
  adds, so a tsconfig leaving `allowJs` unset had its `.js` helpers read by
  `jitmax .` and reported unresolved by `jitmax`, with "check the path" printed
  about a file that is on disk. A path argument now chooses the file list and
  nothing else, which is what the sentence had been claiming.
- **An unresolved bare import said `npm install` for both its causes.** It now
  tells a declared `paths` alias with a missing target from a missing package,
  and names the tsconfig that was in force (TC-80). A run launched elsewhere
  names the tsconfig sitting beside the path it was given (TC-76).
- **`delete` on a null-prototype object was reported.** `Object.create(null)` is
  already dictionary mode, so nothing demotes. The guard reads the receiver's
  initializer, because `Object.create` returns `any` (TC-105).
- **A method whose whole body throws was followed as an implementation.** It is
  `abstract m(): T;` written in a language without `abstract`. Refusing it also
  let the dataflow walk reach a real body it had been missing (TC-106).
- **A finding said it had no body while printing two.** `Dispatch` carries
  `located`; the no-body sentence is reserved for `located === 0` (TC-109).
- **`o[k]()` with a literal key was reported as unreadable user code** one line
  under `o.k()` counted as a platform call (TC-108).
- **Fourteen ratios in `examples/*.ts` headers had drifted** from what
  `lib/derive.ts` derives — one published a cell rule 13 refuses. The example
  pairs are now read as checked prose, discovered from the directory (TC-38).
- **The page sold a rejected cell as a win.** zod `cleanEnum` at 256 members
  measured 1.03-1.10x, clearing neither half of rule 6's broad-warning bar. The
  page said "three to twelve percent, neither interval spanning 1", which is
  rule 5 only. It now prints the rejection (TC-83).
- **`docs/rules.md` claimed a silence the rule never had** — closed-world
  consults no size and nothing could (TC-33's second order), and claimed every
  rule ships a benchmark while `interface-dispatch` says it has none (TC-15).
- **Boxed-elements' three figures were typed** with their rows sitting in
  `bench/arrays.jl`. They are derived (TC-14).

### Changed

- **A row's reading of the machine is taken as that row is written**, and a
  sweep record carrying a frozen one kills the run. Eighteen `select.jl` rows
  carry one identical reading stamped across an evening; they are pinned in a
  register so they cannot be forgotten (TC-24, TC-47).
- `--plan` names the file the run would write, and a raised gate is named in the
  row it governed (TC-20). Resume's in-gate rule moved to `bench/resume.ts`
  where a test can ask it (TC-91).
- `bugEntries()` asserted the queue held more than 50 entries as a canary for a
  broken heading pattern. Pruning the queue tripped it. Every `## TC-` heading
  must now parse, which is the failure the canary was reaching for.

## [v0.12.3] — 20260901

> jitmax v0.12.3 — one question per file
>
> README was 952 lines and answered six questions at once. It is 265 now, and six more files each answer exactly one.
>
> • `docs/rules.md` gives every rule a trigger snippet quoted from the tested fixture, plus the neighbouring case that stays silent.
> • `bench/README.md` carries the protocol, the generated numbers, the V8 pin and the citation table — and the four programs that read them follow.
> • `ARCHITECTURE.md`, `docs/limits.md`, `test/README.md` and `examples/README.md` take the rest. README ends with an index saying which file answers what.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Added

- `ARCHITECTURE.md` — how the walk, the dataflow, the rule register and the
  derived-number chain fit together, each decision naming the alternative it
  rejected.
- `docs/rules.md` — per rule: what it detects, a trigger quoted from
  `demo/lib.ts`, the neighbouring fixture that stays silent and why, the fix,
  and the measured cost with its sweep file. The snippets are quoted from the
  file `make check` runs, so a rule that changes behaviour breaks a test before
  the document goes stale.
- `docs/limits.md`, `bench/README.md`, `test/README.md`, `examples/README.md`.
- `examples/README.md` names the four vendored functions with their upstream
  version, commit and licence: radash `assign`, remeda `mergeAll`, es-toolkit
  `omit`, zod `cleanEnum`.

### Changed

- README is 265 lines: what it is, how to start, the eight rules, the exit
  contract, one measured number, when not to use it, and an index of which file
  answers which question.
- The generated numbers block, the V8 pin and the citation table live in
  `bench/README.md`. `lib/derive.ts`, `bench/v8-check.ts`,
  `lib/derive-builtins.ts` and CI's revision `sed` read them there.
- `test/check.test.ts` gains a `DOCS` register. Each guard scans the file that
  holds the claim, and a doc file outside the register has unchecked numbers.
- Three of eight rules have an end-to-end example on foreign code, not four.
  `node bin/jitmax.ts examples` reports one rule per vendored function.

## [v0.12.2] — 20260901

> jitmax v0.12.2 — the film keeps all three acts, and V8 is set as type
>
> v0.12.1 deleted the launch film to settle a trademark question. That was the wrong cut: the film is how the tool explains itself. It is back, whole, and the question is settled by typography instead.
>
> • Act three shows the word `V8` set as type. No shield, no chevron, no wings, and no fetched Google asset.
> • `recolour.py` and the `tmp/v8-outline.svg` fetch are deleted; `rig.template.html` became the committed `rig.html` because no template step remains.
> • The film pipeline falls from 679 to 503 lines across four files, and act two is re-cut against the current recording.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Changed

- The three-act film is restored. v0.12.1 deleted it; this reverts that. The
  page hero, the social card and `make meme` are back on `demo/meme/`.
- Act three shows `V8` set at 330px in Liberation Sans Narrow rather than
  Google's mark. TC-30's own research named this fix — keep the word in the
  text, drop the mark from the film, carry the attribution line in README —
  and the entry is closed on it.
- `demo/meme/recolour.py` is deleted and `rig.template.html` is now the
  committed `demo/meme/rig.html`: with no SVG to inline there is no template
  step. `make clean` and `.gitignore` no longer name a generated rig.
- The `tmp/v8-outline.svg` `curl` target is gone. One fetch is left, the comic
  panel.
- Act one now labels all eight rules. It was tuned for seven.
- Act two is re-cut against the current `demo/demo.mp4`, which was recorded
  after every rule became an error.

### Removed

- The `.first-run` worktree and its `.gitignore` entry. Its commits were
  already ancestors of HEAD in content.

## [v0.12.1] — 20260831

> jitmax v0.12.1 — the recording is the film
>
> The launch loop had a borrowed comic panel in front of it and Google's V8 mark behind it, neither cleared; both are gone and the real terminal recording stands on its own.
>
> • The page hero is the asciinema run of the checker, re-cut so it shows what the tool prints today.
> • The social card is a real frame of that recording — `make card` — so the page cannot advertise output the tool does not produce.
> • 261 lines of film pipeline and two external image fetches deleted.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Changed

- The three-act launch film is one act: the real recording. `make meme`,
  `asset.py`, `recolour.py`, `capture.js`, `compose.sh` and `rig.template.html`
  are gone, along with the `curl` targets that fetched Google's V8 mark and the
  "This Is Fine" panel. `make card` cuts the social card from a frame of the
  recording (`BUGS.md` TC-30).
- `demo/demo.gif` and `.mp4` are re-recorded: they were cut on 2026-08-28, and
  every rule became an error since, so they quoted output the tool no longer
  prints.

## [v0.12.0] — 20260831

> jitmax v0.12.0 — every finding fails the run, and npx works
>
> You mark the functions you need fast, so anything found in one is worth fixing — the warning tier is gone and the tool now runs straight from the repo.
>
> • Every rule is an error. Silence the ones you don't want with `[rules]` in TOML or `-rulename` on the function.
> • `npx github:kronael/jitmax src` and `bunx` work — no clone, no build step.
> • A run that checked nothing no longer says "clean": no annotations, an unreadable `any` receiver, or a body-less declaration all exit 1.
> • Findings bind to the collection the value came from, not to any value that shares its type — a third of what one rule said about real code was wrong.
> • A `--cpu-prof` profile from transformed source is ported back through its source map, so frames land on the line you wrote.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Changed

- **Every finding is an error, and every error fails the run.** `closed-world`,
  `interface-dispatch` and `megamorphic-dispatch` carried `severity: 'warn'` and
  exited 0; the `severity` field is gone from `Evidence` entirely. The
  annotation is the filter: you write `/** @jitmax */` only on a
  function you need fast, so a finding on one is actionable by definition and a
  second tier gates nobody. Tuning is the `[rules]` TOML table and the
  per-function `-rulename` / `-TC-NN` annotations. **This changes exit codes in
  CI**: those three rules are 98.6% of the 22-codebase survey, and they fire on
  programs their own benchmarks did not measure — they still say so, as
  `known defect: TC-33` under every finding (`BUGS.md` TC-33).
- `make reality` reads the composition of the radash run, not a count of errors
  alone: exactly one `accumulating-spread` on `assign()`, every other error an
  escape rule, and the total pinned to the revision CI clones.

### Fixed

- A method read off a value typed `any` — `b.has(key)` where `b: any` — is no
  longer reported as a callee nobody can read. The property access resolves to
  no declaration, so the platform test never fired and es-toolkit's `Map` and
  `Set` builtins were printed with "inline what you need from `b.has`". The call
  now goes through the blindness channel with the unresolved modules: named,
  counted, and exit 1, because the tool cannot see what runs there
  (`BUGS.md` TC-129).

## [v0.11.0] — 20260831

> jitmax v0.11.0 — the loud rule splits in two
>
> Calls through an interface are their own rule now, so silencing them no longer silences the honest "no body anywhere" warning.
>
> • `interface-dispatch` — 96.7% of survey findings leave `closed-world`, and each rule is suppressible on its own.
> • Findings name the implementations that reach a receiver, traced by dataflow, instead of guessing from the type.
> • A run that could not read every module exits 1 — a blind run never reports clean again.
> • An annotation on an overload signature checked nothing and reported clean — it checks the implementation now.
> • Eight rules, 126 tests, and `make reality` runs the release gate instead of a paragraph asking someone to.
> • CI runs `make all` and `make v8-check` against the pinned V8 on every push.
>
> Full notes: https://github.com/kronael/jitmax/blob/main/CHANGELOG.md

### Added

- `interface-dispatch`, split out of `closed-world`. A call the walk cannot bind
  to one implementation was 96.7% of every finding in the 22-codebase survey, so
  `[rules] closed-world = false` also switched off the one cause that is honest
  about not being able to look. Separately suppressible, separately countable.
- Receiver-origin dataflow (`lib/flow.ts`): a 0-CFA walk from a call site back
  through locals, fields, parameters, `this` and factory returns to allocation
  sites. One visible implementation is followed and stays silent, two to four are
  named, five or more report "at least N", an unknown origin is named and never
  numbered. Cycles are cut and marked as a lower bound.
- CI: `ci` runs `make all` and `make v8-check` at the pinned V8 revision, never
  at main. `v8-drift` asks weekly whether the 14 citations and the
  lowered-builtin list still hold at main, and gates nothing.
- `make reality` runs the release gate: the tool against a radash checkout,
  where the one error must be `accumulating-spread` on `assign`. A missing
  checkout exits 2 and says how to clone it. CI runs it on every push at a
  pinned radash revision, and `make verify` chains every gate.
- `make test` holds both published surfaces to `package.json`'s version, to the
  rule register and to the test count — README claimed seven rules in one
  sentence and eight in another, and 67 unit tests against a real 126.

### Changed

- One file per rule under `lib/rules/`, each carrying its detector, its
  `EVIDENCE` and its name, read from one register. Three registers had let a rule
  reach two of them and lose its evidence silently.
- The bench harness is TypeScript, so `tsc` checks the code that produces the
  evidence. `bench/natives.js` stays JavaScript: it wraps V8 natives syntax,
  which no TypeScript parser reads.
- The release gate counts errors. It asked for one *finding* on radash, which
  stopped being true at v0.10.0 when the walk began reporting calls it cannot
  follow; the error count itself never moved (BUGS TC-123).

### Fixed

- **An annotation on a declaration with no body checked nothing and reported
  clean at exit 0.** JSDoc above the first overload — where JSDoc for an
  overload set conventionally goes — left the implementation unwalked. The mark
  binds to the implementation now; when no declaration has a body anywhere, the
  run says so and never reports clean.
- A run that could not see everything exited 0. An unresolved module, an
  unmatched hot frame and a truncated walk now all exit 1.
- Two exit-2 crashes on legal source, and the walk enters constructors.
- Both escape rules counted the receiver and fired on the host;
  `allocating-select` fired on a shape other than the one it measures;
  `megamorphic-elements` paired an array in one nested function with a read in an
  unrelated sibling; `delete-property` asserted a false fact about
  `JSON.stringify`.
- Finding counts: an array literal is keyed by its elements kind rather than its
  allocation site, an origin lacking the method is not counted, and an `any`
  receiver is no longer counted as declared. Across the survey that is 54
  findings down to 1 on valibot, 21 to 0 on es-toolkit, and 21 to 10 on vue.
- The landing page listed six of the eight rules — `megamorphic-dispatch` and
  `interface-dispatch` were absent — and credited one rule with a finding share
  that belongs to three.

### Data

- `bench/tiers.jl` gains the tier diagnostic over every published cell, re-run at
  the rep counts each cell was published at. Recorded, never gated on.
- Two sweeps completed and neither earns a rule; both are published as the
  refutations they are.
