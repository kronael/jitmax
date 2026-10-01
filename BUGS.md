# BUGS

Review queue. Found during audits, fixed only when the owner asks.

For current installation and commands, use the [README quick start](README.md#quick-start).
`bunx github:kronael/jitmax` resolves against the public repository today.
Commands inside dated reports below reproduce those trials, not the current
setup instructions.

> **2026-08-17 — adversarial review.** TC-31 through TC-36 come from a hostile
> review commissioned to argue the tool is useless. Every one was re-run here
> before it was written down; the reproductions below are this repository's, not
> the reviewer's. The reviewer's verdict was "do not publish in its current
> form", and on the rules it names that verdict is defensible.

> **2026-08-19 — CEO and CTO audits.** TC-44 through TC-50 come from two
> commissioned reviews, one commercial and one technical, both told to argue the
> tool is not fit to release. Every technical claim below was re-run here before
> it was written down. Nine of the technical findings were fixed the same day and
> are recorded in the entries they belong to; these are the ones that are not.

> **2026-08-29 — three read-only audits.** TC-85 through TC-90 come from three
> commissioned audits run in parallel over one bucket each: the rule engine and
> the walk, the CLI and the report, and the numbers pipeline. Every claim was
> re-verified against the source here before it was written down, and every fix
> below is held by a fixture or a register entry.

> **2026-08-29 — the refinement pass.** TC-96 through TC-100 come from folding
> duplicated invariants into one value each. Every one of them is a place where
> two spellings of one fact had already drifted; each was reproduced here before
> it was written down, and each is recorded rather than fixed because the fix
> changes what the tool reports.

## TC-147 — `jitmax src` is reported to report less than the bare form (2026-10-01, open, unreproduced)

A usage report says the documented default, `jitmax src`, gives worse results
than the bare `jitmax`. Three attempts to reproduce it here produced byte-identical
output from both forms:

1. one annotated function in `src/hot.ts`, with a `tsconfig.json` whose
   `include` is `["src"]`;
2. the finding in a callee OUTSIDE the path argument, `vendor/merge.ts`, reached
   from `src/hot.ts` — the program follows the import past the file list and
   reports the callee's line in both forms;
3. the same through a `paths` alias, `"src/*": ["./src/*"]`.

So the difference is not the file list as such. TC-76 is the mechanism that
could produce it and is already recorded: the `tsconfig.json` comes from the
working directory and never from the path argument, so the two forms differ
exactly when the reader is standing somewhere the config does not govern — which
is the case the report does not pin down. Left open rather than closed, because
the report is a user's and three negatives from one machine do not refute it.

- **Severity:** medium
- **Scope:** `bin/jitmax.ts` argument handling; the README's path advice
- **Affected:** `jitmax src` versus `jitmax`
- **Source:** reported; reproduction attempted three ways on 2026-10-01, all
  three identical
- **Status:** open, needs the reporter's working directory and tsconfig
- **Fix:** none proposed. Get the failing invocation first; a fix written
  against a mechanism nobody has reproduced is a guess with a test around it.

## TC-146 — the report cites paths that do not resolve from the directory it ran in (2026-10-01, open)

Every finding ends with `measured in bench/spread.jl and bench/spread-object.jl`,
and a clean run ends with `run with -v for what each one misses, or read
docs/rules.md`. Both are paths inside a jitmax clone. The tool runs from the
user's project root, so from where the reader is standing, both resolve to
nothing:

```
$ bunx github:kronael/jitmax shapes.ts | grep 'measured in'
      measured in bench/shape-sets.jl and bench/shapes-calibrated.jl
$ ls bench/shape-sets.jl
ls: cannot access 'bench/shape-sets.jl': No such file or directory
$ bunx github:kronael/jitmax hot.ts | tail -1
  run with -v for what each one misses, or read docs/rules.md
$ ls docs/rules.md
ls: cannot access 'docs/rules.md': No such file or directory
```

`docs/rules.md` and `bench/README.md` do ship in the install archive, and
`bunx` writes no `node_modules/jitmax` in the project at all — it runs out of
its own cache, so there is no in-project path either resolves to. Of the `.jl`
sweeps only `bench/shape-sets.jl` is in `package.json`'s `files`, so for most
rules the named file is not on the user's disk in any form.

The citation is the best thing the report does — it is what makes a finding
checkable rather than an assertion — and it currently sends a first-time reader
to a path that does not exist. Recorded and not fixed here because the fix is in
`lib/report.ts`: the strings would become URLs into the published repository, or
be resolved against the installed package, and either is a code change.

- **Severity:** medium
- **Scope:** `lib/report.ts` — the `measured in` line and the clean-run footer
- **Affected:** every finding, and every clean run with an unchecked axis
- **Source:** `bunx github:kronael/jitmax shapes.ts` in a scratch project,
  2026-10-01
- **Status:** open, recorded not fixed
- **Fix:** print a URL at the pinned revision, or resolve the path against the
  installed package and print that. A URL is the honest one: the `.jl` row a
  ratio comes from is in the repository and not in the archive.

## TC-145 — a run whose only findings were suppressed says every annotated function is clean (2026-10-01, open)

The suppression line is printed, and then the verdict contradicts it:

```
$ bun /path/to/jitmax/bin/cli.js jitmax.toml src/hot.ts
jitmax — 1 annotated function, 0 errors
  1 finding suppressed (accumulating-spread)
  1 call into the platform, not listed: the body is native

  every annotated function is clean.
EXIT=0
```

`render()` computes `clean` from `all.length === 0 && partial.length === 0 &&
!blinded(blind)` and never reads `suppression.count`, so a config that switches
off the one rule that fired turns a finding into a clean bill of health, in the
sentence and in the exit code both. The suppression line above it is the whole
of the disclosure, and it is two lines away from a sentence that denies it.

This is TC-131's shape one step along. That entry fixed "nothing was checked"
reading as clean; this is "something was checked, something fired, and the
answer was thrown away" reading as clean. A gate reads the exit code, which is
`0`.

- **Severity:** medium
- **Scope:** `lib/report.ts` `render()`'s `clean` predicate, and the exit code
  `bin/jitmax.ts` derives from it
- **Affected:** any run with a `[rules]` table or a `-rulename` annotation that
  suppresses every finding
- **Source:** reproduced 2026-10-01 against
  `examples/radash-assign.before.ts` with `"accumulating-spread" = false`
- **Status:** open, recorded not fixed
- **Fix:** the verdict and the exit code are the owner's call, because they are
  the gate's contract. The narrow reading is that suppression is the user asking
  for silence and `0` is correct; the wider one is that `clean` already refuses
  to be printed over a truncated walk and an `any` receiver, which are also
  "the user's own code made me blind here". Either way the sentence should not
  say *clean* two lines under *1 finding suppressed*.

## TC-144 — TypeScript 7 crashes the quick start `ts.sys` is undefined (2026-09-30, fixed)

The documented quick start fails end to end, with no project TypeScript
installed and after installing today's `typescript@latest` (7.0.2):

```
$ bunx github:kronael/jitmax hot.ts
jitmax: undefined is not an object (evaluating 'ts.sys.fileExists')
EXIT=2
```

`package.json` declares `typescript: >=5.0.0 <6` as a peerDependency, and
`README.md` states the same range, but nothing enforced it at runtime:
`lib/ts.ts`'s `load()` returned whatever `require('typescript')` resolved, and
the crash landed later, deep in `tsconfigOf`/`program`, far from the resolve
that caused it — never reaching the existing "jitmax needs the \"typescript\"
package" message, because the bad resolve succeeded.

What resolved, with no project copy anywhere on disk: Bun's own module
resolver does not stop at a missing `node_modules/typescript` the way Node's
does — running under `bun`, `createRequire(cwd + '/index.js')('typescript')`
transparently resolves to today's npm `typescript@latest` (7.0.2 today) even
in a bare scratch directory with no `node_modules` at all. So the resolve
order in `load()` (project copy, then jitmax's own) was never the problem —
Bun hands back a version before either documented source is reached, and the
fix has to sit in a guard on what came back, not in the order it is asked for.

- **Severity:** high
- **Scope:** `lib/ts.ts` `load()`; every documented quick-start route
- **Affected:** `bunx github:kronael/jitmax hot.ts`, the existing-checkout route
- **Source:** reproduced directly, twice, and independently by a novice
  evaluator, with no TypeScript installed and with `typescript@7.0.2`
  installed; `createRequire(cwd+'/index.js')('typescript')` confirmed
  `version=7.0.2 sys=undefined`
- **Status:** fixed 2026-09-30 in the working line, and NOT on the published
  ref: `refs/heads/main` is `111a3b3`, two commits behind the guard, so
  `bunx github:kronael/jitmax hot.ts` against `typescript@7.0.2` still raises
  the bare `undefined is not an object (evaluating 'ts.sys.fileExists')` at
  exit `2`, re-checked 2026-10-01. Publishing is the owner's call. The quick
  start pins TypeScript 5.x before the scan so neither message is reached.
- **Fix:** `load()` now checks `ts.sys == null` on whatever it resolves, right
  after the resolve and before returning it — a capability check, not a
  version-string check, because `sys` is the fact every caller below reads
  (`tsconfigOf`, `program`) and a version number is only a hypothesis about
  it. The message names the version found, the range required, and the
  command to run:
  `jitmax needs TypeScript >=5.0.0 <6, and the "typescript" package resolved
  here is 7.0.2, which has no "sys" host. Install a supported version in this
  project: npm install --save-dev typescript@^5.9`. Verified against three
  states against the fixed checkout: no TypeScript installed (guard fires,
  names 7.0.2), TypeScript 7 installed explicitly (guard fires, names 7.0.2),
  TypeScript 5.9.3 pinned (clean run, exit 0). Test:
  `test/check.test.ts` "a resolved TypeScript with no sys host fails loudly
  at load, naming the version found" — a stub `typescript` package with no
  `sys`, shown failing before the fix.
- **Proposal (not done here):** whether to support TypeScript 7 at all is the
  owner's call, not this fix's — the peerDependency range stays `>=5.0.0 <6`.

## TC-143 — the config file must be named and passed on every run (2026-09-09, proposal)

Other linters discover their config; jitmax does not. Ruff "can be configured
through a `pyproject.toml`, `ruff.toml`, or `.ruff.toml` file" and "supports
hierarchical configuration, such that the 'closest' config file in the directory
hierarchy is used for every individual file", with `--config` to point at one
explicitly (https://docs.astral.sh/ruff/configuration/). ESLint resolves
`eslint.config.js` the same way, upward from the file being linted
(https://eslint.org/docs/latest/use/configure/configuration-files).

`bin/jitmax.ts` takes any argument ending in `.toml`, in any position, and has no
default name and no search. A user who wants rule settings types the path on
every invocation. The documented name was also three different strings —
`megamorphic.toml`, `rules.toml`, `config.toml` — now one, `jitmax.toml`.
The shipped preset lives at `examples/megamorphic/jitmax.toml`: the directory
names the preset, the file carries the name a project uses.

- **Severity:** low
- **Scope:** CLI argument handling
- **Affected:** `bin/jitmax.ts`, `lib/config.ts`
- **Source:** `bin/jitmax.ts:34` — "One .toml and one .cpuprofile are allowed, in any argument position."
- **Status:** proposed (redesign, needs sign-off)
- **Fix:**

Proposed: with no `.toml` argument, search from the working directory upward for
`jitmax.toml` then `.jitmax.toml`, stop at the first hit, and report the file
used. An explicit path still wins. Two questions the owner decides: whether
discovery crossing a repository boundary is acceptable, and whether the found
path belongs in the report header, since a silently applied config changes which
rules fire.

## ✅ FIXED 2026-09-08 — TC-142 — the site and examples guide disagree on survey counts (2026-09-08, fixed)

The site reports five megamorphic-element findings for TypeScript 5.9.3; the
examples guide reports 20 for the same 465 annotated functions. Its 22-codebase
summary says eight sites across 2,953 functions; the guide says 29. The site
also gives 4,140 findings for typescript-eslint 8.67.0 while the guide gives
2,882 for the same 311 annotations. Both describe missing dependencies.
The guide explains the intersection-type change behind its 29-site result,
but the site presents eight as the current count. The browser/manual pass
establishes conflicting reader-facing claims, not which raw run is authoritative.

- **Severity:** medium
- **Scope:** published survey results
- **Affected:** `site/index.html`, `examples/README.md`
- **Source:** `site/index.html:317`, `site/index.html:342`, `site/index.html:375`; `examples/README.md:332`, `examples/README.md:405`
- **Status:** resolved-not-yet-removed; not deployed
- **Fix:** 6d2809e

## ✅ FIXED 2026-09-08 — TC-141 — landing-page ratios and relative dates need outside explanation (2026-09-08, fixed)

The landing page presents benchmark ratios without stating the numerator and
denominator. Some rows explain the direction in words, but the definition is
not on the page. It also calls a number `one day old`, describes figures from
`a week ago`, and says cells are withdrawn `today`, without a visible update
date. A novice walkthrough could not establish their dates or a consistent
ratio interpretation from the page alone. The examples guide defines
before/after; its public link is blocked by TC-133.

- **Severity:** low
- **Scope:** landing-page measurement explanations
- **Affected:** `site/index.html:212`, `site/index.html:401`
- **Source:** `tmp/novice-audit/evidence/04-page-text.txt`; `examples/README.md`
- **Status:** resolved-not-yet-removed; not deployed
- **Fix:** 6d2809e

## ✅ FIXED 2026-09-08 — TC-138 — the back control covers the landing title at narrower widths (2026-09-08, fixed)

The local landing-page preview with the deployed shared stylesheet places the
fixed back control over the title at 1024 and 768 pixels. At 768 pixels it
covers most of `jitmax`; it also covers table content at the captured scroll
position. Document width matches viewport width, so this is overlapping content,
not document-level horizontal overflow. The main reviewer inspected the 768px
screenshot. This is a local preview observation, not a live deployment check.

- **Severity:** medium
- **Scope:** landing-page layout
- **Affected:** `site/index.html`, shared `/pub/krons/assets/hub.css`
- **Source:** `tmp/novice-audit/evidence/10-1024.png`, `10-768.png`, `10-768-table.png`; `site/index.html:32`
- **Status:** resolved-not-yet-removed; not deployed
- **Fix:** 6d2809e

## ✅ FIXED 2026-09-08 — TC-139 — the landing recording has no pause control or visible load error (2026-09-08, fixed)

The recording plays and loops without visible playback controls. Clicking it
while playing leaves `paused:false`. Blocking its MP4 request produces a static
poster, `readyState:0` and `networkState:3`, without visible failure or retry
text. The caption still describes a recording. The browser restored playback
after removing the request block. An unrelated preview-server interruption was
recorded separately and is not evidence for this issue.

- **Severity:** medium
- **Scope:** landing-page recording
- **Affected:** `site/index.html:40`
- **Source:** `tmp/novice-audit/docs/ux-13yo/landing.md`, `tmp/novice-audit/evidence/09-media-block-confirmed.json`
- **Status:** resolved-not-yet-removed; not deployed
- **Fix:** 6d2809e

## ✅ FIXED 2026-09-08 — TC-137 — the config merge example loses a JSON key after the suggested mutation (2026-09-07, fixed)

A user following the `accumulating-spread` finding can choose the mutation
shipped in `examples/radash-assign.after.ts`. It passes jitmax, but it does not
preserve the result for an override with an own `__proto__` key. The spread
version keeps the key and an ordinary prototype. The mutation drops the key
and makes its value the returned object's prototype. An inherited `enabled`
value can then appear where the caller expects only merged configuration.
This reproduction changes the returned object, not the global Object prototype.

Run from the checkout:

```sh
node --input-type=module <<'JS'
import * as before from './examples/radash-assign.before.ts';
import * as after from './examples/radash-assign.after.ts';
const overrides = JSON.parse('{"__proto__":{"enabled":true},"port":8080}');
for (const [name, variant] of Object.entries({ before, after })) {
  const result = variant.assign({}, overrides);
  console.log(name, JSON.stringify(result),
    'own key:', Object.hasOwn(result, '__proto__'),
    'inherited enabled:', result.enabled,
    'plain prototype:', Object.getPrototypeOf(result) === Object.prototype);
}
JS
node bin/jitmax.ts examples/radash-assign.after.ts
```

Observed on Node v22.23.2: before has own key `true`, inherited enabled
`undefined`, plain prototype `true`; after has own key `false`, inherited
enabled `true`, plain prototype `false`. The checker exits 0 and says every
annotated function is clean. The finding's note warns that assignment can
invoke target setters, including `__proto__`, and is not a drop-in spread
replacement. The example's behavior remains unsafe for these inputs.

- **Severity:** high
- **Scope:** suggested rewrite and public success example
- **Affected:** `examples/radash-assign.after.ts`, `accumulating-spread` advice
- **Source:** reproduction above; `examples/config-check.ts` covers ordinary inputs
- **Status:** resolved-not-yet-removed; not deployed
- **Fix:** 1eeab93

## ✅ FIXED 2026-09-08 — TC-135 — receiver tracing follows a throw-only stub (2026-09-01, fixed)

`bb9ebbf` made a method whose whole body is one `throw` a declaration:
`followable` in `lib/scan.ts` refuses it and `isDispatchDecl` reads the site as
dispatch. That predicate is asked on the callee walk only. When the receiver's
origins resolve to one class whose method IS the stub, `flow.receiver()` hands
the stub back as `follow`, `reach` pushes it into `reached` without asking
`followable`, and the run prints "1 interface call resolved to the one
implementation this program builds, and followed" over the stub's `throw`, then
a `closed-world` error on the throw's callee — the TC-106 symptom through the
other door. Reproduced 2026-09-01:

```ts
declare function slotUnimplemented(): Error;
class AbstractSlot { size(): number { throw slotUnimplemented(); } }
class SlotHolder { slot: AbstractSlot = new AbstractSlot(); }
/** @jitmax */
export function slotSize(h: SlotHolder): number { return h.slot.size(); }
```

Two spellings of one predicate — "may the walk step into this body" — and they
disagree. The fix is a sentence before it is a line: refusing the stub on the
flow path leaves a receiver whose one located implementation declares and does
not implement, and no finding says that today.

- **Severity:** low
- **Scope:** walk
- **Affected:** `lib/scan.ts` `reach` (the `one.follow` push), `lib/flow.ts` `methodBody`
- **Source:** the reproduction above, with a visible `slotSize(new SlotHolder())` caller
- **Status:** resolved-not-yet-removed; not deployed
- **Fix:** 44eb0e0 applies `followable` on both paths. The call stays an
  `interface-dispatch` finding; the stub's helper is not reached or counted as followed.

## TC-136 — 689 published rows carry no reading of the machine at all (2026-09-02, open, owner decision)

TC-134 closed the same hole in `select.jl` by re-measuring it. The query that
found it generalises: of 976 rows marked `runner: r2`, **269 carry a per-row
`load1` and `runnable` and 707 do not**. Eighteen of the 707 were select's
frozen rows and are now superseded. The other **689 predate the reading
mechanism entirely** — no `load1`, no `runnable`, no `env` — across ten sweeps:

| file | rows without a reading |
| --- | --- |
| `dispatch.jl` | 240 |
| `strings.jl` | 81 |
| `shape-sets.jl` | 72 |
| `shapes-calibrated.jl` | 72 |
| `chained.jl` | 72 |
| `example.jl` | 48 |
| `delete.jl` | 48 |
| `spread.jl` | 24 |
| `spread-object.jl` | 24 |
| `inline.jl` | 6 |
| `addprop.jl` | 2 |

Protocol rule 9 asks for the environment in every row. These rows do not carry
it, so nothing can show they were inside the gate. That is not the same as
showing they were outside it: `overGate` reports them as unjudgeable, not as
contaminated, and the re-measurement TC-134 ran found the frozen sweep's numbers
correct to the second decimal.

Making `current()` in `lib/derive.ts` ask `hasReading` withdraws all 689 in one
line and takes seven of eight rules' cost figures with them. That is a
re-measurement of ten sweeps, roughly two hours of quiet machine at select's
observed rate, and it is a redesign of what the published corpus is — so it is
recorded here for sign-off rather than shipped. The scoped form is in place: a
citation asks `hasReading` when its sweep has been re-measured, and select's six
do.

- **Severity:** medium
- **Scope:** published evidence
- **Affected:** `lib/derive.ts` `current()`, ten `.jl` files, seven rules' EVIDENCE
- **Source:** query over `bench/*.jl` on 2026-09-02; `hasReading` in `bench/env.ts`
- **Status:** open, owner decision
- **Fix:** re-run the ten sweeps on a quiet machine and move every citation to
  `hasReading`, or state beside the numbers that their rows predate the per-row
  reading. Either is the owner's call; the corpus is not known to be wrong.

## TC-134 — `allocating-select`'s cost line rests on eighteen rows whose machine reading is one frozen number (2026-09-01, fixed 2026-09-02)

TC-24 and TC-47 retired to `.diary/20260901.md` on 2026-09-01 with the cause
closed — `reading()` in `bench/env.ts` refuses to write another such row — and
the eighteen rows still in place. They are every `runner: r2` row of the six
cells `select.jl` publishes, `env.load1: 0.97` stamped across an evening, so
rule 9's per-row claim is unverifiable for the whole of what
`allocating-select` cites. `frozenReading()` and the `FROZEN` register in
`test/check.test.ts` pin the count at eighteen. What left the queue with the
entries is the question the diary says is the owner's: re-measure the six cells
under the current runner, or state beside the number that its rows carry no
per-row reading.

- **Severity:** medium
- **Scope:** published evidence
- **Affected:** `allocating-select` EVIDENCE, `bench/select.jl`, `docs/rules.md`
- **Source:** `frozenReading('.', 'select.jl')` = 18; `.diary/20260901.md`, TC-24 and TC-47
- **Status:** fixed 2026-09-02 — re-measured
- **Fix:** the machine was quieted and `node bench/run.ts select` re-ran all six
  cells, three sweeps each: eighteen new rows, none void, each carrying its own
  `load1` and `runnable`. The six select citations in `lib/derive.ts` now ask
  `hasReading` and read only those, so the frozen eighteen stay in the file as
  history and back no published number.

  The two sweeps agree cell for cell — `select.heap` moved 2.56-2.87x to
  2.60-2.89x — so the rule's claim is unchanged and is now checkable. One cell
  did move: `number` at n=100000 read 0.97, 0.89 and 1.03 and rule 13 withdraws
  it, so the silent clause no longer says the effect "changes sign with the
  working set". It says n=10000 costs 1.10-1.19x under the broad-warning bar and
  n=100000 has no measurement at all.

  The cause fix is in `bench/resume.ts`: `done()` skipped these six cells forever
  because it counted the reading-less rows as finished runs. It now asks
  `hasReading` too, so a cell whose only rows cannot be judged is re-measured
  rather than declared complete. See TC-136 for the same question on the other
  ten sweeps.

## TC-133 — the documented GitHub install has no remote ref to install (2026-08-31, closed)

The package artifact works when packed, installed under `node_modules`, and run
through npx or bunx. The public command is a different boundary:
`bunx github:kronael/jitmax`, the advertised command, asks GitHub for the
repository's HEAD, and the `npx` form asks for the same. On 2026-08-31
`git ls-remote origin HEAD refs/tags/v0.12.1` returned no refs, and
`git ls-remote --heads origin` exited 0 with empty output. A public GitHub search
also found no repository. The README and site called that an immediate install.

The code is ready to publish; the remote is not. This project forbids agent
pushes, so no code change can create the missing ref. Until a human publishes
one, the only working path is an existing checkout or a locally packed tarball.

Fresh user trial, 2026-09-07: `bunx github:kronael/jitmax` exited 1 with
`GET https://codeload.github.com/kronael/jitmax/legacy.tar.gz/ - 404`.
The documented checkout command did run the radash configuration example.

Fresh user trial, 2026-09-08: `bunx github:kronael/jitmax --help` exits 1
with the same codeload 404; `git ls-remote origin HEAD 'refs/heads/*'`
returns no refs. A source archive without `dist/` installs through bunx and
runs with the Bun shebang: help and clean input exit 0, a megamorphic finding
exits 1, and missing input exits 2. This verifies source installation, not
public GitHub access.

**Closed 2026-10-01: the refs exist and the install works.**
`git ls-remote https://github.com/kronael/jitmax` returns `HEAD` and
`refs/heads/main` at `111a3b3` plus every tag from `v0.1.0` to `v0.15.0`.
`codeload.github.com/kronael/jitmax/tar.gz/refs/heads/main` returns HTTP 200,
and in a scratch project with `typescript@^5.9` pinned,
`bunx github:kronael/jitmax --help` exits `0` and the README's sample `hot.ts`
exits `0` reporting `every annotated function is clean.` Nothing in this
repository fixed it — a human published the refs — and the eight doc surfaces
that stated the 404 as a present fact were wrong from that moment until they
were corrected. The dated trials above stay as written: they record what those
runs returned on those days.

One thing the entry's own framing got wrong, worth keeping: "the only working
path is an existing checkout" was a statement about the remote, and it was
published in the voice of a statement about the tool. A blocker outside the
repository still needs re-checking on the schedule of the thing it is blocking
on, and nothing here re-checked it for a month.

- **Severity:** high
- **Scope:** distribution and first contact
- **Affected:** README, site, GitHub install
- **Source:** `git ls-remote https://github.com/kronael/jitmax`;
  `curl -o /dev/null -w '%{http_code}' -L
  https://codeload.github.com/kronael/jitmax/tar.gz/refs/heads/main`
- **Status:** closed 2026-10-01
- **Fix:** the owner published the refs. The false claim is removed from
  `README.md`, `docs/limits.md`, `docs/rules.md`, `ARCHITECTURE.md`,
  `CHANGELOG.md`, `examples/README.md`, `bench/README.md`, `test/README.md`
  and `site/index.html`.

## TC-132 — profile mode treats dependency time as stale project code (2026-08-31, proposed)

Profiling jitmax while it checked Valibot, then giving that profile back to
jitmax, produced 375 unmatched frames at a 0.05% threshold. Most are the
TypeScript compiler in `node_modules/typescript/lib/typescript.js`. The report
calls all of them source positions that a transform moved or a stale profile
left behind. Neither diagnosis fits: the profile is current and those frames
belong to a dependency this run was never asked to check.

The result is 305 lines for 11 project functions and 46 errors. At the default
1% threshold no frame survives and the useful project code reads as zero hot
functions. This is the real-use form of TC-102: the threshold uses total process
self time, while the user asks which functions are hot inside the program under
review.

**Proposal:** port frames through source maps first, partition them into program,
dependency, and runtime time, and apply `min_self_pct` to program-owned self
time. Report the other two shares once; do not list dependency frames as stale.
An unrelated profile with zero program time must still fail as unchecked.

- **Severity:** high
- **Scope:** profile selection and report
- **Affected:** `lib/profile.ts`, `bin/jitmax.ts`, `lib/report.ts`
- **Source:** `tmp/eval/profile-005-v012.log`
- **Status:** proposed (redesign, needs sign-off)
- **Fix:**

## ✅ FIXED 2026-09-09 — TC-128 — the key-order false negative is invisible at the CLI (2026-08-31, fixed)

Found by an adversarial audit today. `megamorphic-elements` records this gap
honestly in its own `unreported` clause — and only in source. Nothing prints it,
so the terminal user is told "every annotated function is clean" over an axis
this tool has never checked.

```ts
/** @jitmax */
export function sumKeyOrder(rows: Array<{ x: number; y: number }>): number {
  let s = 0; for (const r of rows) s += r.x + r.y; return s;
}
export function build() { return [{x:1,y:2},{y:3,x:4},{x:5,y:6},{y:7,x:8},{x:9,y:10}]; }
```

`jitmax — 2 annotated functions, 0 errors`, `every annotated function is
clean.`, exit 0.

**What that program actually builds, checked here rather than asserted:**
`%HaveSameMap` over those five literals answers **2 distinct maps**, not five —
`{x,y}` and `{y,x}`, three of one and two of the other. Two maps is inside V8's
four-map budget, which is where this rule's own `silent` clause puts
`0.95-1.47x` and where it deliberately says nothing. Five key ORDERS of one key
set is the program that crosses the cliff, and it is just as silent:

```ts
/** @jitmax */
export function sumFiveOrders(rows: Array<{ a: number; b: number; c: number }>): number {
  let s = 0; for (const r of rows) s += r.a + r.b + r.c; return s;
}
export function buildFive() {
  return [{a:1,b:2,c:3}, {a:1,c:3,b:2}, {b:2,a:1,c:3}, {b:2,c:3,a:1}, {c:3,a:1,b:2}];
}
```

`%HaveSameMap`: **5 distinct maps** at one load site. `jitmax — 2
annotated functions, 0 errors`, exit 0. bench/shapes-calibrated.jl measures that
exact program at **4.4-11.5x on reads** — the same order as the case the rule
DOES report.

**This is not a detector bug.** Key order is not part of a TypeScript type, so
nothing static separates those five builders from five that agree, and the rule
misses it rather than guessing — which is the right call and is written down in
`EVIDENCE.unreported`. The defect is that `unreported` has no reader: `lib/
report.ts` prints `cost`-derived sweep names, the `silent` clause reaches
README, and `unreported` reaches neither the terminal nor the exit code. A user
who never opens `lib/rules/megamorphic-elements.ts` learns nothing about an
unchecked axis with a measured 4.4-11.5x behind it.

**Fixed 2026-09-09 in `76ded7b` as (a), narrowed to clean runs.** The entry's
own argument against (a) is that an unconditional line becomes noise; the
false negative it is about only exists on a run with no findings, so the note
prints there and nowhere else. It names the four rules that carry an
`unreported` clause and costs four lines; `-v` prints each clause in full.
A test writes the five-key-order program, asserts the clean exit still says
clean, and asserts the axis is named. The three shapes considered:

- (a) a per-run coverage line, like the platform and lowered counters:
  `N property reads off array elements were checked for key SETS only — key
  order is not in a TypeScript type (4.4-11.5x, bench/shapes-calibrated.jl)`.
  Cheap, and it appears on runs where nothing is wrong, which is where a
  coverage note belongs and also where it becomes noise.
- (b) `unreported` printed under the finding whose rule carries it, the way
  `known defect:` already is. Reaches only runs that already have that finding,
  which is precisely the wrong population: the false negative is a CLEAN run.
- (c) a `--coverage` mode that prints every rule's `silent` and `unreported`
  clause and checks nothing. Honest, and nobody runs it.

(a) is the only one that reaches the user this entry is about, and the argument
against it is the argument against every unconditional line: the report already
prints four counters, and a fifth that fires on every run with an array read in
it may be the line that makes people stop reading the others.

## ✅ FIXED 2026-08-31 — TC-102 — a profile whose sampled time is all `node:` builtins passes the gate clean (2026-08-30)

Profile mode calls a run clean when the profiled workload never ran. `hotFrames`
keeps a frame only if its url starts with `file://` (`lib/profile.ts:74`). The
comment there names the engine's own frames — `(garbage collector)`,
`(program)`, `(idle)` — real time with no source line. The same test also drops
every `node:internal/...` frame, and that is where all the time goes when a
workload throws while loading modules. No frame survives, so there are zero
marks AND zero unmatched frames, and the report has nothing to say:

```
$ node --cpu-prof --cpu-prof-dir=. wl.mjs      # throws on line 3
$ node bin/jitmax.ts CPU.20260830.054406.5.0.001.cpuprofile src
jitmax - 0 hot functions, 0 errors

  every hot function is clean.
  0 hot functions from CPU.20260830.054406.5.0.001.cpuprofile at or above 1% self time
$ echo $?
0
```

Verified on yjs. That profile holds 65 samples and its hottest frames are
`compileSourceTextModule` (13.8%), `get exports` (13.8%), `(garbage collector)`
(9.2%) and `getPackageScopeConfig` (4.6%) — 100% node internals, no yjs code at
all, because the workload threw on its third line.

The contrast case works correctly. A profile of an unrelated USER file, fed
against pixi.js, prints `1 hot frame matched no function in this program ... This
is not a clean run` and exits 1. The only difference is that the frame's url is
a `file://`.

This is TC-89's failure arriving through a different door. TC-89 closed "three
of four frames missing prints clean and exits 0"; this is "every frame dropped
before it is counted", so the unmatched channel TC-89 built never sees them. A
gate wired to profile mode goes green when the workload it profiled crashed at
startup.

- **Severity:** high
- **Scope:** profile mode
- **Affected:** `lib/profile.ts` `hotFrames`
- **Source:** `lib/profile.ts:74`
- **Status:** resolved-not-yet-removed
- **Fix:** `d83fc9c`, `932f1b9`

Proposal: count what the filter drops. A profile whose surviving `file://` self
time is a small fraction of its total sampled time has not measured this
program, and that is the blindness `unresolved` already names — exit 1 with the
reason, never `every hot function is clean`. `(garbage collector)` and
`(program)` stay out of the numerator. `node:` frames are real measured time
this tool cannot report on, which is exactly what makes them the evidence.

Second half, one line. `README.md:110` still says "A profile that matches no
function in the program is exit `2`". TC-89 deliberately replaced that with exit
1, and `bin/jitmax.ts` says so in a comment. An unrelated profile against
pixi.js exits 1. TC-89's documentation pass fixed the exit-code section and
missed this sentence.

Fixed in two parts. `d83fc9c` made every zero-function run exit 1 and stopped
the clean verdict. `932f1b9` tells the user to confirm that the workload reached
their code or lower `min_self_pct`; its runtime-only profile test holds both the
message and exit code. TC-132 records the separate redesign needed to partition
project, dependency, and runtime time.

## TC-104 — megamorphism is modelled as a TypeScript union, and nobody writes polymorphism that way (2026-08-30, open)

`objectShapes` is the shape counter both megamorphic rules read
(`lib/rules/shared.ts:200`):

```ts
export const objectShapes = (ts, checker, t: TS.Type): number =>
  t.isUnion() ? new Set(...).size : 0;
```

A type that is not a union answers **0**, which is under every threshold. So an
abstract class with twenty subclasses, an interface with twenty implementations
and a plain object type all count as zero shapes, and the rule that exists to
find a load site over five or more maps can only see a hand-written
`A | B | C | D | E`.

Fifteen lines, one run, both halves:

```ts
// a.ts
abstract class Base { abstract kind(): number; }
class K1 extends Base { a = 1; kind() { return this.a; } }
// ... K2..K6, each with its own field

/** @jitmax */
export function sumClasses(rows: Base[]): number {
  let s = 0;
  for (const r of rows) s += r.kind();
  return s;
}
export const all: Base[] = [new K1(), new K2(), new K3(), new K4(), new K5(), new K6()];

// b.ts
type U = A | B | C | D | E | F;      // six object types, one field each

/** @jitmax */
export function sumUnion(rows: U[]): number {
  let s = 0;
  for (const r of rows) s += (r as A).kind;
  return s;
}
```

```
jitmax - 2 annotated functions, 1 error, 1 warning
  a.ts:10  sumClasses()   warn   interface-dispatch
  b.ts:6   sumUnion()     error  megamorphic-elements
```

Six classes with a virtual call in a loop, and an array in the same file holding
one of each, exits **0**. Six type aliases in a union with one property read
fails the build. V8 charges the classes at least as much — six maps and six
prototypes rather than six maps — and jitmax passes them.

The warning it does print says "the receiver has an unknown origin (no visible
caller of sumClasses — its arguments come from outside this program)". That is
true of the dataflow walk and says nothing about the six subclasses declared
eleven lines above it.

This is the defect behind TC-64's headline zero. `megamorphic-elements` fired 0
times across 30 corpora and 29 times on one (effect), and effect is a codebase
whose AST is written as a literal `_tag` union. It is not that the pattern is
rare in real code; it is that the rule can only see one spelling of it.

It is also the answer to the owner's own hypothesis, recorded in TC-67: real
programs "do some crazy interfaces". They do, and this is the rule that was
supposed to catch them.

- **Severity:** high
- **Scope:** rules
- **Affected:** `megamorphic-elements`, `megamorphic-dispatch`
- **Source:** `lib/rules/shared.ts:200`; repro above
- **Status:** open
- **Fix:**

Proposal, needs sign-off because it changes what the flagship rules trigger on:
count shapes from the same place `lib/flow.ts` already counts implementations —
the allocation sites that reach the value — rather than from the declared type's
union members. A union type keeps its current answer as one source among
several. `subclassesOf` already walks `extends` edges; the missing half is
counting them as element shapes rather than only as call targets.

## TC-107 — code that runs once per process is priced as if it ran per call, and that is most of the error tier (2026-08-30, open)

The walk follows a call edge and never asks how often the edge is taken. A body
reached only from a module-load initializer, a constructor's one-time setup, or
a CLI entry point is checked with the same rules and the same `error` severity
as a body in a per-element loop.

The clearest instance is arrow. `src/vector.ts:370-394` is an IIFE:

```ts
protected static [Symbol.toStringTag] = ((proto: Vector) => {
    ...
    const typeIds: Type[] = Object.keys(Type).map((T: any) => Type[T] as any).filter(...)
    return 'Vector';
})(Vector.prototype);
```

It runs once, at module load, over the ~20 names of an enum. jitmax reports:

```
src/visitor/iterator.ts:104  vectorIterator()
  error  chained-allocation
    src/vector.ts:375 - reached by 30 annotated functions
```

An `error` that fails the build, charged to 30 annotated functions, for a
20-element array allocated once per process.

Judged by inspection across four fresh corpora, this class is the dominant
cause of an error nobody would act on:

| corpus | errors | reached only from once-per-process code |
| --- | --- | --- |
| arrow-js | 8 | 2 — the IIFE above, `bin/cli.ts:57` |
| pixi.js | 14 | 8 — `autoDetectRenderer.ts:164-166` at application start, four shader-compile paths, a test-only `uid` reset |
| mathjs | 10 | 6 — `import.js:164-211` runs once per factory at `create.js:225`; `snapshot.js:293` is test-only |
| chevrotain | 6 | 6 — every site sits under a `TRACE_INIT` block in a `Lexer` or `Parser` constructor |

The two independent judges put the combined error tier at 4 TRUE, 3 FALSE and 15
UNACTIONABLE for arrow+pixi, and 3 TRUE of 24 for mathjs+yjs+chevrotain.

The contrast is what makes this worth fixing rather than documenting. pixi's
genuinely hot per-frame dispatch loop IS found — `src/scene/container/utils/executeInstructions.ts:20`, `(renderer[instruction.renderPipeId] as
InstructionPipe<any>).execute(instruction)` inside
`for (let i = 0; i < instructionSet.instructionSize; i++)`, 20 property sets
against a four-map budget. It is a `warn`, one of 239. Every one of the 14
errors is cold. The gate is inverted: it fails on startup code and passes on the
render loop.

- **Severity:** high
- **Scope:** walk, severity model
- **Affected:** all rules
- **Source:** `n_arrow-js/src/vector.ts:370`; `r_arrow.log`; `r_pixijs.log`
- **Status:** open
- **Fix:**

Proposal, needs sign-off: the walk already knows the edge it took. A body
reachable from the annotated root ONLY through a static/field initializer, a
constructor, or a module-level statement has no per-call frequency and cannot
carry an `error` — report it as a `warn` naming the once-per-process path, or
not at all. This is the static half of what TC-57's profile mode does by
measurement, and unlike static hotness inference it is a soundness question the
walk can answer: not "is this hot" but "can this run more than once per
process".

## TC-122 — three deletes on one object are three build-failing errors for one demotion (2026-08-30, open)

luxon's `impl/conversions.js:134-136` deletes `localWeekday`, `localWeekNumber`
and `localWeekYear` from the same object on three consecutive lines, and
`delete-property` reports three errors. Only the FIRST transitions the map;
after it the object is already in dictionary mode and the next two delete out of
a dictionary, which is not what `bench/delete.jl` measured — that sweep deletes
one property from a four-key literal and then reads.

The rule has no notion of an object already demoted. The fix is per-object
state across the walk, which is a new contract, so it is recorded.

## TC-120 — the finding names as its evidence a sweep its own rule disclaims (2026-08-30, open)

`lib/report.ts:215` scrapes every `bench/*.jl` out of `evidence.source` with a
regex, so every `megamorphic-elements` finding prints "measured in
bench/shape-sets.jl and bench/shapes-calibrated.jl" — while the rule's own
`source` says shapes-calibrated.jl "priced a program this rule is silent on
(BUGS TC-42)" and its `unreported` calls that sweep "what it misses". A reader
is pointed at a sweep the rule's own evidence disclaims.

This is TC-33's defect reintroduced by a regex: the citation is derived from
prose rather than declared. The fix is a declared field on `Evidence`, which is
cross-cutting, so it is recorded rather than bundled.

## TC-117 — chained-allocation fires on stage pairs and shapes no cell measured (2026-08-30, open, proposal)

`chained-allocation` fires at 52 distinct sites across 12 codebases and
`severity: 'error'`, so all 52 fail a build. Four conditions its benchmark
establishes and the detector does not check.

**Stage pairs.** `CHAINABLE` holds six names, so the detector matches 36 ordered
pairs plus `Object.entries → *`. Two pairs were measured. **30 of the 52 sites
are on pairs no cell ran**, including `.concat().concat()` in just's
`collection-diff` and `.flatMap().flat()` in typescript-eslint.

**The n gate quotes a different program.** `CHAINED_MIN_N` derives `minn` over
ALL `mode==='incl'` rows and comes out 1000 — a value set by the `entriesmap`,
`keysmap`, `chainedsort` and `splitjoin` cells. After rule 13 withdrew the
n=1000 map-then-filter cell (TC-37) no surviving `map→filter` cell exists below
n=100000, so a `.map().filter()` chain passes a threshold no `.map().filter()`
measurement set.

**Construction against read.** The cost exists only in `incl`; the `excl` cells
measured 0.95-1.10x. Nothing asks whether the array is built once and read many
times.

**The fusion has to be legal.** Six of the eleven `Object.entries().map()` sites
are `await Promise.all(Object.entries(o).map(async …))` — valibot's `*Async`
schemas, `getDefaultsAsync`, `getFallbacksAsync`. The intermediate array holds
promises and the measured rewrite is a synchronous `for-in` walk, so "do the
stages in one pass" serialises what `Promise.all` runs together. That is not a
mis-sized number; it is a fix that changes what the program does.

Narrowing to measured pairs takes 52 to 22. Both that and the `Promise.all`
exclusion are redesigns — new contract, changed control flow, 30 findings
removed — so they are recorded here rather than shipped.

## TC-95 — two false negatives the shape rules cannot see (2026-08-29, open)

`objectShapes` keeps only `TypeFlags.Object` members, and a branded type
`T & {__tag?: K}` is an Intersection. Five branded object types behind one
receiver — the exact 3.4-11.3x program `bench/shape-sets.jl` measures — count
zero shapes and report clean. `getPropertiesOfType` already resolves an
intersection, so accepting Intersection members is the whole fix.

`arrayParams` inspects PARAMETER declarations only, so the union array has to
arrive as an argument. `const rows = [...as, ...bs, ...cs, ...ds, ...es]`
followed by a loop read is the same maps at the same load site and reports
clean. `megamorphic-dispatch` covers calls on locals; `megamorphic-elements`
has no local story at all. This one is real work — locals and dataflow — and is
recorded rather than proposed.

Also confirmed and worth stating plainly: `bench/shape-sets.ts`'s own kernel,
pasted into a file with its own `Row` type, comes back clean. The rule is
silent on the source program of its own benchmark.

## TC-88 — twenty of seventy-three citations are exact twins (2026-08-29, open, proposal)

`lib/derive.ts` is 983 lines, 556 of them citation literals. Ten pairs differ
only in `agg` — one rendering `range` and its twin `cispan` over byte-identical
predicates (`spread.concat`/`.ci`, `chained.mapfilter`/`.ci`,
`chained.entries.n1000`/`.ci`, `.n10000`/`.ci`, `chained.silent.sort`/`.ci`,
`spread.silent.strings.incl`/`.ci`, `select.silent.number`/`.ci`,
`delete.silent.undef.reads`/`.ci`, plus `inline.reads`/`inline.cells` and
`delete.rows`/`delete.rows.sizes`).

Letting one citation declare several aggregations (`agg: ['range','cispan']` →
keys `k` and `k.ci`) removes about 70 lines and the class of defect where a
twin's `pick` is edited and its partner is not. No other duplication in
`derive.ts` is worth touching: `replicating`, `unreplicable`, `overGate` and
`render` each have one caller-facing job and no second copy.

## TC-50 — the two rules with evidence are already shipped, on no evidence (2026-08-19, open, owner decision)

Not a defect. A commercial finding that changes what this project is for, and
the owner has to decide it.

- **oxlint** ships `no-accumulating-spread` in its `perf` category (13.5M
  downloads/week). **Biome** ships `noAccumulatingSpread` AND `noDelete` in
  `performance` (11.3M/week). Those are this project's `accumulating-spread` and
  `delete-property` — the two rules with a real end-to-end result.
- Neither incumbent measured anything. oxlint's rule cites a blog post and says
  "this can lead to O(n²)". Biome justifies `noDelete`'s V8 claim by citing a
  **WebKit** blog post.
- The five rules unique to jitmax are the five with no confirmed true
  positive in 850 real functions (TC-18, TC-19, and the survey table in README).
- `@e18e/deopt` entered the space 2026-06-24 and is runtime rather than static.
  Every older static tool in the category is dormant: `deoptigate` 2022,
  `v8-deopt-viewer` 2023, Deopt Explorer 2023, `eslint-plugin-perf-standard`
  2016.

**The reviewer's conclusion, and it is worth the entry:** as a linter there is
little here that is not already installed 24 million times a week. What is here
and nowhere else is `bench/*.jl` — paired-process timings, bootstrap intervals,
three-way replication, published refutations — and 14 V8 citations verified
against a pinned checkout. The proposal is to publish the measurements as the
artifact and offer them to the rules that ship without any.

**Blocked by the licence, and that is the operative point.** GPL-2.0-only is
incompatible with Apache-2.0 (oxlint, Biome, TypeScript) and, being `-only`,
carries no GPLv3 upgrade path. No incumbent can take the evidence while the
repo is licensed this way. Running jitmax over proprietary source imposes
nothing — the GNU FAQ is explicit that a program's output is not covered — but
the tool copies literal `fix:` prose into that output, which is the shape the
FSF's Bison exception exists for. A one-line output exception costs nothing.

**The name half is settled; the licence half is not.** Under the old name the
npm package `turbocharge` was taken, npm's dispute policy refuses transfers on
demand, bare "turbo" returned 3,991 packages, and Vercel claims **Turbo** as a
brand. The project is now `jitmax`, and `registry.npmjs.org/jitmax` returns 404
— the name is free. The relicensing decision above is unchanged and still the
owner's.

## TC-67 — split-construction: the owner's "crazy interfaces", measured at 7.3x (2026-08-28, open, proposal)

The owner's challenge was that real code deoptimizes through messy interfaces
rather than through textbook patterns. Probed on V8 12.4.254.21, it is right.

One TypeScript interface with optional properties, built by five ordinary code
paths — a full literal, a partial literal, a literal plus a conditional
assignment, the same keys in a different ORDER, and one with `undefined`
assigned — produces **five distinct V8 maps**. `%HaveSameMap` is false across
every pair but one. A hot load over the mixture costs **102 ms against 14 ms**
monomorphic, **7.3x**.

**It emits no deopt at all.** The code stays TurboFan-optimized and pays a
megamorphic IC silently, every call, forever. `--trace-deopt` shows nothing, so
the flags already used in `bench/` cannot see this; `--trace-ic` can. A tool
looking for deopts would miss the single largest effect found in this
investigation.

**Prevalence is measured too, in TC-65:** 480 of 2030 object types across seven
corpora carry three or more optional properties, and there are 394 conditional
field assignments and 75 conditional spreads. This is the mechanism behind those
counts.

**The trigger does NOT repeat TC-2.** TC-2's defect is counting union members as
if they were maps, which they are not. Here the count is over object LITERALS
assignable to one named type, and a literal's key list and key order genuinely
determine its map. Counting literal shapes counts maps.

**Trigger:** two or more object literals assignable to the same named type whose
key SETS or key ORDER differ, where a value of that type reaches a property
access inside the annotated tree. **Silence:** builders with identical key lists
in identical order; a single construction site.

**And the fix is real and map-level, which is unusual for this project.**
`{id, a, b: undefined}` shares the map of `{id, a, b: 1}` exactly — proven, not
inferred. So "give every path the same keys, using `undefined` for the ones it
lacks" is a rewrite that provably merges the maps, not a trade-off. Contrast
`accumulating-spread`, whose fix line has to hedge.

Raised 2026-08-28 from a probe run, on the owner's hypothesis.

## TC-66 — megamorphic-store is unpriced and unruled, and its cliff is steeper than the load's (2026-08-28, open, proposal)

The tool has no rule for a property WRITE on a megamorphic receiver. Its own
code already concedes the gap — `lib/rules.ts` narrows `megamorphic-elements` to
a read because "a body whose only contact with the element is `r.x = v` pays a
StoreIC that nothing in bench/shape-sets.jl priced".

**Now priced.** Probed on V8 12.4.254.21, a named store on a receiver reached as
N maps:

    maps:      1      2      4      5      8
    store:  19ms   18ms   20ms  181ms  179ms
    load:   15ms      -      -   93ms      -

The cliff is at exactly five, the same four-map budget the shipped rules use,
and the store cliff is about **twice as steep as the load cliff** — 9.5x against
6.2x in the same run. No deopt line appears; the only `--trace-deopt` output in
the whole store probe was `reason: code dependencies`, from map deprecation.

**Trigger:** the machinery `megamorphic-elements` already has, pointed at a
write — `r.x = v` or `r.x += v` off an element of an array whose element type
reaches five or more distinct property sets. **Silence:** below five; array
receivers, because elements kinds are a different mechanism and TC-36 already
took them out of another rule; and everything TC-2 forces every map-counting
rule here to concede.

This is the cheapest new rule on the queue: the analysis exists, only the
predicate and a `bench/store-sets.jl` sweep are missing.

Raised 2026-08-28.

**Shipped 2026-08-28 in 6cd8ff6, the profile half exactly as proposed.**
`jitmax run.cpuprofile src` reads V8's own profile, aggregates self time per
frame from `samples` and `timeDeltas`, and marks every function at or above
`[profile] min_self_pct`. `reach()`, `check()` and `render()` are untouched and
cannot tell a profiled mark from an annotated one. Static hotness inference did
not ship, and is recorded here as refused rather than deferred.

One thing the design did not predict: V8 reports a function's position as its
parameter list's `(`, not the `function` keyword, so every arrow matched and
every function declaration did not. The index now carries both positions.

Still open from this entry: the `suggest` mode for the writing consumer, and
`min_self_pct` remains a constant nobody has measured — it is printed on every
run and the TOML owns it, which is the disclosure and not the fix.

## TC-78 — the real cost in a hot loop was per-call closure churn, and no rule sees it (2026-08-29, open, proposal)

From the `dinero.js` trial (TC-75). The user had a concrete complaint — repeated
`add()` is slow — and measured it: **271.6 ms for 300,000 `add()` calls against
14.5 ms for `acc += 1`, about 19x**, with **13.6% of profile samples in GC**.

**jitmax fired no rule on that path.** Zero errors. Seven `closed-world`
warnings and nothing else. The two errors in the repository are on unrelated
functions not reachable from `add`.

Reading those seven lines by hand found the cause: `add()` calls
`safeAdd(calculator)` fresh on every invocation, which builds `normalizeFn` and
`addFn` from scratch, which build `maximumFn`, `convertScaleFn` and `equalFn` in
turn; `haveSameCurrency` spreads its arguments and builds its own closures.
Roughly **ten throwaway closures allocated per call**, plus an array spread and a
`map`/`reduce`, none cached, although `calculator` is a fixed singleton.

That is allocation churn, not a shape problem, and it is what the GC share
measures. Every rule here prices a V8 fast-path exit; none prices allocating the
same closures on every call of a hot function.

**Why this entry matters more than its size suggests.** The user's verdict was
that the tool "was just a map of where to look" — the `closed-world` list named
the five right files, and a human did the rest. That is a real outcome and worth
having, but it is not what the README promises.

**Proposal:** measure it before writing any rule, per TC-53. A
`bench/closures.jl` sweep pricing a factory called per iteration against a
hoisted equivalent, at each working set, with the GC share recorded. If it
separates, the trigger is narrow and syntactic: a call inside an annotated
function to a local factory that returns a closure, where nothing in the
arguments varies across calls. If it does not separate, publish the null.

Found 2026-08-29 in the TC-75 trial.

## TC-75 — first-contact trial: three users, README only, no other help (2026-08-29, open, data)

User command trial, 2026-09-07: the radash configuration walkthrough in
`examples/README.md` completes from the checkout. `node bin/jitmax.ts --help`
exits 0 and explains annotations, config, profiles and exit codes. Syntax
errors name the compiler diagnostic and file:line:column. Findings distinguish
static evidence from workload costs; megamorphic reads name their source site.
The ordinary caller inputs passed; a JSON-key result failed as recorded in
TC-137. Public installation still failed as recorded in TC-133.

Three engineers were given a codebase, the tool, and its README, and nothing
else — no BUGS.md, no diary, no notes. They were told to make the code faster
and to report what happened. Corpora: `date-fns` core, `dinero.js`, and one
application backend. Both completed trials found the tool honest and neither
would put it in CI as a gate.

**What worked.** `date-fns` found a real defect and shipped a real fix:
`setDefaultOptions/index.ts:68` deletes a property from the process-wide default
options object that roughly fifteen hot functions read on every call — a rare
write followed by permanent frequent reads, exactly the shape `delete-property`
is for. The user verified the call graph themselves, changed it to assign
`undefined`, and the finding cleared. Both users independently praised the
honesty of the output: labelled ratios, named `known defect` lines, suppression
that reports itself. One wrote that it is "honest about its own limits more than
any perf tool I've read docs for".

**Four problems in the first thirty minutes, from users with no context:**

1. **The vendored corpora ship pre-annotated, and both users tripped on it.**
   `tmp/lib-datefns` carries 27 `@jitmax` tags and `tmp/lib-dinero` carries 20,
   left from this project's own survey. A user who copies one and marks the
   function they care about gets a report about twenty functions they did not
   choose, and has to `grep -rn @jitmax` to work out why. One called the run
   "polluted". These are fixtures; ship them stripped, or say in the README that
   they are annotated.
2. **The README is not a quickstart.** Usage is complete within about thirty
   lines; the remaining eight hundred are the evidence appendix. One user:
   "useful for trust, bad for how do I run this". The material is the project's
   best asset and it is in front of the instructions.
3. **No way to scope a run to one function.** With a concrete question about one
   function, a user had to hand-grep a 950-line report for its block.
4. **Exit 1 conflates "found something" with "could not check everything".**
   Documented, and still means a repository with unresolved imports can never
   pass a naive gate whatever its code looks like.

**Both verdicts, in their own shape:** keep it as a manual check per release;
do not gate CI on it yet. The `date-fns` user's reason is the sharper one — two
of their three errors needed a human to know the input size before deciding they
mattered, and both ended as permanent suppression comments rather than code
changes (TC-54). A gate that forces that trade on every bounded helper "will get
spammed with permanent suppressions or silenced entirely inside a month".

**One claim in the README does not match the source.** The rule-by-rule table
says `allocating-select`'s findings are "`date = addMinutes(date, step)` in four
date-fns functions". Grepping the vendored `date-fns` for that shape finds
**two** — `eachMinuteOfInterval` and `eachQuarterOfInterval` — and only one of
them is `addMinutes`. The count is small and the point the sentence makes still
stands; a published number that does not reproduce does not, in a project whose
whole claim is that its numbers reproduce.

**Third trial, an application backend (Immich, 554 files), completed
2026-08-29.** It never obtained a gate-able run at all. Immich's
`tsconfig.json` maps `"src/*": ["./src/*"]` and **487 of its 554 files** import
that way, so the walk stops at the first hop across almost the whole codebase
(TC-32). The user proved it was resolution rather than logic by hand-editing one
import to a relative path, after which the finding appeared cleanly — good
diagnosis, and one the tool should not have required.

Its four findings were all correct pattern matches on code that is not CPU-bound:
an object built once and sent to Postgres, `mediaTags` from an `exiftool`
subprocess, and a `.filter().map()` over a handful of faces per photo. The user's
verdict — "correctly-detected patterns on code that is not CPU-bound where it
matters ... jitmax cannot see that" — is the annotation problem from the other
side. This user annotated honestly: `handleMetadataExtraction` IS the per-photo
job. It is still dominated by I/O. Hotness in calls-per-second does not imply the
CPU is where the time goes, and the annotation cannot express the difference.

Raised 2026-08-29.

## TC-74 — the load gate samples once per cell, and a cell can finish on a busy machine (2026-08-29, open)

Protocol rule 9 refuses to start a cell above `nproc - 1` runnable threads. It
checks BEFORE the cell. A cell is forty processes and takes minutes, and nothing
re-reads the machine while it runs — so a cell that starts on an idle box can
finish on a loaded one, and the row is written and kept.

**Caught by the project's own instrumentation, which is the good news.** Every
row records `runnable` as the row is WRITTEN, which is after the measurement.
The 2026-08-29 sweeps of `arguments` and `sparse` were run in a resume loop on a
machine that also carried another tenant at 94% of one core, a second Claude
session, and this session's own test runs:

    arguments   27 rows, 7 with runnable <= 1   {1:7, 2:6, 3:4, 4:3, 5:2, 6:3, 7:2}
    sparse      36 rows, 15 with runnable <= 1  {1:15, 2:9, 3:6, 4:2, 5:2, 8:1, 12:1}

**41 of 63 rows were measured on a machine the gate would have refused.** One
sparse row records `runnable = 12` on a two-core box. Both files are moved to
`-busy` and are history, not evidence. Nothing is published from them.

**It bears on TC-46 from a second direction.** That entry is about a gate
reading the wrong NUMBER. This is the same gate reading the right number at the
wrong TIME, and the 592 registered rows are the accumulated result: every one is
a row some cell finished over its gate. They are registered and withdrawn
nowhere, which TC-46 already says.

**Correction to the first draft of this entry: keeping an over-gate row is
deliberate, not an oversight.** `bench/run.js` reads `runnable` as the row is
written, prints `OVER GATE`, and keeps the row — rule 10 reports failures in the
same format as wins — and `test/check.test.ts` holds a per-file register that
fails the build on any NEW unaccounted over-gate row. The machinery is
consistent and it did its job here: the two sweeps are `-busy`, are outside
`SWEPT`, and publish nothing.

**What is actually missing is a check DURING the cell.** The register catches
contamination at build time, which is hours after the measurement was wasted,
and the runner will happily spend a whole sweep producing rows it knows are
over the gate. `--wait-load` exists but only gates the START.

**Proposal:** re-read `runnable` after the cell, and when it is above the gate,
write the row with `void: true` and a reason. `lib/derive.ts` already excludes
`void` rows, so contamination becomes self-excluding instead of depending on a
hand-maintained register; rule 3 already has the vocabulary for a cell that is
void rather than slow. The runner should also stop the sweep at that point, the
way it stops when the start gate refuses, so a busy machine costs one cell and
not a night.

Found 2026-08-29, checking the environment on fresh rows before publishing them.

**2026-09-01 — re-verified; the per-cell and between-sweep gates are now pinned
by tests.** `fc17332` moved resume's in-gate rule — a row counts only when it
is within its own gate — into `bench/resume.ts` and tests it directly, which is
TC-91's half of this gap. `d8884b2` and `c0c9e62` gave every row its own
reading instead of the sweep's, and named a raised gate explicitly, so what a
row ran under is checked rather than merely recorded. The proposal above —
re-reading `runnable` and voiding a cell DURING the measurement, not after —
is still open.

## TC-73 — README prose can quote a ratio no data supports (2026-08-29, open, proposal)

`site/index.html` is held to "every ratio on this page must BE a value in the
derived table". README is not: its test asserts only that the prose CONTAINS
each `readme: true` value. So a sentence can be built around derived numbers and
still say something false — which is exactly how the Honest-limits bullet fixed
in 7a254ed survived, contradicting a paragraph 480 lines above it.

Measured 2026-08-29: **53 ratios in README prose, 31 of them not derived values.**

The page's rule cannot simply be copied here, and that is the point of this
entry. README narrates history, and most of the 31 are legitimately not in the
current table: superseded numbers quoted as superseded (`4.42-4.79x`,
`3.21-4.95x`, `6.48-7.51x`), withdrawn rules (`0.96-1.08x` and `1.39-1.66x` for
`boxed-elements`, `1.21-1.34x` for the property-add refutation), sweeps that
ship no rule (`6.17-6.34x`, TC-12), and round figures in ordinary prose (`2x`,
`5x`, `8x`, `200x`). A blanket assertion would fail on honest history.

**Proposal:** an explicit register in the test — every non-derived ratio listed
with a one-line reason, the way `OVER_GATE` and `DEFECT` already work here. The
31 become visible and pinned, and a NEW typed ratio fails the build. Doing it
properly means reading all 31 in context and confirming each is history rather
than a live wrong claim, which is the work, not the test.

Found 2026-08-29 by a commissioned CTO review, which also found the one live
false sentence this gap was hiding.

## TC-126 — the builtin list should be derived from V8, not written by hand (2026-08-29, open, proposal)

Following TC-69's first cause. The owner's proposal is a list of acceptable and
unacceptable builtins, so the tool can discern between them instead of silencing
all of them. The list is a good idea and it must not be hand-written: a
hand-written performance list is exactly what TC-50 charges oxlint and Biome
with shipping.

**It is already derivable from the checkout in this repository.**
`v8src/src/compiler/js-call-reducer.cc` carries a `case Builtin::k…` for every
builtin TurboFan lowers to inline code — **168 of them** in the pinned tree.
`make v8-check` already re-reads quoted V8 lines against that checkout, so the
same machinery can re-derive this list and fail when it drifts.

**But read it for what it says.** Lowering describes the CALL BOUNDARY, not the
work. Sampling the pinned tree:

    LOWERED   Array.prototype.sort        MathMax   Array.prototype.push
    LOWERED   RegExp.prototype.test
    not       JSON.parse    JSON.stringify    Object.keys    Object.assign
    not       String.prototype.split        RegExp.prototype.exec

`Array.prototype.sort` is lowered and is still O(n log n) with a comparator
call per comparison. So the list cannot be used as a fast-versus-slow
classifier; doing that would be the folklore mistake in new clothes. It answers
one question only: is there a real call into C++ or Torque at this site.

**What it is good for, in order:**

1. **Confirming TC-69's silence.** A lowered builtin has no call boundary to
   report, which is a derived reason to stay quiet rather than an asserted one.
2. **Seeding candidates for a new rule.** The not-lowered set is where a real
   call happens on a hot path. Each candidate still needs its own benchmark
   before it fires — the list narrows what to measure, it does not license a
   finding.
3. **One actionable pair falls out immediately.** `RegExp.prototype.test` is
   lowered and `RegExp.prototype.exec` is not. A hot path that only needs a
   boolean and calls `.exec()` is paying a call the same code with `.test()`
   does not. That is a rewrite, not a judgement — worth a sweep in
   `bench/builtins.jl` and, if it separates, a rule.

**The trap to avoid:** the list changes between V8 versions. Deriving it pins it
to the version in `v8src/`, and the tool must print which V8 it derived from,
or it will make a version-specific claim in a general voice.

Raised 2026-08-29.

**Derivation SHIPPED 2026-08-29; the candidate rule and the test/exec sweep are
still open.** `make builtins` (or `make build`, the umbrella with `numbers`)
runs `lib/derive-builtins.ts`, which extracts every `case Builtin::k…` from the
pinned checkout — 168 names — into the generated `lib/builtins.ts`, together
with the pin from README's ```pin block, the same block `bench/v8-check.js`
reads. `make test` asserts the committed artifact against a re-derivation and
fails naming `make build`; without `v8src/` it reports the comparison as
skipped rather than passing quietly. The hand-written `PRIMITIVES` set in
scan.ts — this project's own hand-asserted copy of the list — is now the
derived statics (52 spellings, up from 36), the walk counts the sites it steps
over, and the report says once per run how many calls were lowered AND under
which V8 that claim is true, exactly as the trap paragraph requires. The weekly
`v8-drift` workflow re-derives against V8 main (`--against-head`) so a change
in the reducer is a scheduled failure, not a surprise. NOT done, deliberately:
`closed-world` does not report the not-lowered set — no benchmark prices a
builtin call yet, and a rule there would be the folklore mistake in new
clothes — and the exec-versus-test sweep in point 3 has not been run.

## TC-68 — two more measured mechanisms with no rule (2026-08-28, open)

Probed alongside TC-66 and TC-67, recorded so they are not re-discovered.

**`late-property-assignment`, the syntactic cause behind TC-67.**
`const o = {id}; if (cond) o.a = 1` yields a different map per path, and a
constructor with `if (flag) this.b = 2` yields two maps per class. Detection is
purely syntactic: an assignment to a property absent from the creating literal,
or a conditionally guarded `this.x =` in a constructor. It needs no map
inference at all, which makes it the most precise trigger found in this
investigation. Silence: when every path assigns the same properties in the same
order.

**`proxy-on-hot-path`, 5.2x.** An empty-handler `new Proxy` on a load path
costs 376 ms against 73 ms, with no deopt. TypeScript erases the Proxy — it
types as its target — so only the `new Proxy(...)` expression itself is
detectable; the rule would flag that expression flowing into an annotated tree.
Measured beside it and NOT proposed: per-object getter closures
(`{get v() {...}}` built per item) cost 10.4x, because each object's accessor
constant splits its map. That one is a heuristic, not a trigger.

**`shared-helper-pollution`, 1.46x, note tier.** Feedback vectors are per
function, not per call site. A `get(o) { return o.v }` helper polluted with
eight shapes from one caller makes a DIFFERENT caller that passes exactly one
shape pay 97 ms against 67 ms. The walk already visits shared callees, so the
count is available — but a callee polluted through a `closed-world` boundary
pollutes invisibly, so an honest version needs runtime. Record it; do not ship
it.

Raised 2026-08-28.

## TC-65 — the shape-instability surface is six times the surface the rules cover (2026-08-28, open, proposal)

The owner's challenge: "honestly this isn't something people do... more likely
they will do some crazy interfaces, or force deopts some other way". Measured
across seven corpora, roughly 192,000 lines — `zod`, `ajv`,
`agent-twitter-client`, `@anthropic-ai/sdk`, and three `openclaw` trees — the
challenge holds.

**What the rules cover, counted in the same source:**

    delete <property>                                    213 sites
    spread-accumulate into acc/prev/result/memo           13 sites

**What destabilizes an object's shape and has no rule:**

    object types with 3 or more optional properties      480 of 2030  (24%)
    conditional field assignment: if (x) obj.f = v       394 sites
    dynamic-key store: o[k] = v                          354 sites
    conditional spread: {...(cond ? {a: 1} : {})}          75 sites

Every one of those four splits a map or risks a dictionary. An object built with
an optional field and one built without it are two hidden classes; `if (x)
obj.f = v` produces one of two shapes from a single constructor; `o[k] = v` with
a non-literal key is how an object reaches dictionary mode without a `delete`
anywhere; and `{...(cond ? {a: 1} : {})}` emits two distinct maps from ONE source
location, which is the sharpest of the four because a reader sees a single
object literal.

That is about 1,300 shape-instability sites against 226 the rules recognise.
`openclaw/src/config` is the extreme: 159 of its 283 object types — 56% — carry
three or more optional properties.

**What this entry does and does not claim.** It measures FREQUENCY, by pattern
matching, and nothing else. It does not show any of these sites costs anything;
prevalence is not cost, and this project's whole discipline is that the second
does not follow from the first. Three of the four are also not decidable from a
declared type alone — TC-2 and TC-60 are what happens when a rule forgets that.
The conditional spread is the exception and is the one to try first: both maps
are visible at one syntactic site, with no inference about what the caller
built.

**Proposal, in order:**

1. Measure the four mechanisms — a `bench/shapes-instability.jl` sweep pricing
   a map split from an optional field, from a conditional assignment, and from a
   conditional spread, against a stable shape, at each working set.
2. Ship a rule ONLY for what separates, and start with conditional spread
   because its trigger needs no map inference.
3. Publish the nulls for whatever does not separate, per TC-53.

If most of these turn out free, that is the answer to the owner's challenge and
it is worth as much as a rule: it would mean ordinary optional-heavy TypeScript
does not pay, and the textbook patterns really are where the cost is.

Raised 2026-08-28, from a prevalence scan over the TC-64 corpora.

## TC-64 — the survey: 30 corpora, 11,198 annotated functions (2026-08-28, open, data)

Every `export function` and class method annotated mechanically, which overstates
hotness and is stated here rather than hidden. 30 corpora: the TypeScript
compiler, Vue 3, `ajv`, `zod`, `valibot`, `typebox`, `es-toolkit`, `remeda`,
`rxjs`, `mobx`, `immer`, `immutable`, `ts-pattern`, `@noble/curves`,
`@noble/hashes`, `entities`, `image-q`, `node-vibrant`, `sourcemap-codec`,
`trace-mapping`, `agent-twitter-client`, `@anthropic-ai/sdk`, four `openclaw`
trees, and others.

    TOTAL      annotated 11,198    errors 1,044    warnings 78,346
               distinct error sites 331

    corpus              annot   err     warn   sites
    tsc                  2190    49    36775       5
    openclaw/gateway      390   247     8869      54
    vue                   940    81     7246      30
    typebox              1304    62     6415      32
    openclaw/auto-reply   317    90     4736      23
    tsestree              131    42     2518       4
    noble-curves          235     2     2113       2
    openclaw/infra        645   139     1316      63
    openclaw/config       266    81     1203      34
    es-toolkit           1415    15     1158      11
    ajv                   257    63     1078      19
    zod                   586    26      839      17
    anthropic-sdk         310     9      764       7
    mobx                  223     2      751       1
    agent-twitter-client  128   118      729      12
    valibot               724    10      694      10
    rxjs                  101     0      321       0
    immer                  37     2      257       2
    remeda                631     3      181       3
    ts-pattern             39     0      134       0
    immutable             117     3      111       2
    image-q               114     0       90       0
    node-vibrant           42     0       28       0
    trace-mapping          23     0       14       0
    entities               13     0        6       0
    eventsource-parser      1     0        0       0
    eventsource             3     0        0       0
    sourcemap-codec        16     0        0       0

**Findings by rule, over all 30:**

    chained-allocation     496
    delete-property        393
    accumulating-spread    120
    megamorphic-dispatch    22
    allocating-select       13
    megamorphic-elements     0

**`megamorphic-elements` fired zero times in 11,198 annotated functions.** That
is the flagship rule, the one the README leads with, and 30 real codebases —
including the TypeScript compiler and Vue — produced not one finding. TC-50's
clause about the unique rules is answered for this rule, and the answer is bad.

**2026-08-28, reconciling this against the 22-codebase survey, which fires 23
times.** Both numbers are right and they measure different things. Two causes,
each checked rather than argued:

1. **This survey annotates `export function` and class methods; vue's instances
   are module-private.** Vue's two distinct sites are
   `compiler-core/src/transforms/vSlot.ts:399` `hasForwardedSlots(children:
   TemplateChildNode[])` and `compiler-core/src/parser.ts:837`
   `condenseWhitespace(nodes: TemplateChildNode[])`. Both loop over the array
   and read `.type` off the element; `TemplateChildNode` reaches those lines as
   8 distinct property sets against a budget of 4. Neither is exported —
   `grep -c 'export .*<name>'` is 0 for both — so this survey never annotated
   them. `examples/annotate.js` annotates by shape (not nested, contains a loop
   or an array-iteration call) and does.
2. **zod's ten were restored after this survey ran.** `prefixIssues` IS
   exported, and it went silent between 0cf1005 and df8aafb because the receiver
   type was read off `(iss as any)` and came back `any`. Re-running it now gives
   10.

So the honest statement is narrower than the heading and worse in a different
way: the flagship rule finds nothing in 11,198 **exported** functions, and what
it does find in 22 codebases is 23 findings at a handful of distinct sites, all
of them either module-private helpers or reached through a cast. That is still a
thin result for the rule the README leads with, and TC-50's clause still stands
— but "zero" is a property of the annotation rule, not of the corpora, and the
entry should not be quoted as the latter.

Worth doing before this decides anything: re-run these 30 corpora with
`examples/annotate.js` instead, so the two surveys differ in corpus and not in
method.
`megamorphic-dispatch` is the counter-example, with 22 real findings (TC-61),
and `allocating-select` has 13. TC-60 shows the elements rule under-fires by
construction, and this is the size of it.

**Why it is zero, checked rather than assumed.** The rule's trigger is an array
whose ELEMENT TYPE is a union of five or more object types. Scanning `zod`,
`ajv` and others for that shape: 26 five-member union aliases exist in `zod`,
and **not one of them appears in array position**. Across the corpora scanned,
the count of `(A | B | C | D | E)[]` is zero.

So the rule is not misfiring and it is not broken in the ordinary sense — the
syntactic shape it waits for is not how people write TypeScript. Real
five-shape load sites arrive as a class hierarchy (`ajv`'s twelve `Node`
subclasses, which `megamorphic-dispatch` DOES catch), as a typed-array family
(TC-60, which the property-set model hides), or as one interface built five
different ways (TC-67, measured at 7.3x and invisible to every current rule).
None of the three is a declared union of object types in an array.

**That is the case for retiring the trigger rather than tuning it.** The three
shapes above are where five maps actually reach a load site, and each has its
own entry. Verified 2026-08-28 against the current binary, after the element-read
and cast fixes: `vue`, `typebox`, `ajv`, `zod`, `tsestree` and `immutable`
re-run unchanged, still zero.

**The warning-to-error ratio is 75 to 1.** 78,346 `closed-world` warnings against
1,044 errors. The TypeScript compiler alone emits 36,775. Nobody triages that.

**And 1,044 findings come from 331 distinct sites** — 3.2x inflation from TC-62,
worst on `tsc`, where 49 findings sit on 5 lines.

**Nine corpora produced zero errors, and eight of the nine are tight hot code:**
`rxjs`, `ts-pattern`, `image-q`, `node-vibrant`, `trace-mapping`, `entities`,
`sourcemap-codec`, `eventsource-parser`, plus `@noble/hashes` in TC-56. Pixel
loops, VLQ codecs, character tokenizers, HAMT tries. The tool is quiet on
well-written hot code, which is the precision result this queue most needed and
the strongest thing in this entry.

Raised 2026-08-28.

## TC-61 — megamorphic-dispatch's first confirmed true positive on foreign code (2026-08-28, open, closes a TC-50 question)

TC-50 records the commercial case against this project: the two rules with
evidence are already shipped by oxlint and Biome, and "the five rules unique to
jitmax are the five with no confirmed true positive in 850 real
functions". That last clause now has a counterexample.

**Survey.** Four packages nobody wrote for this tool, every `export function`
and class method annotated mechanically:

    package                 annotated  errors  warnings  distinct lines
    zod                           586      26       839              17
    ajv                           257      63      1078              19
    entities (parse5)              13       0         6               -
    agent-twitter-client          128     118       729              12

**The result.** `megamorphic-dispatch` fired 22 times in `ajv`, every one in
`compile/codegen/index.ts`, on `node.render()`, `node.optimizeNodes()` and
`node.optimizeNames()` called over a node list. That file defines a `Node` base
with at least twelve subclasses — `Def`, `Assign`, `AssignOp`, `Label`, `Break`,
`Throw`, `AnyCode`, `ParentNode`, `BlockNode`, `Root`, `Else`, `If` — and the
rule reports nine distinct property sets reaching the call site against a
four-map budget. This is a textbook megamorphic dispatch site in one of the most
installed packages on npm, found statically, with no execution.

It is also the pattern TypeScript's own compiler team fixed by hand in
microsoft/TypeScript#51682, stabilizing `Node` shapes to cut polymorphism. A
rule that finds it automatically is the thing no other linter does — ESLint,
Biome and oxlint have no inline-cache rule at all, and every deopt tool in the
space (deoptigate, v8-deopt-viewer, Deopt Explorer) is runtime and dormant.

**What it does not settle.** The rule carries TC-13 as a known defect — a method
in a field has no four-map budget — and this is a method on a prototype, which
is the case TC-13 says is measured at its sharpest. The finding stands, but the
survey is four packages, not the 850 functions TC-50 cites. **Proposal:** re-run
the 850-function survey against the current rules, now that TC-8 is fixed and
this counterexample exists, and replace TC-50's clause with the new number
whichever way it lands.

**Also worth recording:** `entities`, a character-by-character HTML entity
decoder and the hottest small library in the survey, produced zero errors. The
tool stayed silent on tight, well-written hot code — for the second time, after
`@noble/hashes` in TC-56.

Found 2026-08-28.

## TC-60 — megamorphic-elements counts property sets, and seven typed arrays are seven MAPS (2026-08-28, open — claim verified 2026-08-28)

The TC-56 corpus contains exactly one true megamorphic-elements candidate and
the rule is silent on it. `@noble/hashes/src/utils.ts:335`:

```ts
export type TypedArray = Int8Array | Uint8ClampedArray | Uint8Array |
  Uint16Array | Int16Array | Uint32Array | Int32Array;

/** @jitmax */
export function clean(...arrays: TArg<TypedArray[]>): void {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
```

A loop over an array of a SEVEN-member union, calling a method on each element.
The fixed trigger counts a method call as a read, correctly — `arrays[i].fill`
loads `fill` off the element's map before calling it. The rule still does not
fire, because it counts distinct property SETS and these seven share one: every
typed array carries `buffer`, `byteLength`, `byteOffset`, `length` and the same
prototype method names.

**V8 does not agree.** Each typed array subclass has its own map with its own
elements kind and its own prototype object — `Int8Array.prototype` is not
`Uint8Array.prototype`. Seven maps reach that load site, the site has a
four-map budget, and it goes megamorphic. The property-set model, which is what
makes the rule sound against TC-2's over-firing, is what makes it silent here.

**This is TC-2's twin and belongs beside it.** TC-2: a union member is not a V8
map, so counting members over-fires. TC-60: identical property sets are not one
map, so counting sets under-fires. Both are the same root cause — the rule
models a TypeScript-visible proxy for a V8 map, and the proxy is wrong in both
directions. Neither is fixable by adjusting the count.

**Not proposing a fix, because the cheap ones are wrong.** Special-casing the
typed-array family would fire on this site and teach the rule nothing; a
prototype-identity check is exactly the runtime fact TC-36 already concluded
this project cannot see statically. This entry is here to be counted in the
survey the queue keeps deferring: it is the first "silent and real" case found
by running the tool on code nobody wrote for it, and TC-59's experiment is what
would find the rest.

Found 2026-08-28 in the TC-56 corpus, checking whether the megamorphic rules
SHOULD have fired rather than only whether they did.

**Verified 2026-08-28, not assumed.** Under `--allow-natives-syntax`,
`%HaveSameMap` is false for all 21 pairs of the seven typed arrays, and their
seven `prototype` objects are seven distinct objects. Seven maps reach that load
site against a four-map budget. The entry's central claim is a measurement now,
which is the standard this project holds every other claim to; the conclusion —
that the cheap fixes are wrong — is unchanged.

## TC-59 — two readings of the stated aim, and the experiment that decides between them (2026-08-28, open, owner decision)

The owner stated the aim as "allow you to write code that optimizes to machine
code eventually". It carries two readings, and TC-58 was written on the first
before the second was raised.

**Reading A — the consumer is a program.** The tool exists so a model writing
code gets feedback that keeps its output on V8's fast path. What that needs is
an output contract a caller can act on: TC-58, a JSON format and a
`rewrite`/`judgement` verdict.

**Reading B — the evidence is machine code.** The tool should eventually check
what V8 ACTUALLY did — the optimized output, the IC state at the site, the
deopt — instead of inferring it from a source pattern.

**They are not alternatives, and that is the resolution.** A is about who reads
a finding; B is about what a finding rests on. A tool that asks V8 what happened
and prints JSON satisfies both. The real question is not which aim governs but
which comes first, and that IS decidable here rather than by preference.

**Reading B is already this project's own conclusion, twice.** TC-36: the
elements kind is decided by the values stored, so the fix "belongs to a runtime
half this project does not have — one that asks V8 for the elements kind instead
of inferring it from a declared type". TC-2: a TypeScript union member is not a
V8 map. Both defects are the same shape — a static trigger standing in for a
runtime fact — and both are open.

**The machinery is already in the repository, pointed at the other question.**
`bench/` runs V8 with `--allow-natives-syntax` at 12 sites, `--trace-opt` at 8,
`--trace-deopt` at 3 and `--trace-turbo-inlining` at 1, and `%HasFastProperties`
is what settled TC-36's holey-versus-boxed table. The checker asks V8 nothing.
Reading B is not new capability; it is capability the benchmarks have and the
tool does not.

**The experiment that decides the order.** For each of the seven rules, take its
own bench kernel, run it under `--allow-natives-syntax` plus `--trace-ic` — the
one flag not yet in use here — and ask V8 whether the mechanism the rule names
actually occurred at the site the rule fires on. Classify each rule three ways:

- **fired and real** — the rule fired and V8 confirms the mechanism.
- **fired and absent** — the rule fired and V8 shows no such transition. TC-8
  was this before it was fixed.
- **silent and real** — V8 shows the mechanism where no rule fires. This is how
  the sparse-elements gap in TC-52 would surface without writing a rule first.

If most rules land "fired and real", the static triggers already track reality,
reading B is confirmation work, and TC-58 is the next build. If a meaningful
share land "fired and absent", the static half is the weak base and packaging it
for a generator ships wrong answers faster.

The experiment needs no new benchmark and no new measurement protocol — it reuses
the kernels that already exist and asks them a different question. It is the
cheapest thing on this queue that changes what gets built next.

**2026-09-09 — the flag this entry names does not exist here, and a better one
does.** `node --trace-ic` on the pinned runtime (v22.23.2) answers `node: bad
option: --trace-ic`; V8 compiles that tracer out of release builds, and
`node --v8-options` lists no IC tracer at all. The experiment as written cannot
run on this machine.

`%DebugPrint` can, and it is already allowed here — `bench/natives.js` is the
sanctioned wrapper and `%HaveSameMap` settled TC-36. Given a function, it prints
the feedback vector slot by slot, with the IC state this entry wants:

    - slot #0 LoadProperty MEGAMORPHIC {          five shapes at one load
    - slot #0 LoadProperty MONOMORPHIC            one shape, same site
    - slot #0 SetNamedSloppy MEGAMORPHIC {        five shapes at one store

That is the question asked directly rather than inferred: not "how many maps did
the builder make" but "what state did V8 leave at this site". It reads loads and
stores, and it discriminates — the monomorphic control is a real control, run
above.

**What still blocks it, and it is not the probe.** `%DebugPrint` needs the
kernel FUNCTION object. Workload kernels are module-scope and unexported
(`sweep` in `bench/shape-sets.ts`), so the `--import` preload trick that lets
`bench/tiers.ts` read workloads unmodified cannot reach them: `region-marker.ts`
hooks `process.hrtime.bigint`, which is a global, and a kernel is not. Reaching
one needs a guarded line in each workload — a change to the files the published
numbers were measured with, which wants sign-off before it lands rather than
after. The probe is settled; how it reaches the kernel is the open question.

Raised 2026-08-28, from the owner's aim and the ambiguity in it.

## TC-58 — nothing here is consumable by a program, and the stated aim is a program (2026-08-28, open, proposal)

The owner's stated aim for this tool: let a model write code that optimizes to
good machine code. That consumer is a program, and the tool currently serves
only a human reader.

**No structured output exists.** `lib/report.ts` renders text and nothing else;
`JSON.stringify` appears once in the whole tool, in a `lib/config.ts` error
message. A caller that wants the findings must parse the prose, and the prose is
deliberately shaped for reading. Now that costs are out of the findings (TC-9,
shipped) a finding is a small, regular record — rule, file, line, message, fix,
defects — which is exactly the moment a machine format becomes cheap.

**Some fix lines decline to give a fix.** `accumulating-spread` reads "there is
no rewrite here this project has measured as a win on both halves", then
explains a trade-off between a faster build and a cheaper read. That is the
right answer for a human, who can weigh it. A generator needs a decision:
rewrite, or leave it alone. Today it gets neither.

**Proposal, two parts, both small:**

1. A `[output] format = "json"` key in the TOML — not a flag, since
   `bin/jitmax.ts` rejects flags by design — emitting one record per finding
   with the fields above plus `severity` and the bench file name. The text
   renderer stays the default and stays unchanged.
2. Give every rule a `verdict` beside `fix`: `rewrite` when the project has
   measured a win, or `judgement` when it has not, with the trade-off text
   attached. Then a generator can act on `rewrite` and escalate `judgement`,
   instead of parsing a paragraph to discover the rule is not sure.

Neither part invents a measurement, which is why both are cheap: they restate
what the rules already know in a shape a caller can read.

Raised 2026-08-28, from the owner's statement of the aim.

## TC-56 — the first real-corpus run, and it should become the demo (2026-08-28, open, proposal)

`demo/` is hand-written fixtures. This is the first run over code nobody wrote
for this tool, and it is worth shipping as the demo because the result is
favourable and the caveat is honest.

**Corpus.** 67 files: `@noble/hashes/src` (18 files, expert-written hot crypto)
plus one project's own daemon and CLI TypeScript. Every `export function` was
annotated mechanically — 103 of them.

**Result.** 6 errors, 157 warnings, exit 1.

- **Zero gating findings in `@noble/hashes`.** The hottest, most carefully
  written code in the corpus produced no error-level finding. No false-positive
  storm on exactly the code most likely to trigger one.
- All 6 errors are `chained-allocation`, all in the ordinary application code.
- All 157 warnings are `closed-world` — see TC-55.

**The caveat, and it belongs in the demo text.** Annotating 103 exported
functions mechanically is a false promise: `@jitmax` asserts a function is hot,
and most of these are not. `tomlValue` writes a config once. The findings are
real patterns on cold functions, which is the annotator's error and not the
tool's — and saying so in the demo is a stronger claim for the annotation than
hiding it.

**Proposal:** vendor the corpus (or a pinned subset) under `demo/corpus/`, record
the expected counts, and let `make demo` assert them. Then a regression in
precision shows up as a diff instead of as a feeling.

## TC-53 — `arguments` is unmeasured folk advice, and the null belongs in the file (2026-08-28, open, proposal)

`jitmax` reports nothing on a function that reads `arguments`. That is very
likely correct, and the project cannot currently say so. TurboFan's escape
analysis materializes the arguments object only where it leaks, so the advice
every JS performance guide still repeats is probably dead — the same shape as
the string-concatenation result, where `s += x` measured 0.26-0.52x of
push-and-join and the received wisdom was backwards.

This is not a request for a rule. Adding one on folk advice is the exact mistake
this project charges oxlint and Biome with (TC-50). The proposal is a sweep and
a published null.

**Proposal:** `bench/arguments.jl` over three forms — `arguments.length`, an
indexed read, and `arguments` passed to another function so it escapes — against
rest parameters at each working set. Expect no separation on the first two. Then
record the null in the README's "where these numbers stop" material, whichever
way it lands. A measured null is this project's distinguishing asset and costs
one sweep.

**Answered the same day, and the null is confirmed.** Probed under
`node --allow-natives-syntax --trace-deopt --trace-opt` on V8 12.4.254.21: a
function that leaks `arguments` to another function still reaches TurboFan. The
folklore is dead. Three more died in the same probe and belong beside it in
whatever the README's "where these numbers stop" section becomes:

- **`try`/`catch` in a hot loop optimizes.** Optimization status `1010001`.
- **Generators optimize** — both the generator body and the driving `for...of`.
- **`for...in` over `Object.create(null)` is FASTER** than over an equivalent
  plain object, 90 ms against 132 ms.
- **A missing key is not the cost.** A monomorphic missing-key read is free
  (26 ms over 8M checks), and `{b: undefined}` shares the map of a literal that
  gives `b` a real value. The cost is never the absent key; it is the map split
  when two builders disagree. That is TC-67.

Still record the sweep properly before publishing — these are single probes, not
this project's three-replication protocol.

Raised 2026-08-28, from a run over nine hand-written hot functions.

## TC-52 — no rule for the sparse-elements transition, and holey is not it (2026-08-28, open, proposal)

`jitmax` reports nothing on a function that writes far past the end of a short
array:

```ts
/** @jitmax */
export function widen(): any[] {
  const a: any[] = [];
  a[0] = 1;
  a[1000] = 2;
  return a;
}
```

The gap is real but it is NOT the holey case. Holey measured 0.93-1.06x here —
free — which is why `delete a[i]` was narrowed out of `delete-property` on
2026-08-19 and why `boxed-elements` was withdrawn (TC-14, TC-36). A large sparse
jump is a third transition: past V8's `ShouldConvertToSlowElements` threshold the
backing store becomes `DICTIONARY_ELEMENTS`, a hash table, rather than a
contiguous store carrying a hole check. Different mechanism, different part of
V8, and nobody here has measured it. The note left at the end of TC-36 —
"measuring the holey case and giving it its own rule stays open as work" — is
this entry, narrowed to the transition that is not already known to be free.

**The trigger has to stay syntactic, or this repeats TC-2.** The elements kind
is decided by the values actually stored (`Object::OptimalElementsKind`,
`src/objects/objects-inl.h:700`), so a declared type proves nothing. Three forms
are decidable without asking V8: `new Array(n)` that no fill reaches, an array
literal with an elision, and a write whose LITERAL index exceeds the literal
length at construction. A computed index is undecidable and stays out, stated
rather than papered over.

**Proposal, and the order matters:** write `bench/sparse.jl` first — packed
against holey against dictionary, at L1, L2, L3 and RAM — and ship a rule only
if the dictionary column separates by more than the 1.0-1.7x band this harness
has twice failed to resolve (TC-11, TC-36). If it does not separate, the outcome
is a published null and no rule, exactly as in TC-53.

Raised 2026-08-28, from a run over nine hand-written hot functions.

## TC-51 — closed-world drowns a real checkout that has no node_modules (2026-08-21, cause named 2026-08-29)

`node bin/jitmax.ts` on a typescript-eslint checkout reported 4140
findings. 4115 of them — 99.4% — are `closed-world` naming an import the
program cannot resolve, because the dependencies are not installed. Every
`tsutils.isTypeFlagSet` in the tree is reported as an opaque callee, once per
annotated function that reaches it.

The rule is not wrong: an unresolved callee IS an inlining boundary at runtime.
But an unresolved callee at CHECK time is a missing `npm install`, and the tool
cannot tell the two apart. The 25 findings that carry signal — two
`delete node.range` / `delete node.loc` calls on every node of the ESTree AST
in `typescript-estree/src/ast-converter.ts:48`, eleven `.map().filter()` pairs
in `convert.ts`, one megamorphic dispatch — are unfindable underneath them.

Not fixed inline: telling "the package is absent" from "the callee is genuinely
opaque" needs the checker to look at module resolution rather than at the
symbol, which changes what the rule reads. Proposal, needs sign-off: when a
call's symbol is unresolved AND its module specifier resolves to nothing on
disk, report it once per FILE as an unresolved-dependency note outside the
findings list, and exit 1 with `DEPENDENCIES MISSING` — the same
say-what-you-cannot-see contract the walk already keeps for truncation.

**2026-08-29 — the cause is now named, loudly, and the run is no longer clean.**
The deeper defect underneath this entry was that a checkout with no
`node_modules` does not merely flood: every type imported from a missing package
reads as `any`, so `objectShapes` counts nothing, `isArray` answers false, and
every type-based rule goes quiet on those files. A file importing `Row` from an
uninstalled package and doing `s += r.x + r.y` printed `every annotated function
is clean` and exited **0** — the clean-run-that-checked-nothing this project
throws on in five other places.

`scan()` now returns the module specifiers the program could not resolve, the
report names them, and the run exits 1 and is never called clean. On
typescript-eslint it names all 20 uninstalled packages. Asked of the checker
(an unresolved specifier has no symbol) rather than of `getSemanticDiagnostics`:
8ms over 230 files against seconds.

The flood itself is unchanged and still open — but a reader now sees the reason
above it rather than inferring it from the volume.

Found by: running the tool on typescript-eslint, 2026-08-21.

**2026-09-01 — re-verified, no code change.** The discrimination the original
proposal treated as needing new checker work turns out to be cheap: `scan()`
already names every unresolved module specifier (the 2026-08-29 amendment
above), so telling a missing package from a genuinely opaque callee costs
nothing beyond reading that list. The flood itself, and the `DEPENDENCIES
MISSING` exit path, remain open.

## TC-49 — nothing binds a rule to its evidence or to a fixture (2026-08-19, open, proposal)

`RULES` is an array of functions; `EVIDENCE` is a table keyed by rule name; no
test relates them. An eighth rule added to `RULES` with no `EVIDENCE` entry, no
`silent` clause and no demo fixture passes the whole suite. It would also be
undisableable, because `resolveDisabled` throws for a name absent from
`EVIDENCE` — so the only way to turn it off is to delete it.

This project's stated rule is that a rule ships with a measurement and with a
cell where it must stay quiet. Nothing enforces the first half.

**Proposal:** export the rule names beside `RULES` and assert set equality with
`Object.keys(EVIDENCE)`, plus at least one demo fixture per rule.

## TC-45 — a call through an interface or a parameter is invisible twice (2026-08-19, open, proposal)

TC-31 recorded that a call through a parameter is neither followed nor reported.
The reproduction is worse than the entry: the canonical megamorphic program is
silent, and silent in BOTH directions.

```ts
interface Shape { area(): number }
// five classes implementing it, dispatched in a loop
```

    jitmax — 1 annotated function, 0 findings
    every annotated function is clean.

`megamorphic-dispatch` sees a declared type that is not a union, so
`objectShapes` answers 0. And `closed-world` skips it because `lib/scan.ts`
computes `unchecked = next.length === 0 && (decls.length === 0 ||
decls.some(unreadable))` — a `MethodSignature` in a `.ts` file is neither
followable nor unreadable, so it falls through both branches. A callback
parameter behaves the same way.

So nothing on the terminal separates *"we looked and it was fine"* from *"we
could not look"*, which is the promise `closed-world` exists to keep. TC-31 is
not in `closed-world.defects` either, so no finding names it.

**Proposal:** treat a callee that resolves only to declarations with no body — a
parameter, a `MethodSignature`, a `CallSignature` — as an escape. One clause in
`unchecked`, and it widens published output on every codebase that uses an
interface, which is why it waits.

## TC-44 — `allocating-select` fires on a value that never escapes, and prints the wrong cell's number (2026-08-19, open, proposal)

The rule's `unreported` clause said *"the rule stays out of it"* about a target
kept in a local. It does not — nothing in `allocatingSelect` asks where the
target lives:

```ts
let lo = xs[0]!;
for (const y of xs) lo = Money.min(lo, y);   // lo never leaves the function
```

    lo is replaced by Money.min(...), which returns a new object every pass
    measured 2.56-2.87x when the chosen value is stored somewhere that outlives the loop

The printed figure is `select.heap`, measured for a value that escapes. The
figure for this program is `select.silent.local`, and it is smaller. The clause
is corrected as of today; the rule is not.

**Proposal:** gate the rule on the target escaping the loop, and cite the local
cell where it does not. Both change shipped output.

## TC-43 — `accumulating-spread` is evaded by three tokens, and no rule is inter-procedural (2026-08-17, open — two of four closed 2026-08-19)

Five annotated functions, each holding the measured defect in a form one
keystroke from `bench/spread.js`'s `spread` variant. **`0 findings`, exit 0:**

- `this.acc = [...this.acc, x]` — the rule requires `ts.isIdentifier(node.left)`,
  and a property target is not an identifier.
- `xs.forEach(x => { acc = [...acc, x] })` — `walkLoops` knows five loop node
  kinds; `reduce` was hand-special-cased and `forEach` was not.
- `acc = append(acc, x)` with `append = (a, x) => [...a, x]` — **the walk enters
  `append`**, but no rule is inter-procedural, so the loop is in one body and
  the copy is in another and neither sees the other.
- `const doubled = xs.map(f); const kept = doubled.filter(g)` — the same two
  allocations `chained-allocation` measures, but `stage()` only matches a call
  whose receiver is itself a call.

The call-tree walk is the product's premise — the annotation exists so the tool
can follow calls the way `@njit` follows them — and every rule is a single-body
syntax match. Hoisting three tokens into a helper the walk already visits
silences the tool completely.

**Two of the four are fixed, 2026-08-19.**

- `this.acc = [...this.acc, x]` fires. The accumulator is matched by TEXT, so a
  property target is a target; `demo/lib.ts` `Collector.addAll` is the fixture.
- `xs.forEach(x => { acc = [...acc, x] })` fires. A callback that an array
  method re-runs per element is a loop, which is what `reduce`'s hand-written
  special case already assumed; `walkLoops` now knows the whole family, and only
  the callback arguments count — the receiver is evaluated once.

**Still open, and the proposal narrows to these two.** Neither is a missing
special case; both need machinery the rules do not have:

- `acc = append(acc, x)` where `append` spreads. The walk enters `append`; no
  rule is inter-procedural, so the loop is in one body and the copy is in
  another. Making the allocation rules inter-procedural over `mark.reached` is
  the walk's whole point and is the real proposal here.
- `const doubled = xs.map(f); const kept = doubled.filter(g)`. `stage()` matches
  a call whose receiver is itself a call; following a stage through a local
  binding needs dataflow inside the body.

Until then README says plainly that rules are single-body and the walk widens
only *where* they are applied.

## TC-41 — an example's `.after.ts` is a rewrite, and its costly axis is never swept (2026-08-17, open — disclosed, not swept, 2026-08-19)

`CLAUDE.md` says `examples/` holds "a `.after.ts` carrying the fix jitmax
printed and nothing besides". The printed `delete-property` fix is one English
sentence with two branches: "assign undefined where the key may stay present,
**or build the object without it**". `examples/estoolkit-omit.after.ts` takes
branch two as a nested loop — for each of n keys, a scan over the k omitted
ones. es-toolkit ships O(n+k); the "fix" is O(n·k).

`examples/workloads.ts:182` pins **k = 2** (`['password', 'token']`) at both
sizes. n is swept (12 and 48). **k is never swept**, and k is the only axis in
which the rewrite changes complexity — so protocol rule 12 was applied to the
axis the rewrite leaves alone.

`1.64-3.36x` is therefore what one hand-chosen reading of an English sentence is
worth at the most favourable value of the parameter that reading regresses. A
user who wrote `Object.fromEntries(Object.entries(o).filter(...))` — an equally
faithful reading — gets a number nobody measured.

**Proposal:** sweep k, and publish what happens where the rewrite loses.

**Not done, and disclosed rather than fixed (2026-08-19).** Sweeping k means new
cells in `example.jl` and another hour of quiet machine, and the machine this
runs on is not quiet enough today to add cells to a published sweep. What ships
instead is the disclosure: README and the page both say the fix helps at 12 keys
and rejects at 48, and `ex.omit.reads48` is a derived citation reading
`0.99-1.05x` — the interval that spans 1.0 — so the rejection is on the page in
the same column as the win. The k axis stays unswept and this entry stays open.

## TC-33 — `closed-world`'s trigger and its benchmark measure different things (2026-08-17, open — the report says `bound` as of 2026-08-19)

User trial, 2026-09-07: date-fns at `a0a39220` correctly parsed the tested
timestamps with offsets and a leap-day rollover. jitmax followed `parse` to
`Parser.run`, then reported at least 31 implementations at `this.parse` in
`src/parse/_lib/Parser.ts:16`. The report names parser classes and asks for four
or fewer, but supplies no replacement a caller can use through `parse`'s API.
The static count does not establish how many implementations those timestamp
inputs exercise. This is a reproduced detection, not a measured runtime count
or speedup; the trial is in `examples/README.md`.

**Amended 2026-08-31 — the `warn` tier is gone, and this gap is now the only
thing that states it.** `severity` was removed from `Evidence`: every finding is
an error and every error fails the run. The owner's reasoning is that the
annotation is the filter — a user writes `/** @jitmax */` only on a
function they need fast, so a finding on one is actionable by definition, and
tuning belongs to the `[rules]` table and the per-function `-rulename` /
`-TC-NN` annotations rather than to a second tier nobody could aim.

The honest cost of that, recorded rather than argued: `closed-world`,
`interface-dispatch` and `megamorphic-dispatch` fire on programs their own
benchmarks did not measure — this entry — and they are 98.6% of every finding
across the 22-codebase survey. **A build can now fail on a mechanism this
project has not priced for that program.** What makes it tenable is v0.11.0's
split: `interface-dispatch` is separately silenceable, so quieting the noisy
cause no longer switches off the honest "no body anywhere" one. What still says
the gap exists is `defects`: all three carry TC-33, and the report prints
`known defect: TC-33 — …` under every finding they make. A test holds that
register in `make test`.

**Amended 2026-08-29.** The "report says `bound`" note is stale — that flag was
replaced by `severity`. The core gap stands: the trigger and the benchmark
measure different programs.

The most load-bearing entry here, because this rule is **1539 of the 1672
findings** in the twelve-library survey — 92% of everything the tool has ever
said about real code.

> **Answered in part, 2026-08-19.** The report no longer prints `measured` beside
> this rule's number. `Evidence.bound` marks a rule whose benchmark prices the
> MECHANISM rather than the trigger, and the finding prints `bound 4.64-4.95x`
> instead — a bound on what one unchecked call can cost, next to a finding that
> makes no claim about this call. The rule also carries TC-33 in its `defects`
> list, so every one of those 1539 findings names this entry. What is NOT fixed
> is the gap itself: no benchmark here measures a callee nobody can read,
> because a callee nobody can read is a callee nobody can size.

- The rule fires when TypeScript resolves a callee to a declaration file: it has
  the signature and no body (`lib/scan.ts`, `unreadable()`).
- The benchmark measures two fully visible LOCAL functions, identical in
  behaviour, one padded with dead code past V8's `max_inlined_bytecode_size` of
  460 so the inliner refuses it (`bench/inline.js`).

Those are not the same condition. A dependency shipping a `.d.ts` says nothing
about the size of its runtime JavaScript; V8 loads and may inline that function
perfectly well. The checker cannot see the body, so it cannot know whether V8
would. Every one of those 1539 findings prints `3.21-4.95x` for a mechanism that
has not been established at the site it fired on.

README is already candid that the rule is 92% of output and that its n=100000
cell does not replicate. It is not candid that the trigger and the measurement
are different mechanisms, and the published page said "V8 cannot inline what it
cannot see", which is simply not what the benchmark shows. **That sentence is
corrected as of this entry** — a false mechanism claim in public is not a
proposal, it is a defect, and it is fixed.

**Proposal, and it is a scope decision rather than a patch:** either
(a) restate `closed-world` as coverage reporting — "here is what I could not
check" — and stop attaching a cost to it, which is what it honestly is; or
(b) keep the cost and gate it on something that actually predicts non-inlining.
(a) is what the evidence supports.

## TC-22 — three workloads still dispatch on the variant string inside the timed region (2026-08-15, open)

The repo has a rule about this — *"Never dispatch on a variant string inside a
timed loop. Resolve the kernel to a function once, before timing. A `switch` in
a timed region produced a wrong result here."* It was written after `chained.js`
was caught, and `chained`, `arrays`, `dispatch`, `addprop`, `delete` and
`strings` were all converted to a `BUILD` table with the comment *"One function
per variant, resolved ONCE below"*. Three were not:

| workload | where | how often, per repetition |
|---|---|---|
| `select.js` | `scanHeap`, `scanNumber` | once |
| `select.js` | `minOf`, called 32× by `scanLocal` | **32 times** |
| `spread.js` | `build()` | once |
| `spread-object.js` | `build()` | once |

`select.js` resolves the *mode* to a function once, on line 112, which is
probably why nobody noticed the *variant* never was.

The cost of one string compare against a `BUCKETS`-sized loop is small and this
is not a claim that any number is wrong. What it is: an untaken branch sitting
inside every kernel V8 optimizes, which is one of the two candidate explanations
for TC-21's deopt storm and the cheaper of the two to eliminate.

Not fixed, because fixing it changes measured code and every cell in
`select.jl`, `spread.jl` and `spread-object.jl` would have to be re-measured to
stay comparable.

**2026-09-01 — re-verified, no code change.** `test/check.test.ts` now pins a
`DISPATCHES_INSIDE` register (`select.ts: 3, spread-object.ts: 2, spread.ts:
2`) and walks every workload the sweep table names for a read of `variant`
inside a function, so a fourth file doing what these three do fails the build
instead of going unnoticed for two weeks the way these three did. Converting
the three stays a re-measurement, and the owner's call.

## TC-21 — nobody had checked which tier the measured code was in (2026-08-15, open, proposal)

**The assumption held, and it held for the reason that had been guessed at.**
`bench/tiers.js` re-ran all 280 published cell shapes under `--trace-opt
--trace-deopt`, at the rep count each cell was published at, with the region
boundaries marked. Of 1590 function-sides observed running inside a timed
region, **1287 were on TurboFan when the stopwatch started**. OSR is what does
it: the warmup passes are far too few to reach `invocation_count_for_turbofan`,
but the inner loop is hot on the first pass and V8 OSR-compiles it there. A cell
sized at two repetitions is still measuring optimized code.

Two facts that belong next to that, because they were assumed and are not true:

- **Maglev is off.** This Node reports `--maglev` as `default: --no-maglev`, so
  the tier ladder here is Ignition → Sparkplug → TurboFan and every number in
  this repo was measured with one of V8's two optimizing tiers switched off.
  Where a reader will see it: README's honest limits, next to the Node and V8
  versions. **This bullet first said that `invocation_count_for_maglev` was
  "cited in README's V8 table and verified by `make v8-check`". It is not, and
  never was** — `git log -S maglev -- README.md` is empty, and the V8 table
  cites seven mechanisms, none of them a tier-up budget. The fact about the
  machine was right; the claim about where it was published was invented.
- **Sparkplug is invisible.** `--trace-opt` traces the optimizing tiers only. A
  function this diagnostic calls `none` was in Ignition or in Sparkplug and the
  diagnostic cannot say which.

**And the diagnostic is noisy, which is why it says so.** Each side is traced
twice; **101 of the 280 cells** had at least one function whose token differed
between the two traces of the *same side*. Concurrent compilation landing before
or after a boundary is a race with the machine, and this machine was not quiet.
Those names go in `tierUnstable` and are excluded from `tierMismatch` — a race
reported as a finding is how a diagnostic starts inventing rules. The aggregate
above is far more solid than any single cell in it, and every per-cell claim
below was re-run by hand.

### What is NOT clean

**Four cells enter their region at different tiers on the two sides.** These are
ratios that are partly measuring tiering:

| cell | reps | ratio | what differs |
|---|---|---|---|
| `spread` incl n=10000 spread/push | 3616/2 | 1749.89x | baseline's `build` marked and not yet installed; variant's is `TF/osr` |
| `dispatch` excl n=16384 cls3/cls1 | 7206/5078 | 1.32x | `step` TF on the baseline, never optimized on the variant |
| `example` incl n=48 estoolkit-omit | 570/175 | 3.25x | `omit` TF on the `after` side, never optimized on the `before` side |
| `example` incl n=16 zod-clean-enum | 467/404 | 0.91x | `cleanEnum` TF on `after`, none on `before` — **and unstable between two traces of the same side**, so this one may be a race and not a fact |

Every one of them penalises the side that would make the printed ratio *larger*,
which is the uncomfortable direction. The spread cell is 1750x and a few percent
of tiering does not touch it. The other three are between 0.91x and 3.25x, where
it could matter, and none of them is a number `lib/derive.ts` publishes.

**Nine cells run a deoptimization storm inside the timed region, and in eight of
them the two sides storm differently.** This is the larger finding:

| cell | reps | ratio | deopts in region, base / test |
|---|---|---|---|
| `strings` build n=100000 plus/joined | 19/41 | 0.46x | **19 / 0** |
| `strings` build n=100000 pluseq/joined | 22/29 | 0.54x | **30 / 0** |
| `strings` build n=100000 concat/joined | 23/41 | 0.54x | **23 / 0** |
| `strings` incl n=100000 plus/joined | 8/9 | 0.80x | **15 / 0** |
| `strings` incl n=100000 pluseq/joined | 7/9 | 0.81x | **12 / 0** |
| `strings` incl n=100000 concat/joined | 7/8 | 0.76x | **7 / 0** |
| `select` heap n=100000 | 468/156 | 2.73x | **66 / 135** |
| `select` number n=100000 | 578/572 | 0.99x | 101 / 66 |
| `chained` incl n=10000 splitjoin/packed | 68/82 | 1.06x | **68 / 0**, and the baseline was `TF` in one trace and a 68-deopt storm in the other |

All of them are at the largest `n` of their sweep — the same cells TC-11's audit
flagged for low repetition counts, found again by a completely different probe.
The deopts are one reason, repeated: *"Insufficient type feedback for compare
operation"*. Two candidate mechanisms, neither established here:

1. Feedback-vector flushing under GC. Every one of these cells allocates hard at
   the largest `n`, and a flushed vector is exactly "insufficient type feedback".
2. The untaken variant branch inside the kernel — TC-22.

### Which published claims sit on these

- **`allocating-select`, and it survives.** `select.heap` publishes **2.65-2.73x**
  and README quotes it. The 2.73x end is the storming cell. The 2.65x end,
  n=10000, is **completely clean** — every function TurboFan at the gun, no
  deopt, no mismatch — and the two agree to within 3%. The claim rests on a clean
  cell and is corroborated by a dirty one, which is the right way round. The
  published *interval* for n=100000 (`select.heap.ci100k`) is measured on the
  storming cell and should be read as such.
- **`accumulating-spread`'s silent clause on strings** — and this bullet had it
  wrong twice, corrected here against the rows rather than left standing. It is
  `accumulating-spread` that publishes "0.27-0.56x ... and 0.74-0.97x once the
  read back is counted", not `accumulating-select`. And the storming n=100000
  cells do not make the upper end of *both* ranges:

  | range | its low end | its high end | which end is the storming cell |
  |---|---|---|---|
  | build, 0.27-0.56x | 0.27x pluseq n=1000 | 0.56x plus n=100000 | the **high** end |
  | with the read back, 0.74-0.97x | 0.74x pluseq n=100000 | 0.97x plus n=10000 | the **low** end |

  Which reverses the sentence that followed it. The claim is that a string beats
  the rewrite — a ratio below 1, and the further below the stronger. For the
  build range the storming cells sit at 0.40-0.56x against 0.27-0.38x on the
  clean ones, so the contamination pushes *against* the claim, not toward it.
  Only in the read-back range does it push the way the claim wants. Either way
  the direction survives: every clean cell of both ranges is below 1.
- **Nothing else.** `chained` splitjoin/packed and `select number` are not in any
  `lib/derive.ts` citation beyond the cell counts.

### The proposal, not shipped

1. **Warm to a stated invocation count and record what was achieved.** The
   workloads warm 3 flat passes, or `max(4, 2e6/n)` in the newer four, and
   neither number was measured — they are TC-11's rejected repetition floor
   wearing a different hat. The fix is not a bigger constant. It is to warm
   until the kernel is observed optimized, and to record the count it took in
   the row next to `repsBase`/`repsTest`, the way the tier is now recorded. A
   fact, not a threshold.
2. **A deopt inside the timed region is a property of the cell and belongs in
   the row.** The runner records `deoptBase`/`deoptTest` today. Whether an
   asymmetric storm should *void* a cell is a protocol change and is exactly the
   kind of threshold this project has been wrong about twice.
3. **Re-measure the nine storming cells and the four mismatched ones** and see
   whether anything moves. Started here; blocked on a quiet machine.

Recorded rather than acted on: 1 and 2 change the measurement protocol, and
CLAUDE.md says a redesign gets signed off before it ships.

### Proposal 2 answered on evidence: an asymmetric storm must NOT void a cell

The re-measurement records `deoptBase`/`deoptTest` on every row, so a storming
cell is now three observations of the storm next to three observations of the
ratio. That is the comparison the question needed and nobody had.

| cell | three ratios | common value? | in-region deopts, base / test |
|---|---|---|---|
| `select` heap n=100000 | 2.56x 2.87x 2.65x | **yes**, 2.30-3.09 | 53/66, 41/66, **47/41** |
| `select` number n=100000 | 0.88x 0.94x 1.00x | **yes**, 0.84-1.10 | 101/47, 81/66, **101/101** |
| `strings` concat build n=100000 | 0.49x 0.52x 0.51x | **yes**, 0.41-0.57 | 8/0, 8/0, **21/0** |
| `strings` plus build n=100000 | 0.52x 0.50x 0.48x | **yes**, 0.41-0.57 | 8/0, **22/0**, 8/0 |
| `strings` pluseq build n=100000 | 0.52x 0.50x 0.51x | **yes**, 0.48-0.55 | 8/0, 8/0, 8/0 |
| `strings` concat incl n=100000 | 0.80x 0.82x 0.81x | **yes**, 0.76-0.86 | 8/0, **0/0**, 8/0 |
| `strings` plus incl n=100000 | 0.79x 0.81x 0.83x | **yes**, 0.76-0.92 | 8/0, 7/0, 7/0 |
| `strings` pluseq incl n=100000 | 0.80x 0.78x 0.90x | **yes**, 0.76-1.04 | 7/0, 7/0, 8/0 |
| `inline` excl n=100000 | 4.73x 4.68x 3.21x | **no** | **0/0, 0/0, 0/0** |
| `strings` pluseq build n=1000 | 0.27x 0.27x 0.31x | **no** | **0/0, 0/0, 0/0** |
| `strings` concat excl n=1000 | 1.02x 0.98x 1.08x | **no** | **0/0, 0/0, 0/0** |

Read the two columns against each other. In `select number` the asymmetry runs
from 101-against-47 to 101-against-101 — it *disappears* between sweeps — and
the ratio does not move out of a common interval. In `select heap` the side that
storms harder changes between sweeps, and the ratio does not care.

`strings concat incl n=100000` is the cleanest instance in the table: the storm
is 8 deopts against 0, then **none at all**, then 8 against 0, and the three
ratios are 0.80x, 0.82x, 0.81x. The contamination was removed and the number did
not move. `plus build n=100000` runs the same experiment the other way, 8 to 22
and back to 8 against a silent baseline, for 0.52x, 0.50x, 0.48x. The storm
varies far more between sweeps than the number it is supposed to be corrupting.

And **every cell in the re-measurement that failed to replicate has no deopt at
all**, on either side, in any of its sweeps — three of them now, from two
different sweeps. Eight storming cells, eight that replicate; three cells that
do not replicate, zero deopts between them. A void rule keyed on asymmetric
storms would have thrown away eight cells that replicate and kept all three that
do not. That is not a filter, it is noise with a threshold on it.

Three further reasons, none of which needed the data:

- **The storm is never observed in the process whose timing is published.** The
  counts come from `bench/tiers.js`, which runs the same shape again under
  `--trace-opt --trace-deopt`, because protocol rule 8 keeps tracing out of a
  measured process. So voiding a measurement on a storm means voiding it on a
  replica's behaviour — and that replica disagreed with *itself* on 101 of 280
  cells, which is the number recorded above.
- **`void` already means something else.** It means the timed region missed
  60-240 ms: the cell measured a different quantity than it was asked for. A
  deopt inside the region is not a different measurement, it is part of what the
  pattern costs at that size, and deleting it would publish a cost with the
  expensive part removed.
- **There is no threshold to pick.** How many deopts, and how lopsided? Every
  answer is a constant nobody measured, which is the objection this project
  raises against every rule it refuses, and the mistake TC-11 already made once
  with a repetition floor.

**So: recorded, never voided.** The row carries the counts and their phase; rule
13 is the instrument that decides whether a storm mattered, because a storm that
changes the answer shows up as three sweeps that disagree, and a storm that does
not change the answer was never a defect in the measurement. Proposals 1 and 3
stand.

## TC-19 — megamorphic-elements prints a fix nobody at the finding can apply (2026-08-15, partial, proposal)

The bounded source query reports representative class and literal builders
through visible values, factory returns and collection elements. Unknown,
cyclic and exhausted paths are labelled. Zod's issue flow remains cyclic and
locates no builder; date-fns's parser finding links its class definitions.
`--verbose` expands all retained source locations, not the analysis budget.

User trial, 2026-09-07: a fresh Zod source worktree at `5e608851` with only
`prefixIssues` annotated reports 12 declared property sets at
`packages/zod/src/v4/core/util.ts:842`. A caller validating records checked
the paths of invalid name, email, age, score, quota, role, date and active
fields. The finding names the property read at `util.ts:844:5` and directs the
reader to the builders, but names none of the issue creators. It explicitly
says a library caller may need an upstream change. As a Zod caller, I cannot
apply that change through the validation API. Detection and diagnostic checks
pass; a usable caller rewrite and a speedup are not established.
`examples/README.md` records the trial and its megamorphic-only preset.

Found while giving every rule an end-to-end example. `examples/` can only hold a
rule whose printed fix is a change to the function the rule fired on, and this
one never is.

The rule counts declared property sets on a collection and names a read inside
the callee. For a parameter, that callee receives an array already built. The
advice identifies construction as the place to investigate, but the bounded
query does not locate every builder. They can belong to an unknown or cyclic
source path. No verified before/after pair covers Zod's issue construction.

The survey that found it also refutes what README said until today. Extended
from five libraries to twelve — 850 annotated functions — `megamorphic-elements`
fires **ten times, and all ten are one function**: zod's `prefixIssues`, whose
`issues` parameter unions twelve `$ZodRawIssue` types and whose body loads and
mutates `.path` on each element. Nine of the ten are that one site reported from
nine annotated roots that reach it. So the rule is not unfireable, as the
previous survey suggested; it is narrow, and its advice is misaddressed.

Remaining proposals:

1. **Extend collection tracing through mutations and cycles.** The source
   query shares the receiver walk's coalesced origins and budgets; it does not
   enumerate every array write or allocation. A broader query needs an explicit
   coverage model and must not change detection through cache side effects.
2. **Withdraw the rule** on the grounds that a warning nobody at the site can
   act on is not worth a false-positive budget. TC-8 and TC-2 are already open
   against it.

A change to the printed contract, so: **owner signs off before anything ships.**

Reproduce: `node examples/annotate.js tmp/lib-zod/packages/zod/src/v4/core` then
`node bin/jitmax.ts tmp/lib-zod/packages/zod/src/v4/core`.

## TC-13 — a method in a field has no four-map budget (2026-08-14, open, proposal)

`bench/dispatch.jl` split a call site into its two halves and they do not
obey the same rule. With one shape and K different functions in the same slot
(`tgt`), the cost is **7.68–11.93x from the second function to the sixth,
flat** — no threshold anywhere. With K shapes and one shared function (`shr`)
the four-map budget is intact: 2.14–2.21x at four, 6.92–8.25x at five.

`megamorphic-dispatch` ships on five, which is right for a method on a
prototype and **late** for an object carrying its own function: `lit` costs
3.63–6.78x at two shapes and 4.34–13.02x at four, all of it below the threshold
the rule fires at.

Nothing static separates the two. `type T = { area(): number }` is satisfied by
a class instance, whose method is one function on the prototype, and by an
object literal with method shorthand, whose method is a fresh closure per
literal site. The declaration is identical and the runtime layout is opposite.

Two ways forward, neither taken:

- **Fire on a union of two object types whose common member is declared as a
  property of function type** (`area: () => number`) rather than a method
  signature. That syntax is *correlated* with an own-property closure and does
  not determine it, so it would be shipping an inference the benchmark did not
  establish.
- **Observe it at runtime.** This is what a runtime half would be for: a
  call site's targets are observable and its receiver maps are observable, and
  the two together are exactly the decomposition this sweep did by hand.

The static rule stays at five, missing the case rather than guessing at it, and
the rule's own `silent` clause says so.

**V8's source now says the same thing, independently (2026-08-14).** A call
site's feedback slot does not hold maps and has no polymorphic tier at all: it
holds one target function as a weak reference
(`src/builtins/ic-callable.tq:14`), and `CollectCallFeedback` offers exactly
three outcomes — same target, already megamorphic, or uninitialized
(`src/builtins/ic-callable.tq:107-109`). A second, different target goes
straight to the megamorphic sentinel, and the only escape is two closures
sharing one `FeedbackCell`. So the four-map budget the rule's message quotes
governs the *load* of the method, and the *call* has a budget of one. This is
the sweep's `tgt` result predicted from the engine's source, and it raises the
proposal from "measured once on this machine" to "measured, and the mechanism
is in the source". Citations in `README.md`.

## TC-12 — a 6.3x effect nothing static can detect (2026-08-14, open, proposal)

The `bench/addprop.jl` sweep found one large effect: an object whose
properties are added with a **keyed** store past `fast_properties_soft_limit`
goes to dictionary mode, and reading its fields then costs **6.17–6.34x**
(CI 5.94–6.41 and 6.14–6.57). Two controls pin it — the same field count by
named stores costs 0.92–1.05x, and twelve keyed stores cost 1.02–1.04x with the
interval spanning 1.

It is not shipped as a rule, and the owner should decide whether that stands:

- **The count is invisible.** The threshold is 16 keyed adds on a one-field
  object. A rule matching `acc[k] = v` inside a loop cannot know whether the
  loop runs twelve times or sixteen, so it would fire on the case its own
  benchmark rejected. That is TC-9 in a place where the evidence is unusually
  sharp about where the effect is not.
- **The rewrite is unmeasured.** The sweep's baseline is a single object
  literal, which is only writable when the keys are static — and when the keys
  are static nobody writes keyed stores. For the dynamic-key population the
  honest baseline is `Map`, and `Map` was not measured. Shipping the rule would
  mean naming a fix this project has not benchmarked.

Closing it needs a `Map` sweep first, and then a decision about firing on a
count that cannot be proven. `demo/lib.ts` `growByKey` is the fixture and a test
locks it silent.

## TC-11 — the audit (2026-08-14)

**Audited 2026-08-14, every cell this project has ever published.** 329 non-void
cells across ten `.jl` files. **35 ran below 20 repetitions**, and the defect
is systematic rather than scattered: it hits the largest `n` of every sweep,
because a slow kernel fills the 120 ms region with a handful of passes.

Withdrawn, because a low rep count can flip a verdict only where the effect is
small, and every one of these is small:

| Cell | reps | was | now |
|---|---|---|---|
| `shapes-calibrated` incl, n=262144, K=2..5 | 1–2 | 1.08–1.21x | withdrawn; the construction claim is now 1.25–3.52x from the L1 and L2 cells, which ran at 46–15181 |
| `strings` incl and excl, n=100000 | 7–15 | 0.79x, 1.06x | withdrawn; the read-back claim is now 0.94–0.97x |
| `addprop` build and incl, n=262144 | 5–7 | 1.64/0.91/0.89x | already withdrawn when the sweep ran |
| `dispatch` incl, n=262144, ten cells | 2–4 | 0.84–1.79x | already withdrawn when the sweep ran |

Kept, and the reason is stated rather than assumed: a cell whose effect is two
or three orders of magnitude cannot be flipped by a GC pause inside a 120 ms
region. `spread` incl n=10000 ran at **2** repetitions and measured 1877x and
2348x across two sweeps; `spread-object` incl n=500 ran at 10–15 and measured
197x and 210x; `assign-copy` ran at **4** and measured 815x. Their *direction*
and *order of magnitude* stand. Their intervals are narrower than the truth,
because the bootstrap resamples processes at a fixed rep count and cannot see
within-run variance. Anyone quoting those intervals as precision is over-reading
them, and this paragraph is the disclosure.

**Superseded 2026-08-15 by the entry above.** The proposal recorded here was a
repetition floor of 5 with the region extended to a cap of about 1000 ms, voiding
only a cell whose single repetition exceeded the cap. It was signed off, written,
and reverted before it ran: both constants were invented, and the two tables
above are wrong about which cells survive — `strings` and `dispatch` and
`shapes-calibrated` all came back, and `spread-object`'s `assign-copy` moved
*further from* 1.0 rather than closer. The disclosure paragraph about intervals
being "narrower than the truth" is the one thing here that was right, and rule 13
is what replaced it.

The original report follows.

### TC-11 — the original report (2026-08-14)

`bench/driver.js` asserts the achieved timed region lands within 2x of 120 ms.
A kernel slow enough can meet that with 4 to 7 reps, and then a single GC pause
decides the cell. The `addprop` sweep's RAM-sized construction cells are the
demonstration: three near-identical constructions measured 1.64x, 0.91x and
0.89x, every interval excluding 1.0 and no two of them able to be true
together. The bootstrap interval is over process-to-process variation at a fixed
rep count and cannot see that variance.

Those cells are withdrawn by hand in the rule's own evidence. The guard should
do it: a cell
whose rep count is below some floor is not a measurement, the same way a cell
outside the region window is not. The floor is unmeasured — picking it needs a
sweep of its own — so this is recorded rather than applied.

*(That last paragraph is the wrong diagnosis, kept as written. The sentence
after it — that the bootstrap "cannot see that variance" — is the right one, and
it is what the fix acted on.)*

## TC-5 — the driver calibrates from a cold run, and it inflates ratios (2026-08-11, proposal)

`driver.js` `calibrate()` sizes the timed region from one `reps=1` run. For a
kernel whose cold cost is far above its warm cost that undersizes the rep
count — and it undersizes it *worst for the slowest variant*, so the side a
rule wants to indict gets the shortest timed region and therefore the least
warmup dilution. The ratio comes out inflated, in the direction that ships
rules.

Measured on `bench/chained.js`, n=1000, construction included:

| | cold probe (5 repeats) | warm | reps given | timed region |
|---|---|---|---|---|
| fused | 91–128 ns/op | ~2.8 ns/op | 1294 | 14.4 ms |
| chained | 1,000–20,600 ns/op | ~21 ns/op | 11 | **2.4 ms** |

The target is 120 ms (`driver.js`, protocol rule 3). The chained side got
2.4 ms. The cell reported **19.73x, CI 12.42-33.73**; sized from warm cost on
both sides it is roughly **6-11x**. The probe is not merely biased, it is
unstable — a 20x spread across five repeats decides the rep count from one
sample. The `chained-allocation` rule did not ship because of this.

`bench/spread.jl` came out of the same `calibrate()`. Accumulating spread is
quadratic so its 86x and 2343x very likely survive — but "very likely" is not
this project's standard, and its `excl` cells sit near 1.0 where this defect
bites hardest.

Not fixed inline: iterating the calibration changes the method behind every
published figure and requires re-running `spread.jl` and re-deriving both the
published tables and the shipped `EVIDENCE` strings. Proposal: iterate
`calibrate()` until two successive probes agree within 20%, then assert the
achieved region is within 2x of 120 ms and **fail the cell loudly** when it is
not, so a mis-sized cell can never again be published as a result. Then re-run
spread and chained and re-derive both.

## TC-4 — two copies of the measurement protocol (2026-08-11, proposal)

`bench/driver.js` was extracted so the accumulating-spread sweep could reuse the
protocol instead of copying it, but `bench/run.js` still carries its own copy of
`once`, `calibrate`, `bootstrap` and `cell`. Two copies drift, and the whole
claim of this project is that the protocol is one thing.

They are not identical either. The driver calibrates **each side separately**,
because accumulating spread is two orders of magnitude slower than its baseline
and one shared rep count would either run for hours or leave the fast side
unmeasurably short. `run.js` calibrates once, on the baseline.

Not fixed inline, because porting `run.js` onto the driver changes the method
that produced the published `shapes.jl`. That needs the 24-cell sweep re-run
under the new calibration and the published figures re-derived — a redesign,
so it wants sign-off first. Proposal: port `run.js` to the driver, re-run all
24 cells, and keep the old file's output as a third sweep to compare against.

## TC-9 — rules fire outside the conditions their own evidence establishes (2026-08-11, open)

The `EVIDENCE` table records a `silent` condition for every measured rule. No
rule implementation reads it. The boundary is prose next to the code, not a
guard inside it, so three rules fire in conditions their own measurement
excludes.

- **`chained-allocation`** measured 7.13x at n=1000 and 1.45x at n=100000. The
  implementation matches two chained calls and cannot know n, the callback
  cost, or whether the result escapes. It cannot implement its stated boundary,
  and the docs claim it stays silent at large n.
- **`delete-property`** — **this bullet is withdrawn on evidence, 2026-08-15.**
  It said the rule fires on a singleton delete the project had measured at 0x.
  `bench/delete.jl` measures that exact case at 13.32-15.57x, in all nine of its
  sweeps, so `drop` is a true positive and the boundary the bullet invoked does
  not exist. See TC-15. What the rule still carries under this heading is
  narrower and was not the original complaint: the cost is per property *load*
  on the demoted object, and the rule fires on the `delete` without knowing
  whether anything reads the object afterwards.
- **`megamorphic-elements`** is TC-8, the same defect in its sharpest form.
- **`boxed-elements`** was a fourth entry here by way of TC-14 and is gone with
  the rule, 2026-08-15.

**And `closed-world` has no evidence at all.** `EVIDENCE` has five entries;
`closed-world` is not among them, so its findings carry `evidence: null`. It
still counts toward the finding total and still drives exit code 1. The README
and the onepager both claimed "every rule carries the benchmark that earned
it", which was false for one rule in six. The claim has been corrected; the
rule has not.

Found by a commissioned adversarial teardown, all four points verified
here against the code and the demo output.

Proposal: either give each rule a machine-checked precondition matching its
`silent` field, or restate the rules as heuristics whose evidence bounds the
*worst* case rather than the fired case. The second is honest and cheap; the
first is what the project's own marketing implies.

**2026-08-28 — a third proposal from the owner, and it is the cheapest of the
three: take the numbers out of the findings.** A finding prints the mechanism
and the fix. The cost lives in README.md and in `bench/`, reached by rule name.
Then no rule states a cost at a site whose size and shape it cannot see, and the
whole class of defect this entry describes stops existing — not by bounding the
claim, but by not making it where it cannot be supported. `EVIDENCE` still binds
each rule to its measurement, which is what CLAUDE.md's "two evidences" asks
for; only the print site moves.

This also answers the objection that the rules should simply fire. They should.
A rule fires on a pattern the author asked to be warned about — `/**
@jitmax */` is the author asserting the function is hot, so "the rule
cannot know this runs often" is void, the author said so. What the annotation
does not supply is the data size, which is why the *number* cannot ride along:
7.13x at n=1000 and 1.45x at n=100000 is a property of the input. Drop the
number and the rule is free to fire on the pattern alone.

Supersedes the "up to Nx" wording discussed the same day; that keeps a number at
a site that cannot support one. Recorded as direction, not sign-off.

**Shipped the same day.** Verified by running the tool: a `delete-property`
finding now prints the mechanism, the fix, the bench file by name and the known
defect, and no ratio. The report closes with the reasoning rather than the
number — "a ratio is a property of the input, and the annotation says this
function is hot, not how large its data is". One finding is 840 bytes. Mark this
entry ✅ FIXED for the cost-claim half and fill the SHA when it lands; what
remains open under TC-9 is TC-8's family, where the FINDING and not the number
is wrong.

## TC-2 — a TypeScript union member is not a V8 map (2026-08-10, partial)

`megamorphic-elements` infers "five maps at this load site" from "five members
in the element union". Those are different claims. Five members built by one
factory can share fewer maps; one declared type built two ways can be two maps.

Partially addressed: the finding now says "unions N object types", states the
four-map mechanism, and leaves the judgement to the reader. The rule can still
fire where no load site ever sees five maps. The real fix belongs to a runtime
half this project does not have — one that observes the maps instead of
inferring them.

Found by: codex round 5, which argued for downgrading or deleting the rule.

## TC-3 — no rule for functions V8 refuses to optimize (2026-08-10, open)

Measured on this machine: a function of 3455 generated statements reaches
Maglev; 3456 is never optimized at all, and stays unoptimized at 3,000,000
invocations, so it is a hard limit and not a tier-up budget artifact. Cost is
2.74x per statement across that one-statement edge (3.822 vs 10.484 ns).

No rule ships, because source statements are a poor proxy for bytecode size and
the mapping is unmeasured. `bench/optsize.ts` reproduces it.
