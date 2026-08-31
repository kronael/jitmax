# TODO

Forward-looking work. Bugs live in `BUGS.md`; this file is what the tool does
not do yet.

## v2 — auto mode: severity from the code, not from the rule

Every rule is `error` today and the user tunes with `[rules]` and per-function
`-rulename`. That makes severity a property of the RULE. It should be a
property of the FUNCTION: a spread in a loop inside a request handler that
awaits a database is not worth failing a build over, and the same spread in a
parser is.

Two halves:

- **Stay quiet in I/O-bound code.** A function whose work is dominated by
  `await`, or whose body is a chain of calls into `fs`/`net`/`fetch`/a driver,
  spends its time waiting. A JIT finding there is noise no matter how large the
  ratio, and reporting it is how a tool teaches people to ignore it.
- **Decide error vs warn from measured hotness.** Profile mode already answers
  this WITH measurement: `jitmax run.cpuprofile src` marks every function at or
  above `[profile] min_self_pct` of sampled self time. Auto mode is the static
  approximation of that same question, for users with no profile to hand.

**The problem to solve before shipping it.** This repo's first rule is that a
constant in V8's source is a hypothesis until a benchmark makes it a rule. An
`await` in a body is likewise a hypothesis about where time goes. Auto mode is
a heuristic, and a heuristic that silences findings is the most dangerous kind
— a false negative here is invisible by construction. So it ships either with
evidence that the classification agrees with profiles on real code, or it ships
saying plainly that it guessed and how. Never silently.

Profile mode is the honest version and already exists. Auto mode is the
convenience, and it is worth having only if it can be held to the same standard.

## Next — `lib/flow.ts`: closures become functions, because they are testable then

`createFlow` is ONE function of 955 lines holding 51 closures. Nothing inside it
can be tested in isolation, which is why both provenance bugs (TC-94, TC-101)
lived in it undetected and why `elementFlow` had to be added BESIDE it rather
than inside it.

Measured, not guessed — 27 of the 51 units, **556 lines, are already pure**.
They capture only `ts`, `checker` or `program`, which are module handles and
not state:

`compute` 64, `paramFlow` 64, `symbolFlow` 44, `memberValueInner` 42,
`ctorArgFlow` 39, `readProperty` 34, `literalPropertyInner` 32, `elementsOf` 28,
`thisFlow` 23, `originOf` 21, `argAt` 19, `bindingFlow` 19, `childrenOf` 18,
`subclassesOf` 18, `carries` 15, `merge` 12, `declsOf` 9, `emptyRes` 9,
`literalShape` 8, `where` 7, `sameProperty` 6, `propRead` 6, `unknown` 5,
`hasSpread` 5, `bodyOf` 5, `strip` 2, `className` 2.

The other 24 units (399 lines) hold real state: ten cache/function pairs plus
`index`.

**Two moves. The first is mechanical and nearly risk-free.**

1. **Hoist the 27 pure units to module scope**, taking `ts` / `checker` /
   `program` as explicit parameters. Behaviour-identical. It makes 556 lines
   unit-testable, including every walker that has produced a bug.
2. **Make each cache pair a small factory** — `makeTargets(ts, checker)` returns
   the memoized function — so each is constructible in a test. `createFlow`
   shrinks to wiring.

The point is not tidiness. A pure function that cannot be called from a test is
a function whose behaviour is only ever observed through the whole pipeline, and
that is exactly how `isElement` shipped as `t === element` for months.
