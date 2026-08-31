# Changelog

## [v0.11.0] — 20260831

> jitmax v0.11.0 — the loud rule splits in two
>
> Calls through an interface are their own rule now, so silencing them no longer silences the honest "no body anywhere" warning.
>
> • `interface-dispatch` — 96.7% of survey findings leave `closed-world`, and each rule is suppressible on its own.
> • Findings name the implementations that reach a receiver, traced by dataflow, instead of guessing from the type.
> • A run that could not read every module exits 1 — a blind run never reports clean again.
> • Eight rules, 123 tests, and two crashes on legal source fixed.
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
- `make test` holds both published surfaces to `package.json`'s version and to
  the rule register — README already claimed seven rules in one sentence and
  eight in another.

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

### Data

- `bench/tiers.jl` gains the tier diagnostic over every published cell, re-run at
  the rep counts each cell was published at. Recorded, never gated on.
- Two sweeps completed and neither earns a rule; both are published as the
  refutations they are.
