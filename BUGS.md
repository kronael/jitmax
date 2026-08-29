# BUGS

Review queue. Found during audits, fixed only when the owner asks.

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

## TC-70 — a derived count is interpolated into prose that assumes it is plural (2026-08-28, FIXED 2026-08-29)

`closed-world`'s source string renders "bench/inline.jl, 1 cells, 20 pairs
each". The numeral is derived, correctly — `N['inline.cells']` is 1 because that
sweep has one cell — and the word beside it is hand-written and fixed. Every
`EVIDENCE` string that says "N cells" has the same shape and will read wrongly
the moment rule 13 withdraws a sweep down to one.

It is cosmetic, and it is in published output: README's rules section quotes
these strings.

**Proposal:** a `plural()` in the interpolation, or phrase the sentences so the
count never precedes a bare noun. `lib/report.ts` already has a `plural()`;
`lib/rules.ts` would need it too, which is one import and no new mechanism.

**FIXED 2026-08-29.** A `cells()` helper in `lib/rules.ts` agrees the noun with
the derived numeral, and a test walks every `EVIDENCE` string for `N cell(s)`
and fails when the two disagree — so the next sweep rule 13 withdraws down to
one cell cannot reintroduce it.

Found 2026-08-28 while reading the strings for TC-48.

## TC-70 — the builtin list should be derived from V8, not written by hand (2026-08-29, open, proposal)

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

## TC-69 — closed-world cannot see through an interface-typed callee, so it is loudest on the best-abstracted code (2026-08-28, partly fixed 2026-08-28 — named, not followed)

`@noble/curves`, 26 files: **2,113 warnings against 2 errors**. The top callees:

    235  Fp.mul
    132  Fp.add
    113  Fp2.mul
    105  pow2
     85  Fp2.add
     73  mod

None of these is a builtin and none is a missing dependency. They are the
library's OWN functions, in the same checkout, with bodies the walk could read.
They are unresolvable because they are reached through a property of an
interface-typed value — `Fp` is a field object whose operations are declared
members — so the symbol resolves to a signature and not to an implementation.

This is a third distinct cause behind one rule: TC-51 is a missing
`npm install`, TC-55 is a native builtin, and this is ordinary interface
dispatch. The consequence is the worst of the three, because the pattern it
punishes is good design. A hot library that abstracts its field arithmetic
behind an interface gets 2,113 notes; one that inlines everything into
free functions gets none. The tool is loudest exactly where the code is best
organised, which inverts what a user expects from it.

It also compounds TC-62: 2,113 warnings come from 244 distinct callees, so each
is repeated about nine times.

**Proposal:** before reporting an unresolved callee, try the declaration. When
the callee's symbol has a declared type whose implementations are visible in the
program — one concrete class, or one object literal assigned to that interface —
follow it and keep walking. When more than one implementation exists, that is a
dispatch site with real map variety and belongs to `megamorphic-dispatch`
(TC-61), not to `closed-world`. Report `closed-world` only for what remains:
a callee with no reachable implementation at all.

That splits one flooding rule into two answers that are each actionable, and it
reuses the shape-counting `megamorphic-dispatch` already does.

**2026-08-29 — the three causes want three different answers, and only one of
them is a rule change.**

**1. A native builtin: report nothing. The reason is not that it is fast.**
`path.join` being quick is the wrong justification — `Array.prototype.sort`, the
regex methods and `JSON.parse` are real cost centres and they are builtins too.
The reason is narrower and it holds for all of them: a builtin's body is C++ or
Torque, so it CANNOT contain any pattern these rules match, and the advice
"inline what you need from `path.join`" is not actionable by anyone. A note that
can neither fire a rule nor be acted on is not a note. If the project ever wants
"an expensive builtin in a hot loop", that is a different rule with its own
benchmark, and it would name the specific builtins it measured.

**2. An unresolved import: keep it, but say it once.** This is the honest half
of the rule. The walk really is incomplete, over code that really could contain
findings, and the cause is a missing `npm install` rather than anything in the
source. TC-51 already has the shape: one line per RUN, not one per site, exiting
non-zero with `DEPENDENCIES MISSING`.

**3. Interface dispatch: this is the one to solve, and solving it produces
findings rather than removing them.** At an interface-typed callee, enumerate
every type assignable to that interface in the program and count distinct
property sets — the counting `megamorphic-dispatch` already implements:

- **one implementation** — follow it and keep walking. Not an escape at all, and
  the rules then run over a body they currently never see.
- **two to four** — polymorphic, inside V8's four-map budget. A note at most.
- **five or more** — this IS a megamorphic dispatch site. Emit a
  `megamorphic-dispatch` finding, with the benchmark that rule already carries.

**The name of the rule is the assumption it needs.** This is sound only for a
closed program. A library that exports the interface can be implemented by a
consumer no checkout here contains, so the count is a LOWER bound and the tool
must print which assumption it made rather than pretend the enumeration is
complete. Two further limits, both already this queue's oldest lesson: TypeScript
is structurally typed, so assignability has to be tested against every object
literal and class rather than read off `implements` clauses; and implementations
are still not maps, so two structurally identical classes with different
prototypes are two maps and this counting under-counts them exactly as TC-60
under-counts typed arrays.

**2026-08-29 — correction to 3, from the owner: count what REACHES the site, not
what could fit the interface.** Enumerating every type assignable to an
interface is the wrong question and it over-counts badly, because TypeScript is
structural: dozens of shapes in a checkout satisfy a two-method interface while
never going anywhere near this call. The right question is a dataflow one — walk
the call graph and count the shapes that ACTUALLY arrive at this receiver.

From the call site, walk back: the receiver is a parameter, so look at every
call site of the enclosing function; each argument is a local, a field or
another parameter, so follow it to an allocation — an object literal, a `new`,
a factory return. Propagate to a fixpoint. What lands is the set of allocation
sites that can reach this receiver, and their distinct property sets are the
count. This is ordinary 0-CFA, it is well understood, and the AST plus the
checker have everything it needs.

**It is more precise in the direction that matters.** In `@noble/curves` the
`Fp` reaching each site is built at ONE place. Flow analysis resolves to one
implementation, the walk continues into it, and 2,113 warnings become zero
warnings plus a deeper walk. Structural enumeration would have found every
shape with a `mul` and declared the site megamorphic — a false finding where
this gives a true silence.

**And the annotation makes it bounded.** The analysis is rooted at the
annotated function, not whole-program: the only receivers that matter are the
ones inside that tree. That is the difference between a research-scale points-to
analysis and something a checker can run per invocation.

**The honest boundary moves but does not disappear.** A value with no visible
allocation — from `JSON.parse`, a network response, a callback a consumer
registers — has no site to count. One such source makes the count a lower bound,
and the tool must say the receiver has an unknown origin rather than report a
number it cannot stand behind. That is the same statement `closed-world` exists
to make, now made about a value instead of about a call.

**One mechanism, two rules.** Counting the allocation sites that reach a load
site IS the analysis TC-67 needs for split-construction — there the question is
whether the literals reaching one property access disagree on keys or order.
Build it once and both rules follow. That makes this the single highest-leverage
piece of machinery on the queue.

Doing 1 and 2 removes almost all of the 78,346 warnings in TC-64. Doing 3 turns
what is left into either silence or the tool's best-evidenced rule.

Found 2026-08-28 in the TC-64 survey.

**Partly fixed 2026-08-28 in 100f22f: the cause is named, the implementation is
not followed.** An escape whose callee resolves to an interface member declared
in this program's own source now says so, and its fix line no longer tells the
author to inline the abstraction — it says to check the implementations or
narrow the value at the call. The three causes are now distinguishable in the
output: platform (counted, TC-55), missing dependency (TC-51), interface
dispatch (this).

Following the implementation when exactly one is visible is NOT shipped. It
needs a program-wide index of what is assigned to each interface, it is wrong
whenever a second implementation exists in a file the walk did not reach, and
getting it wrong means the walk silently claims coverage it does not have —
which is worse than the flood. It stays a proposal.

What did land beside it is TC-45's half: the escape test used to require the
callee to be types-only or unresolvable, so an interface member fell through
both branches and was never reported at all. The tool was silent about it, not
loud. It is now reported, which widens the output and is the honest direction.

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

## TC-63 — delete-property fires on process.env, which is not a JS object with a map (2026-08-28, FIXED 2026-08-28)

`openclaw/src/gateway` produced 18 findings of this form:

    delete process.env.OPENCLAW_GATEWAY_TOKEN puts its object in dictionary mode

`process.env` is not a plain object. Node implements it with a V8 named-property
interceptor — the get, set and delete are C++ callbacks that reach `getenv` and
`unsetenv`. It has no hidden class to demote, so there is no dictionary-mode
transition, and `bench/delete.jl`'s per-property-load cost prices something that
cannot happen here. The finding is not merely mis-sized, as in TC-9; the
mechanism it names does not exist at this site.

The sites are also test setup and process bootstrap, run once — but that is the
weaker complaint and it depends on the annotation, which was mechanical here.
The mechanism claim is wrong regardless of hotness.

**This is a class, not one host object.** `process.env` is the common case;
`globalThis`, a DOM node, and any object reached through a `Proxy` share the
property that a JS-level `delete` does not transition a JS map. The rule already
narrowed itself once on exactly this kind of ground — TC-36 took arrays out
because deleting an element is a different representation in a different part of
V8.

**Proposal:** exclude a `delete` whose target resolves to a known host object.
`process.env` is reachable by symbol — its declared type is
`ProcessEnv`/`Dict<string>` from `@types/node` — which is the same
`lib.*.d.ts`-versus-application test TC-55 proposes for `closed-world`. One
classification helper serves both rules, which is a reason to build it once
rather than twice.

**FIXED 2026-08-28 in 0b8b784.** A `delete` whose target's type is declared in
`@types/node` or in `lib.dom.*` is not reported. NOT any `lib.*.d.ts`: `Record`,
`Object` and `Array` are declared in `lib.es5.d.ts` and describe ordinary
objects with real maps, and the first attempt at this test silenced
`delete o[k]` on a `Record<string, number>` — the exact program
`bench/delete.jl` measured. That regression is why the fixture
`clearToken` sits beside `drop` in `demo/lib.ts` rather than replacing it.

Found 2026-08-28 in the TC-64 survey.

## TC-62 — findings are counted per reaching caller, not per site (2026-08-28, FIXED 2026-08-28)

The headline count, and the exit code behind it, overstate the work by the
call-graph fan-in. Running over `agent-twitter-client` (see the survey in
TC-61):

    jitmax — 128 annotated functions, 118 errors, 729 warnings

There are **12** distinct source lines behind those 118 errors.
`src/timeline-tweet-util.ts:20` is reported **28 times**, once for every
annotated function whose walk reaches it. Three lines in `timeline-v2.ts` are
reported 26 times each. The other corpora show the same shape at lower
multiples: `ajv` 63 findings over 19 lines, `zod` 26 over 17.

TC-51 noticed this for `closed-world` — "once per annotated function that
reaches it" — and read it as that rule's problem. It is not: it is how every
finding is counted, and `closed-world` only made it visible first because it
fires most.

**FIXED 2026-08-28 in 0b8b784 and 100f22f, as proposed.** Findings are
deduplicated by (rule, file, line, column) before counting and before rendering,
kept under the first annotated function that reaches them, and the fan-in is
printed on the finding — `…/parser.ts:837 — reached by 4 annotated functions` —
because a line reached by 28 callers is a better fix than one reached by one.
The repeats are counted in one line rather than dropped silently. The TypeScript
compiler went from 90 errors and 677 warnings to 24 and 77, with 666 repeats
collapsed.

A reader sees 118 problems and there are 12. That is the number the tool leads
with, so it is the number that decides whether anyone keeps running it.

**Proposal:** deduplicate findings by site — file, line, rule — before counting
and before rendering. Keep the fan-in as a field on the finding and print it,
because it is real information: a line reached by 28 annotated callers is a
better fix than one reached by one. The render becomes
`src/timeline-tweet-util.ts:20 — reached by 28 annotated functions`. The exit
code then reads a count of sites rather than a count of paths.

**Confirmed at scale on a second corpus.** `openclaw/src/gateway`, 208 files:
247 errors from **54** distinct (rule, site) pairs. `accumulating-spread`
produced **18 findings from ONE line**, `openresponses-http.ts:405`.
`delete-property` produced 101 findings from 31 sites, with
`server-chat.ts:527` and `:528` reported 28 times each. The inflation is not a
long tail — it is a handful of shared helpers multiplied by their callers.

Found 2026-08-28 in the TC-61 survey.

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

## TC-57 — whole-codebase mode: measure hotness, do not infer it (2026-08-28, profile half SHIPPED 2026-08-28)

The owner asked for a mode that runs over a whole codebase with no annotations,
identifies the hot paths itself, reports findings only there, and hides the rest
as noise — "non-io paths which it would then report and hide the others".

**Static hotness inference should not ship.** Hotness is a property of the
workload, which is the doctrine this tool prints under every run. The available
signals do not carry it: a loop with a non-literal trip count is cheap to detect
and weakly predictive; call-graph fan-in needs a reverse graph whose edges
through parameters and interface methods already vanish (TC-31), so it is wrong
exactly in higher-order code; recursion predicts nearly nothing. `tomlValue`
loops over every config key and runs once.

**The non-IO proxy is half right, and worth keeping as the half that works.** As
a NEGATIVE signal it holds: an `await` or a sync syscall in a loop body means
the loop is latency-bound and any V8 finding inside it is noise. As a POSITIVE
signal it fails — cold pure code is everywhere, and `tomlValue` is the owner's
own example of it. Purity and hotness are orthogonal.

**It also does not fix the case that motivated it.** In the TC-56 run all 157
warnings were `closed-world` on `fs` and `path` builtins, which TC-55 removes
with no hotness model at all, and all 6 errors were `chained-allocation` whose
real defect is literal-small n (TC-54). Both cheaper fixes are already on file.

**Recommended instead: ingest a real profile.** `--cpu-prof` measures hotness
rather than guessing it, which is the standard this project holds every rule to,
and the same standard TC-50 charges oxlint and Biome with failing.

- Trigger: another suffix-named positional, since `bin/jitmax.ts` rejects flags
  by design — `jitmax jitmax.toml run.cpuprofile src`.
- Parse `nodes`/`samples`/`timeDeltas`; aggregate self time per
  `file:line:column`; add `marksFromProfile()` beside `findMarks()` in
  `lib/scan.ts`, synthesizing a `Mark` per function over a
  `[profile] min_self_pct` threshold. `reach()`, `check()` and `render()` are
  untouched, and findings gate exactly as annotated ones do.
- Node >= 22.18 type stripping preserves positions, so cpuprofile callFrame
  line/column lands on the TS AST with no source maps.
- `Mark` carries provenance: the header reads `name() — 34% of samples,
  run.cpuprofile`.
- Failures stay loud: a hot frame matching no function-like node is counted and
  printed; zero matches is exit 2, because that means the profile is stale
  against edited source.

**The owner's stated aim changes the weighting and belongs in this entry.** The
intended consumer is not only a human reading a report — it is a model writing
code, so that what it writes optimizes to good machine code. That consumer has
no profile yet, because the code is being written. It also inverts the
precision economics: a false positive costs a human their attention, and costs a
generator only the choice of the other form. If that consumer is primary, the
profile mode serves the human half and a `suggest` mode serves the writing half:
rank candidates and emit proposed `@jitmax` sites for confirmation, so the
hotness assertion still comes from something that knows the workload rather than
from the tool. What must NOT happen either way is an inferred hotness wearing
the word "finding".

**Validate before shipping:** profile a workload with a known kernel and assert
the kernel is marked while the startup parser is not; re-run the TC-56 corpus
under a real workload and assert the six cold `chained-allocation` errors drop;
pin cpuprofile columns against the AST under type stripping. Open: ~1 ms
sampling undersamples short-lived hot functions, and `min_self_pct` is a
constant nobody has measured — print it on every run and let the TOML own it.

Raised 2026-08-28.

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

## TC-55 — closed-world reports Node builtins, which will never have a body (2026-08-28, FIXED 2026-08-28)

157 of the 157 warnings in the TC-56 run are `closed-world` naming a standard
library or host callee:

    33  path.join
    16  fs.readFileSync
    12  fs.renameSync
    11  fs.readdirSync
     8  fs.unlinkSync
     7  new TextEncoder().encode
     5  fs.writeFileSync

The advice reads "inline what you need from `path.join`". Nobody will, and
nobody should. This is TC-51's shape with a different cause: there the callee
had no body because the package was not installed, and `npm install` fixes it;
here the callee has no body because it is native, and nothing fixes it. The
`Evidence.severity: 'warn'` flag, read by `severity()` in `lib/report.ts`, keeps these
out of the exit code, so the damage is noise rather than a false gate — but 157 notes with no action is what makes a tool get turned
off.

**Proposal:** classify an unresolved callee before reporting it. A symbol whose
declaration resolves into `lib.*.d.ts` or `@types/node` is a host builtin: count
it once per run as "N calls into the platform" and print no per-site note. Keep
the per-site note for a callee that is genuinely opaque application code, which
is the case `bench/inline.jl` measured.

**FIXED 2026-08-28 in 6b07d5e, as proposed.** A callee declared under
`@types/node` is counted on `Mark.platform` and never listed; `lib.*.d.ts` was
already excluded. The report prints one line for the whole run. Across the
22-codebase survey this removed 650 notes — es-toolkit alone had 101 — and the
`closed-world` share moved from 97.0% to 96.9% because the notes it removed were
the ones nobody could act on.

## TC-54 — chained-allocation fires where n is a literal in the chain itself (2026-08-28, FIXED 2026-08-28)

The rule reported this line:

```ts
const lines = findings
  .slice(0, 10)
  .map((f) => `  ${f.severity} ${f.patternId} (line ${f.line}): …`);
```

The intermediate array is ten elements. `bench/chained.jl` measured 1.44-1.52x
at n=1000; at n=10 the allocation it asks you to remove is not measurable, and
the rewrite costs readability for nothing.

**This is not TC-9.** TC-9 says the rule cannot know n, and for a bare
`xs.filter(f).map(g)` that is true. Here n is written in the chain, as an
integer literal argument to a call the rule already matched. The rule walks over
it and does not read it.

**Proposal:** when a stage in the matched chain bounds the result to a literal
count — `.slice(a, b)` with numeric literals, `.slice(-k)`, a literal-length
array — compare that bound against the smallest n the rule's own evidence
covers, and stay silent below it. This is the first case where a rule CAN
implement its `silent` field cheaply and does not, which makes it the concrete
half of TC-9 rather than another instance of it.

**Sized 2026-08-28, and it is rare.** Of 99 distinct `chained-allocation` sites
across the TC-64 corpora, **0** carry a literal bound within two lines of the
chain. The `.slice(0, 10)` case that raised this entry is real but is one site
in one file. Fix it because it is cheap and correct, not because it is common.

No prior art found: searching oxlint, Biome and the e18e plugin turns up
intermediate-allocation rules (`prefer-array-from-map`) but none that suppresses
on a statically known small size. If this ships it is new.

Found 2026-08-28, running the tool over 67 files of third-party and application
code (TC-56).

**FIXED 2026-08-28 in 6b07d5e.** `.slice(a, b)` and `.slice(-k)` with integer
literals bound the chain; below `chained.n.min` the rule stays silent. The
threshold is a new citation derived from the sweep by `make numbers`, so
re-measuring at a different size moves the rule with its data instead of leaving
a constant behind. It changed nothing in the 22-codebase survey — no chain there
carries a literal bound — so the whole of its effect is the case that found it.

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

## TC-51 — closed-world drowns a real checkout that has no node_modules (2026-08-21, open)

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

Found by: running the tool on typescript-eslint, 2026-08-21.

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

## TC-48 — hand-typed integers in EVIDENCE contradict the derived numbers beside them (2026-08-19, open)

`make numbers` derives every ratio, and `make test` binds them. It binds no
other numeral, so integers typed into the same sentences drift against the
ratios they sit next to:

- `megamorphic-elements.source` said "the same 24 cells" while
  `N['elem.cells']` in the same sentence rendered `20`, because four cells are
  withdrawn. **Fixed today** by removing the numeral.
- `accumulating-spread.silent` said "every one of those nine cells" with one of
  the nine withdrawn. **Fixed today**, same way.
- `delete-property.cost` still says "(n=16384 and n=262144, three replications
  each)" while the n=262144 cell is withdrawn and excluded from the number it
  introduces.

**Proposal:** derive the counts, or assert that no `EVIDENCE` string contains a
bare integer that is not part of an `n=` size.

**Last bullet FIXED 2026-08-28.** `delete.rows.sizes` is a citation with a
`sizes` aggregation over the cells that still replicate; it renders `n=16384`,
which is one of the two the sentence used to claim. The general assertion is NOT
shipped: by the time a test sees an `EVIDENCE` string the derived values are
already interpolated into it, so "typed" and "derived" are indistinguishable
there, and a test that flagged every bare integer would flag every derived one
too. Deriving each count as it is found is the shape that works.

## TC-47 — every published `select` number rests on rows whose recorded load is false (2026-08-19, open)

All 18 `runner: "r2"` rows in `bench/select.jl` carry no top-level `load1`. They
carry `load1: 0.97` frozen inside `env` — the identical value on every row,
which is the failure `bench/env.js` documents as fixed: *"a recorded environment
that is false is worse than none"*. `RUNNER` was not bumped, so `lib/derive.ts`
accepts them and `select.jl` sits in `REMEASURED`.

`allocating-select`'s entire cost line rests on those rows. The fix is to
re-measure the sweep; it is six cells.

## ✅ FIXED 2026-08-20 — TC-46 — the load gate is inoperative, and 592 published rows were written above it (2026-08-19)

Fixed by reworking the gate, not the corpus — no sweep re-run, no `.jl` touched,
no published number moved. Four parts:

1. **The gate's observable changed.** It counted the one-minute load average, a
   window dominated by the sweep's own previous children — an idle two-core
   machine read ~1.5 against a gate of 1 and tripped over itself, and when it
   did not trip the number could not separate a tenant from the harness (TC-25).
   `bench/env.js` now counts **runnable threads outside the harness, right
   now**: the instantaneous runnable count in `/proc/loadavg`, median of five
   samples 100ms apart, this process subtracted — which subtracts the whole
   harness, because the driver's children are dead whenever the gate reads. The
   threshold stays `nproc - 1`, now compared against the thing it was always
   meant to bound. Model stated in `bench/env.js` and CLAUDE.md rule 9.
2. **The tier diagnostic is out of the evidence run.** `bench/run.js` called
   `tierPair` per row, on by default, spawning unpinned `--trace-opt` children
   mid-sweep against protocol rule 8. The per-row path is deleted — `make
   tiers` / `bench/tiers.jl` was already the same diagnostic at the same rep
   counts, so the duplicate path is consolidated into it, not preserved. Rows
   already carrying `tierBase`/`tierTest` keep them; new rows never will.
3. **The gate re-checks between the whole sweeps of a replicated cell**, not
   only between cells: `replicate()` takes a `between` hook the runner points at
   the gate. A trip stops after the finished sweep was written; resume runs the
   rest.
4. **A violation is visible in the data and in `make test`.** Every row now
   records `runnable` as it is written, next to `env.maxRunnable` — a
   comparable pair, which `load1`/`maxLoad` never was. `lib/derive.ts:overGate`
   counts rows over their own recorded gate (new pair where present, old pair
   otherwise), and `test/check.test.ts` holds the register in rule 13's shape:
   592 rows across 11 files, a NEW over-gate row fails the build, and a count
   that shrinks fails it too, because appended rows never disappear.

The rows stay published. The old pair cannot say which of the 592 had a real
tenant behind the harness — that inseparability is the defect — so withdrawing
them is a judgement about the corpus the register makes visible without making.

What this entry undercounted, found while building the register: the table
below lists 8 files summing to 522, but the corpus holds 592 over-gate rows —
it omits `shapes-calibrated.jl` (64/72), `inline.jl` (4/6) and `addprop.jl`
(2/2). And the worst observed is `load1` **5.66** (`shapes-calibrated.jl`), not
4.32; within the 8 listed files, 4.47.

The record as filed:

`bench/env.js` sets `MAX_LOAD = CORES - 1`, and this machine reports 2 cores, so
the gate is 1. Rows written while their own recorded `load1` exceeded their own
recorded `maxLoad`:

| file | rows over gate |
|---|---|
| `dispatch.jl` | 205/240 |
| `strings.jl` | 67/81 |
| `chained.jl` | 58/72 |
| `shape-sets.jl` | 57/72 |
| `delete.jl` | 46/48 |
| `example.jl` | 45/48 |
| `spread-object.jl` | 23/24 |
| `spread.jl` | 21/24 |

Two causes, and the first is the harness itself. The gate is checked before each
cell and never between the three sweeps of a replicated one; the pinned measured
child contributes about 1.0 to the load average by itself; and `bench/tiers.js`
spawns four **unpinned** `--trace-opt` children per row, during the sweep that
CLAUDE.md says nothing else may run during. Nothing in `lib/derive.ts` or `make
test` ever reads `load1`, so no published number knows what it was measured
under.

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

## TC-42 — the flagship rule cannot detect what its own benchmark measured (2026-08-17, FIXED 2026-08-19)

**The most serious entry in this file.** Both directions were re-run here.

`bench/shapes.js` says what it builds, in its own comment:

> Five key orders. Same three fields, same object size, five distinct maps — so
> the only thing that varies across variants is shape count.

    (x, y, z) => ({ x, y, z }),  (x, y, z) => ({ x, z, y }),  (x, y, z) => ({ y, x, z }), …

**Key order is not part of a TypeScript type.** All five builders have the type
`{ x: number; y: number; z: number }`. So the measured program has ONE
TypeScript type and FIVE V8 maps, and `megamorphic-elements` triggers on the
count of union MEMBERS — which is 1 there.

Verified with `--allow-natives-syntax` on this machine:

    five aliases of one type share one map:              true
    five discriminated-union variants share one map:     true
    five KEY ORDERS share one map:                       false

**Direction A — silent on its own kernel.** `bench/shapes.js` transliterated to
TypeScript with its construction sites intact:

    jitmax — 1 annotated function, 0 findings
      every annotated function is clean.

**Direction B — fires where V8 has one map.** Five *aliases* of one identical
type, `type P1..P5 = { x: number; y: number }`:

    megamorphic-elements
      ps unions 5 object types; V8 caches four maps per load site …

The reviewer went further and measured the fired case with this project's own
`bench/driver.js` and `cellOrVoid`: the key-order control reproduced 10.787x at
L1 while five union members read **0.898x [0.793-1.009]** — and their
replications read 0.975 / 1.100 / 1.008 at n=256, which protocol rule 6 rejects
outright, and 0.961 / 1.139 / 1.210 at n=16384, which rule 13 withdraws. Those
cells were measured under load above the gate and are not evidence-grade; they
are recorded here as a reason to run the cell properly, not as a published
number. **The direction they point is not in doubt, because the map identity
above is not a measurement — it is what V8 reports.**

**And the printed fix is a rename.** "Get the element type to four shapes or
fewer" is satisfied by deleting `P5` and writing `P1` in its place:
`(P1|P2|P3|P4|P1)` — identical emitted JavaScript, `0 findings`, exit 0.

`megamorphic-dispatch` has the same defect in its own form: one class with five
phantom generic instantiations fires at 14.6-20.0x, and at runtime the five
instances share one map AND one call target.

This is not TC-2 ("a TypeScript union member is not a V8 map", filed as a known
imprecision) and not TC-8. TC-2 records the gap as an inference limit and says
the fix "belongs to a runtime half this project does not have". That excuse does
not survive the two commonest false-positive classes here: repeated aliases and
same-key-set discriminated unions are both killable by comparing the members'
property-name lists, which `checker` already has.

**Proposal, and it decides whether the rule ships at all:**

1. Compare member property-name lists and stay silent when they match. Kills the
   two false-positive classes above; does nothing for direction A.
2. Re-measure the cell with five variants that differ the way the RULE detects —
   different property sets — and publish that number instead. If it reads ~1.0x,
   the rule has no evidence and should be withdrawn the way `boxed-elements`
   was.
3. Withdraw the rule now and reinstate it if (2) finds an effect.

Until one of those happens the page must not print `4.4-11.5x` beside a
description of what this rule detects. **The page is corrected as of this
entry.**

**Proposal 1 shipped 2026-08-19.** `objectShapes` counts distinct property-name
sets, not union members. Five aliases of one type answer 1, so do five
discriminated-union variants over one key set, and both are demo fixtures with a
test each. The printed finding says "reaches this line as N distinct property
sets" and the fix line says a rename does not merge two shapes — the old wording
could be satisfied by deleting `P5` and writing `P1`. `megamorphic-dispatch`
counts the same way, which closes its half of this entry too.

**Proposal 2 ran, and the rule keeps its number.** `bench/shape-sets.js` is
`bench/shapes.js` with the five key ORDERS replaced by five key SETS — the
shapes a TypeScript type can express and this rule counts. 24 cells, both modes,
three sizes, three whole sweeps each, 53m36s, no void cells. Reads only, five
property sets against one:

| size | three sweeps |
|---|---|
| L1 | 10.78 / 11.35 / 11.00 |
| L2 | 9.09 / 8.96 / 8.51 |
| L3 | 4.04 / 4.12 / 3.37 |

All three replicate. Two to four sets read `0.95-1.47x` across every size, so the
threshold really is at the fifth and it is not an artefact of key order. The
rule's `cost` is now `3.4-11.3x` from `bench/shape-sets.jl`, its `silent` clause
is `0.95-1.47x` from the same file, and `elem.cells` is 20 of 24 — four
construction-counted cells do not replicate and `lib/derive.ts` withdrew them.

The key-order sweep is not deleted and not demoted to history. It measures a
real cost — `4.4-11.5x`, the same order — that **nothing static can find**,
because key order is not part of a type. That is the definition of the
`unreported` clause TC-39 introduced, and it is where it now lives.

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

## TC-40 — the published page is a highlight reel of numbers README retracts (2026-08-17, FIXED 2026-08-19)

README carries four qualifications it calls the honesty condition. The page
carries none of them, while printing the same ratios under a column headed
**Measured**:

| the page says | README says |
|---|---|
| `allocating-select` … 2.56-2.87x | **no instance of the measured shape in 850 functions**; all six real findings are cursor advances (TC-18) |
| `delete-property` … 12.3-23.0x | the 23.0x end is a cell whose three sweeps read 22.98 / 13.73 / 15.53 and do not replicate (TC-27) |
| `.map().filter()` … 6.48-7.51x | — and its own cell fails rule 13, see TC-37 |
| a call it cannot read … 3.21-4.95x | `closed-world` "makes no speed claim"; 92% of all findings; n=100000 does not replicate |

The page also carries **no end-to-end number at all**, while README's own table
puts the delivered result on real functions at 1.03x to 4.88x with three
rejections and one 9x regression.

**Fixed 2026-08-19.** The page inherits them, in the column next to the number.
Every rule row now carries the end-to-end result on somebody else's function,
and the three that reject say REJECTS. `allocating-select` says no instance of
its measured shape exists in 850 real functions; `closed-world` says it is 92%
of all findings and is coverage rather than cost; `megamorphic-elements` prints
no ratio at all until TC-42's sweep lands. The six end-to-end numbers are
citations in `lib/derive.ts` like every other number, so the page cannot drift
from the rows, and `make test` checks every ratio on the page against the
derived data.

## TC-39 — two rules measure MORE where they stay silent than where they fire (2026-08-17, FIXED 2026-08-19)

The page's argument for trusting the rules is: "Every rule also records where
the same benchmark found nothing, and a test fails if the rule fires there
anyway." For two of seven rules, "found nothing" is not what the benchmark
found.

- **`megamorphic-dispatch`** fires on `disp.proto.reads` = **14.6-20.0x** and
  stays silent on `disp.silent.own` = **3.5-14.8x**. The ranges overlap. The
  silent case is every shape carrying its OWN function, which the same sweep
  measured at up to 14.8x — the rule declines to report a cost the size of the
  one it exists to warn about, because no declared type separates the two.
- **`allocating-select`** fires at `select.heap` = 2.56-2.87x and is silent at
  `select.silent.local` = 2.01-2.45x, kept in a local where escape analysis
  could see it. The ranges do not overlap, but 2.45x is not "nothing".

The `silent` clauses say this in prose, and the prose is honest. The page's
summary of them is not: "where the benchmark found nothing" is false for both.

**Fixed 2026-08-19.** `Evidence` has two clauses. `silent` is where the
benchmark refused the rule, and a test still fails if the rule fires there.
`unreported` is where the benchmark found a real cost the rule does not report,
because no declared type separates that case from one it would be wrong to warn
about. `megamorphic-dispatch` and `allocating-select` have one each, and both
say in the clause itself that it is a miss and not a refutation. README and the
page both carry the distinction.

## TC-38 — the tool passes its own fix as clean while that fix is 9x worse (2026-08-17, open — the fix line says so as of 2026-08-19)

The sharpest defect in this round, because it defeats the exit code.

    node bin/jitmax.ts examples/remeda-merge-all.before.ts   -> exit 1, 1 finding
    node bin/jitmax.ts examples/remeda-merge-all.after.ts    -> exit 0, clean

The `.after.ts` is the fix jitmax itself printed. `bench/example.jl`
measures the caller's reads of the result it builds at ratio 0.106-0.123 across
all twelve sweeps — the fixed object reads **8.15-9.47x SLOWER** than the one
the defect built, because `Object.assign` in a loop leaves the object in
`[DictionaryProperties]`.

So the tool reports the strictly worse file as clean, and `CLAUDE.md` is
explicit that a gate "reads only the second" — the exit code. Anyone who applies
the advice and re-runs the checker to confirm gets a green run for a regression.

The warning exists, but only in the `fix:` line of the file that still has the
defect. It is gone at exactly the moment it becomes true.

This is the same class as TC-7 and TC-31: the text and the exit code say
different things. Unlike those, the text here is not even present.

**Fixed 2026-08-19, in the half the evidence supports.** The object form's fix
line is no longer an instruction. It states both measured outcomes — the build is
`186-200x` faster, the reads are `0.11-0.12x` — names the condition that decides
between them, and ends with the sentence the exit code cannot say: *no rule here
detects a dictionary-mode object, so the mutating form checks CLEAN*. A reader
who applies the change and re-runs the tool has been told in advance what the
green run means.

The other half — a rule that SEES the dictionary-mode object — stays open, and
its blocker is on record: how many keys a loop adds is not knowable statically,
`bench/addprop.jl` measured adding properties as free at small counts, and
`demo/lib.ts` `growByKey` is a shipped silent case saying so. A rule that fired
on every keyed store in a loop would contradict that measurement. What is
missing is a sweep over the KEY COUNT at which V8 normalizes, which would give
the rule a threshold instead of a guess.

## TC-37 — protocol rule 13 has no code path to publication (2026-08-17, FIXED 2026-08-19)

`CLAUDE.md` gives rule 13 a paragraph: three whole sweeps per published cell,
"agreement is a value common to all three intervals … without one the cell is
**withdrawn as unreplicable**". Three near-identical constructions measuring
1.64x, 0.91x and 0.89x is the story the whole rule exists for.

`replicates()` is defined at `bench/driver.js:205`. It is imported by
`bench/run.js`, which uses it to print the word `DISAGREES` to a terminal while
a sweep runs, and by `bench/tc11-report.js`. **`lib/derive.ts` never calls it,
and until today no test did either.** Every `agg: 'range'` citation min/maxes
across sweeps with no agreement check at all.

So the rule was enforced by a human happening to re-read rows. Twelve published
cells were not re-read:

| cell | three sweeps | verdict |
|---|---|---|
| `chained.jl chained\|incl\|1000` | 7.51 / 6.58 / 6.48 | max(lo) 7.152 > min(hi) 7.057 |
| `inline.jl large\|excl\|100000` | 4.73 / 4.68 / 3.21 | max(lo) 4.282 > min(hi) 3.880 |
| `shapes-calibrated.jl 3\|incl\|16384\|L2` | 1.57 / 1.37 / 1.28 | no common value |
| `shapes-calibrated.jl 4\|incl\|16384\|L2` | 1.31 / 1.58 / 1.47 | no common value |
| plus 8 more, all listed in `test/check.test.ts` | | |

The first two are **on the published page**. `6.48-7.51x` is the
`.map().filter()` headline. And `3.21-4.95x` is worse than unreplicable: its low
end 3.21 **is the dissenting sweep's own ratio**, and its high end comes from a
different cell (n=1000) that does replicate — an advertised interval assembled
from one cell that agrees with itself and one that does not.

**Fixed in part, today:** `make test` now recomputes agreement for every
replicated cell in every re-measured file and fails on any disagreement not on
an explicit list. A new one breaks the build; a listed one that starts agreeing
also breaks it, so the list cannot rot. That makes the twelve visible and
bounded.

**Fixed 2026-08-19.** `lib/derive.ts` groups every citation's rows into cells and
calls `replicates()` on each one. A cell whose sweeps share no common value is
withdrawn from the aggregate; the count and the cell keys go into the
provenance, so a range over four cells cannot pass for a range over six. A
citation left with nothing throws, and the number cannot be published at all.

Three citations were left with nothing, and all three carried a claim:

| citation | was | now |
|---|---|---|
| `chained.mapfilter` | 6.48-7.51x, one cell, n=1000 | **1.44-1.52x**, the cell that replicates |
| `inline.reads` | 3.21-4.95x, low end from the dissenting sweep | **4.64-4.95x**, n=1000 only |
| `delete.silent.undef.build` | 0.98-1.18x | gone; the clause claims the reads and not the build |

The three withdrawn cells are still published — as refutations. A citation may
set `unreplicable: true`, which reads the withdrawn cell and quotes its three
sweeps as the three numbers they are (`6.48x and 6.58x and 7.51x`). Such a
citation throws if its cell ever starts replicating, for the same reason the
register below fails on a healed entry.

The gate counts SWEEPS, not the `protocol: 'replicated'` marker a row carries.
Reading the marker let 46 dispatch cells past it: each had one plain sweep and
two replicated ones, which is three sweeps of that cell under one runner.

`test/check.test.ts` keeps the register, over every sweep file rather than only
the cited cells, and calls the same `unreplicable()` the gate uses.

## TC-36 — `delete-property` names the wrong V8 mechanism for `delete xs[i]` (2026-08-17, FIXED 2026-08-19)

The rule flags every `DeleteExpression`. Its benchmark deletes a NAMED property
from an object (`bench/delete.js`, the middle property of a fixed shape), and
the finding text says "puts its object in dictionary mode".

```ts
/** @jitmax */
export function d(xs: number[], i: number): number[] { delete xs[i]; return xs; }
```

    delete xs[i] puts its object in dictionary mode
    measured 12.3-23.0x per property load once the object is in dictionary mode …

Deleting an ARRAY ELEMENT does not put the array in dictionary mode. It makes
the elements backing store holey — a different representation, a different cost,
and a different part of V8. The number is real and belongs to the named-property
case; it is being printed about a case nobody measured.

Worse, the printed fix makes it a regression. Verified here:

    fresh array             fastProps true   double true    holey false
    after delete a[50]      fastProps true   double true    holey true
    after b[50]=undefined   fastProps true   double false   object true

The array never leaves fast properties — it goes PACKED_DOUBLE to HOLEY_DOUBLE.
And "assign undefined instead" turns PACKED_DOUBLE_ELEMENTS into
PACKED_ELEMENTS, which is the boxing `bench/arrays.jl` measured at 1.39-1.66x on
reads and over which this project WITHDREW a rule. It is also a type error on
`number[]`.

**Fixed 2026-08-19.** The trigger is narrowed: a `delete` whose target is a
property of an ARRAY is not reported. The rule fires where `bench/delete.js`
measured — a property on something that is not an array — and the holey-elements
case is now nobody's finding rather than the wrong rule's. `demo/lib.ts`
`dropElement` is the fixture and a test asserts the silence. Measuring the holey
case and giving it its own rule stays open as work, not as a defect.

## TC-35 — `chained-allocation` matches method NAMES, so it fires on strings (2026-08-17, FIXED 2026-08-19)

The rule pairs adjacent calls whose names are in a set (`map`, `filter`,
`concat`, `slice`, …) and deliberately does not consult the receiver's type.

```ts
/** @jitmax */
export function s(str: string): string { return str.concat("x").slice(1); }
```

    .concat() then .slice() allocates a whole array between the stages

The receiver is a `string`. No array is allocated anywhere in that expression,
and the finding says one is. The same fires on any lazy collection whose `map()`
returns `this`. This is sharper than TC-9, which is about the rule not knowing
`n`: here the rule does not know it is looking at an array at all, and
`accumulating-spread` already consults the receiver's type for exactly this
reason — the string case was measured there and found to be FASTER.

**Fixed 2026-08-19.** The rule reads the receiver's type and fires only where it
is an array, exactly as `accumulating-spread` does and against the same
measurement. `demo/lib.ts` `trimTail` is the fixture; a test asserts the
silence.

## TC-34 — `allocating-select` reads an object return TYPE as an allocation (2026-08-17, FIXED 2026-08-19)

`allocates()` asks whether the call's static return type is an object.

```ts
type P = { a: number };
function pick(a: P, b: P): P { return a; }   // allocates nothing, ever
/** @jitmax */
export function loop(xs: P[]): P {
  let x = xs[0];
  for (const y of xs) x = pick(x, y);
  return x;
}
```

    x is replaced by pick(...), which returns a new object every pass,
    including the passes that choose the value it already held

`pick` returns its argument. There is no allocation on any pass, and the finding
asserts one on every pass. The benchmark measured `Box.min`, which runs
`new Box(...)` in its body. A return type is not an allocation site.

This compounds TC-18, which already records that the rule's six real-world
findings are all cursor advances rather than the measured shape. Between them,
the rule has no confirmed true positive on real code.

**Fixed 2026-08-19.** The rule resolves the call to its declaration and requires
the body to contain something that builds an object — a `new`, an object literal
or an array literal. A callee with no readable body is `closed-world`'s finding,
not this one's, so the rule stays out there too. `demo/lib.ts` `nearest` is the
fixture and a test asserts the silence. TC-18 stands: the six real-world findings
are still cursor advances, and this narrowing does not manufacture a true
positive.

## TC-33 — `closed-world`'s trigger and its benchmark measure different things (2026-08-17, open — the report says `bound` as of 2026-08-19)

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

## TC-32 — the documented invocation discards the project's tsconfig (2026-08-17, open)

`lib/ts.ts` loads `tsconfig.json` only when the caller passed no input paths:

```ts
if (configPath && inputs.length === 0) { … }
```

README's own instruction is `jitmax src`, which passes an input path, so
the documented form never reads the config. It compiles under built-in
ES2022/NodeNext options instead. Path aliases, JSX mode, `types`, `strict` and
ambient declarations can all resolve differently from the project's real build —
and every type-based rule and every call edge depends on that resolution.

README claimed jitmax "sees the same code and types your build sees".
**That sentence is corrected as of this entry**, because it was false.

The fix is small and unambiguous: read the config's `options` whenever one is
found, and use the caller's file list when they gave one. Recorded rather than
applied only because it changes what every rule sees, which is a behaviour
change on a released tool.

## TC-31 — a call through a parameter is neither followed nor reported (2026-08-17, open)

```ts
/** @jitmax */
export function hot(cb: (x: number) => number): number { return cb(1); }
```

    jitmax — 1 annotated function, 0 findings
      every annotated function is clean.

`cb` has no body anywhere in the program. The walk resolves it to a parameter
declaration, which is not followable and is not in a declaration file, so it
falls through both branches: not walked, not counted as an escape, not listed.
Calls through interface methods behave the same way.

The tool's coverage promise is the thing that makes its exit code trustworthy —
"a run that could not see everything is never a pass". Here it could not see
into the call, said nothing, and exited 0. README's "every call with no readable
body is listed by name" **is corrected as of this entry.**

This is the same failure TC-7 fixed for the walk cap and TC-10 records for
constructors: the walk has a third way of stopping silently.


## TC-30 — the launch loop uses Google's V8 mark, and nobody has cleared that (2026-08-16, open, proposal)

> **2026-08-19, researched.** "V8" is not on Google's published trademark list
> (0 hits across 514 marks) and `v8.dev/logo` offers the SVG with no terms — but
> `v8.dev/terms` says *"Google's trademarks and other brand features are not
> included in this license"*, and Google's brand rules say *"Don't display any
> Google Brand Feature as the most prominent element in your content"*, which
> act three of the film does literally. *Toyota v. Tabari* (9th Cir. 2010) is the
> shape of it: the word "Lexus" was nominative fair use, the logo was "more use
> of the mark than necessary". **Cheapest complete fix:** keep the word V8
> everywhere in the text, drop the mark from the film, and add one line to
> README — *"V8 is a trademark of Google LLC. This project is not affiliated
> with or endorsed by Google."* README names V8 eighteen times today with no
> attribution line at all.

`demo/meme/` builds the loop on the page at krons.fiu.wtf/pub/jitmax/ from
`v8.dev/_img/v8-outline.svg` — Google's V8 logo, recoloured to the PH3 palette.
`demo/meme/recolour.py` rewrites fill and stroke attributes only; every
coordinate is upstream's, because a redrawn mark reads as a cheap imitation and
a real one reads as the real thing.

Two separate questions, and only the first is settled:

1. **Copying.** The mark is NOT committed here. `make meme` fetches it into
   `tmp/`, which is gitignored, so this repository redistributes no Google
   asset. That was the TC-29 lesson applied before the fact rather than after.
2. **Trademark, which is open.** Using someone's logo to refer to their product
   is normally nominative use, and the loop does refer to V8 — it is about what
   V8 does to code. But the loop is also promotional material for a different
   product, it is published, and the mark is altered (recoloured, shaken, struck
   by lightning). Altering a mark is the part that most often stops being
   nominative use. Nobody at Google has been asked.

**Not fixed, because there is no defect to fix — there is a decision to take,
and it is the owner's.** Three ways out, in order of how much they cost:

1. Ship as is. The tool is about V8 and says so; the loop is not passing itself
   off as a Google product; the page names the tool, not V8, in its wordmark.
2. Keep the composition and drop the mark for something generic — the cost is
   that the loop stops being instantly readable as "this is about V8", which is
   the whole reason the mark is in it.
3. Ask. Slowest, and the only answer that is not a guess.

Until then the fetch stays a build step, so the question stays visible in the
Makefile rather than buried in a committed binary.

## ✅ FIXED 2026-08-16 — TC-29 — four MIT libraries vendored without the notice MIT requires

Found in the pre-publication audit, and fixed in the same pass because the
owner asked for a release that survives one.

`examples/` holds eight files vendored verbatim from radash, remeda, es-toolkit
and zod. Every one carried its upstream copyright line, its version and the
commit it came from — and none carried the permission notice. MIT is not
satisfied by attribution: it requires that "the above copyright notice **and
this permission notice**" travel with every copy of a substantial portion of
the software. A whole function copied byte for byte is a substantial portion,
four times over.

Nothing in the repository held that text. `LICENSE` is the GPL-2.0-only body,
the eight file headers hold two lines each, and README's Licence section said
"each file carries its upstream's copyright line, version and commit" — an
accurate description of a set that was incomplete.

The failure is one an audit finds and a test cannot: the repo checks that every
published NUMBER matches its data, and had no check at all on the terms it
redistributes somebody else's code under. It was introduced with the examples
directory itself, so it has been wrong since the day the examples landed.

**Fixed**: `examples/LICENSE-MIT` reproduces the MIT permission notice in full,
with the four copyright holders, the upstream version, the source path and the
commit each function was taken at, and the files each one produced. README's
Licence section points at it and now says the examples stay under MIT rather
than the GPL, which is what is actually true of them.

Still open after this: nothing enforces it. A fifth vendored example would
reintroduce the defect silently, exactly as the first four did. The cause fix
is a check in `make test` that every `examples/*.before.ts` names an upstream
covered by `examples/LICENSE-MIT`. That is a new check and not a correction, so
it is a proposal and waits for sign-off.

## ✅ FIXED 2026-08-16 — TC-28 — four silent clauses have drifted, and that is now a pattern

The fifth rule to show it, so the pattern is the entry. `EVIDENCE.silent` is exempt
from derivation because it is an argument about where a rule must not fire, and
`lib/derive.ts` says so on purpose. The consequence is that the numbers carrying
those arguments are the only published numbers in the repo that a re-measurement
does not move — so every one of them is now quoting a sweep that no longer
exists.

| rule | the clause says | the r2 rows say | where |
|---|---|---|---|
| `megamorphic-elements` | two to four shapes cost **1.2-2.0x** on reads | **1.05-1.81x** | here |
| `allocating-select` | on numbers, **no effect at all**, 1.03x and 0.99x | **1.13-1.22x** at n=10000, no interval spanning 1 | TC-23 |
| `accumulating-spread` | strings build in 0.27-0.56x and **0.74-0.97x** read back | **0.26-0.52x** and **0.78-1.13x**, seven of nine spanning 1 | TC-26 |
| `delete-property` | undefined costs 1.01-1.10x, **two of three** intervals spanning 1 | 1.00-1.06x, **three of three** | TC-27 |
| `chained-allocation` | reading the finished array costs nothing, **0.94-1.03x** | **0.95-1.10x** | here |
| `chained-allocation` | the split chain is **1.06-1.09x**, every point estimate **under** the 1.10x a broad warning needs | **0.99-1.10x** — one point estimate is now exactly 1.10x, so "under" is false by a hundredth | here |
| `chained-allocation` | at n=100000 map-then-filter falls to **1.47x** | **1.44-1.52x** | here |

Four of the five still carry their argument: the fifth shape is still an order
of magnitude past the fourth, the string still wins at building, assigning
undefined is still the fix. One does not — `allocating-select` claims no effect
where there is now a measurable one.

**The proposal is the one TC-26 already made, generalised.** The numbers inside
a clause are not arguments and should be derived like every other number; the
sentences around them stay hand-written. That is a change to what `lib/derive.ts`
covers, so it needs sign-off, and it is the only fix that stops this recurring —
five rules in two days is the evidence that a reminder will not.

**Fixed**, with sign-off, and this entry closes TC-23, TC-26 and TC-27 with it.
`lib/derive.ts` gained one citation per figure a clause quotes — 21 of them —
and every `silent` string now interpolates `N[…]` exactly as `cost` and `source`
already did. The sentences stay hand-written; not one figure is. `make numbers`
moves them with their rows and `make test` fails when a clause and its data
disagree, which is the same guarantee the rest of the repo has had all along.

Four clauses changed what they claim, not only what they quote:

- `allocating-select` said "no effect at all, both intervals spanning 1" on
  numbers. It now says the effect is small and **changes sign with the working
  set** — above 1 at n=10000, below it at n=100000 — and says the old sentence
  was wrong (TC-23).
- `accumulating-spread` said all three string forms "BEAT the rewrite". They
  beat it at building; once the caller reads the result back most of the
  intervals span 1.0, so the clause now says the two are **indistinguishable**
  there rather than the string winning (TC-26).
- `delete-property` improved: **three** of three intervals span 1 on reads, not
  two (TC-27).
- `chained-allocation`'s split chain now reads "at the 1.10x a broad warning
  needs rather than clear of it — the margin is one hundredth", because one
  point estimate landed exactly on the threshold.

Two comments in `lib/rules.ts` that repeated measurements in prose were cut to
name their citation keys instead. A comment quoting a number is a copy nothing
checks, which is how three of these drifted.

Still open: `bench/dispatch.jl` is the one sweep not yet whole under r2, so the
three dispatch clauses read the older rows and README says so on every line that
quotes them.

## ✅ FIXED 2026-08-16 — TC-27 — delete's silent clause drifts, and one published cell stops replicating

Fixed by the derivation in TC-28. The clause's numbers now come from the rows.
The second half of this entry stands and is not a defect: `delete.rows` keeps
the 23.0x end that comes from a cell whose three sweeps disagree, deliberately,
because a range that drops its worst-behaved cell reads tighter than the
measurement was. README's honest-limits section says which cell it is.


`bench/delete.jl` re-measured whole under r2: 16 cells, 48 rows, 3 void.

The clause `delete-property` ships, hand-typed:

> assigning undefined instead of deleting is the fix and not the defect — it
> costs **1.01-1.10x** on reads with **two of three intervals spanning 1**, and
> **1.07-1.19x** to build

| cell | published | three replications | intervals |
|---|---|---|---|
| `rowundef/rowbase` excl n=16384 | 1.01-1.10x | 1.06x 1.00x 1.03x | span 0.96-1.12 |
| `rowundef/rowbase` incl n=16384 | 1.07-1.19x | 0.98x 1.05x 1.18x | span 0.92-1.22, **no common value** |

The clause's *argument* survives and gets stronger: on reads it is now **three**
of three intervals spanning 1, not two, so "the fix and not the defect" is
better supported than when it was written. The build half is the problem — its
three sweeps do not agree, so `1.07-1.19x` is a number quoted from a cell rule
13 would withdraw.

**And a published range moved onto a cell that does not replicate.**
`delete.rows` — which README quotes and every `delete-property` finding prints —
goes 12.6-17.1x to **12.3-23.0x**, and the 23.0x end is the first sweep of
`rowdel/rowbase excl n=262144`, whose three sweeps read 22.98x, 13.73x, 15.53x
with no value common to their intervals. The other five delete cells behind
published numbers all replicate; this one is the RAM-sized read, the same
position in its sweep as every other cell that has failed replication so far.

Left in the range rather than dropped, and said out loud in README's honest
limits, because a range that excludes its worst-behaved cell reads tighter than
the measurement was.

**Not fixed**, same reason as TC-23 and TC-26: `EVIDENCE.silent` is an argument,
not a derivation, and rewriting it is a judgement about a shipped rule's scope.

## ✅ FIXED 2026-08-16 — TC-26 — the strings clause's read-back half no longer says what it says

Fixed by the derivation in TC-28, taking proposal 2 and the substance of
proposal 1 together: both ranges are derived, and the read-back sentence now
says the string and the rewrite are indistinguishable rather than the string
winning.


`accumulating-spread` ships this, hand-typed:

> a STRING is not this rule at any n — `s = s + x`, `s += x` and
> `s = s.concat(x)` build in **0.27-0.56x** of a push-and-join and **0.74-0.97x**
> of it once the read back is counted, so **all three BEAT the rewrite**

`bench/strings.jl` is now re-measured whole under the r2 runner: 27 cells, three
sweeps each, 81 rows, no voids.

| half | published | re-measured | verdict |
|---|---|---|---|
| build only | 0.27-0.56x | **0.26-0.52x** | holds, and tightens |
| with the read back | 0.74-0.97x | **0.78-1.13x** | **does not hold** |

The build half is the rule's actual argument and it got *stronger*: every one of
the nine build cells is far below 1, from 0.26x at n=1000 to 0.52x at n=100000,
and eight of the nine replicate.

The read-back half is the problem, and not because the range moved. **Seven of
its nine cells now have an interval that spans 1.0**, which by protocol rule 6
is a rejection — no measurable difference in either direction. Only
`plus incl n=100000` (0.76-0.92) and `concat incl n=100000` (0.76-0.86) clear
it. And the top of the new range, 1.13x, is a sweep in which the string form was
*slower*: `plus incl n=1000` measured 0.98x, 1.13x, 0.99x.

So "all three BEAT the rewrite" is true of building and is not true once the
caller reads the result back, where at n=1000 and n=10000 the two are
indistinguishable. The clause states as a measured fact something six of its own
cells now refuse.

**Not fixed**, on the TC-23 precedent: `EVIDENCE.silent` is prose making an
argument about where a rule must stay quiet, `lib/derive.ts` deliberately
exempts it from derivation, and rewriting it is a judgement about a shipped
rule's scope. Two proposals:

1. Replace the read-back sentence with what the rows say — indistinguishable at
   n=1000 and n=10000, 0.76-0.92x only at n=100000 — and keep the build half,
   which carries the rule's silence on its own.
2. Derive both ranges instead, the way every other published number is derived.
   The clause is exempt because it is an argument; the numbers *inside* it are
   not arguments, and these two have now drifted from their rows twice.

The rule's behaviour does not change either way: it stays silent on strings, and
the build half is why.

## ✅ FIXED 2026-08-20 — TC-25 — a row's `load1` cannot be compared to the `maxLoad` beside it (2026-08-15)

Fixed by the TC-46 rework, which shipped this entry's second proposal in a
stronger form: every row now records the gate's own observable — `runnable`,
the count of runnable threads outside the harness, read as the row is written,
while the harness's children are dead — next to `env.maxRunnable`. That pair is
comparable by construction. `load1` stays on the row for the reason this entry
gives: its spread across a file is where an outside process announces itself.
The rows already written stay incomparable forever (runners append, never
rewrite); the register in `test/check.test.ts` counts them with exactly this
entry's caveat attached.

The record as filed:

Every row the runner writes carries both `env.maxLoad`, the gate it declared,
and `load1`, the one-minute average read as that row was written. They sit two
fields apart and they are not the same kind of number, and nothing says so.

`load1` is read AFTER the cell's forty pinned observations and after the tier
diagnostic's four traced processes, so by then **the runner is most of its own
reading**. On this two-core machine the measured child holds a core for the
whole cell and the diagnostic runs unpinned on top of it, which puts something
near 2.0 into the average before any other tenant is counted. Every row of the
re-measurement therefore reports a `load1` above the gate of 1 that let it
start, including the rows written on the quietest stretch the machine offered:
`inline` starts at 0.83 and ends at 2.09 across three sweeps of the same cell,
with nothing else on the machine changing.

The gate reading — `env.loadStart`, and the per-cell check — is the clean one,
because it is taken when the runner is idle. `load1` is still worth recording:
its SPREAD across a file's rows is where an outside process announces itself,
and `shapes` at 1.50-4.75 against `inline` at 0.83-2.09 is exactly that signal.
It is the comparison to `maxLoad` that is meaningless.

Cost of getting this wrong: the first pass of this session's coverage tooling
counted "rows written above the gate" and reported every row of every clean
sweep as contaminated.

Not fixed. Two candidate fixes and they are not equivalent: name the field so it
cannot be read as the machine's idle load (`load1AfterCell`), or record the gate
reading of the NEXT cell as this row's clean-load-after, which costs nothing
because the gate reads it anyway.

## TC-24 — eighteen `select` rows predate the field they should carry (2026-08-15, open)

`bench/select.jl` holds 18 rows marked `runner: r2` that were written while the
runner was still being built, before `load1` moved out of `env` and onto the
row. They carry `env.load1` — one number for the whole sweep — where every row
written since carries its own.

They are not from a different protocol: three whole sweeps per cell, the same
gate, the same driver, the same twenty pairs. `lib/derive.ts` reads them as
current rows and is right to. What is missing is one provenance field on
eighteen of them, which makes `select` the one sweep whose rows cannot be
compared to another sweep's on when they were written.

Two ways to close it, and the cheap one is not obviously worse: re-run the six
cells under `--force`, which appends 18 rows carrying the field and leaves the
old 18 as history in the same file, or leave them and let this entry be the
record. Re-running was ranked below every sweep still on pre-`r2` rows, because
those are the numbers the exercise exists to move, and the machine did not offer
enough quiet time to reach both.

## ✅ FIXED 2026-08-16 — TC-23 — re-measuring select contradicts its own silent clause

Fixed by the derivation in TC-28, taking proposal 1. The rule still stays out of
the number case — it is about allocation, and `Math.min` allocates nothing — but
the clause now says so on the honest margin and records that it used to claim
"no effect at all".


`allocating-select` ships this, hand-typed:

> on numbers there is no effect at all — **1.03x and 0.99x, both intervals
> spanning 1** — because Math.min allocates nothing; and escape analysis does not
> rescue the boxed form either: kept in a local the same loop still costs
> **1.72-2.28x**

Both numbers are from single sweeps. Re-measured through the new runner — three
whole sweeps per cell, under the load gate, every cell replicating:

| cell | published | three replications | intervals |
|---|---|---|---|
| number n=10000 | 1.03x | **1.13x 1.21x 1.22x** | 1.06-1.21, 1.13-1.30, 1.15-1.30 |
| number n=100000 | 0.99x | 0.88x 0.94x 1.00x | 0.84-0.92, 0.88-0.98, 0.90-1.10 |
| local n=10000 | 2.28x | 2.45x 2.36x 2.40x | — |
| local n=100000 | 1.72x | 2.13x 2.02x 2.01x | — |

"No effect at all, both intervals spanning 1" is not what the data says any
more. At n=10000 **not one of the three intervals spans 1**, the point estimates
are 1.13-1.22x, and every lower bound clears 1.05 — which is the bar protocol
rule 6 sets for a broad warning. At n=100000 the effect reverses to 0.88-1.00x.
So the honest reading is not "no effect" but "an effect that changes sign with
the working set", and that is a different sentence with a different consequence
for where the rule should fire.

`1.72-2.28x` for the local case is now `2.01-2.45x`.

Why the drift, and it is not mysterious: these were one sweep each, and rule 13
exists because one sweep cannot see what varies between two. The old rows also
predate the load gate and carry no record of what the machine was doing.

**Not fixed.** The derived numbers were re-derived by `make numbers`, which is
mechanical. This clause is prose making an argument about where a rule must stay
quiet, `lib/derive.ts` deliberately exempts it from derivation, and changing it
is a judgement about a shipped rule's scope. Two proposals:

1. Rewrite the clause to what the rows say, and decide whether an effect of
   1.13-1.22x at L1 that reverses at RAM is still a case the rule stays silent
   in. It probably is — the rule is about *allocation*, and the number case
   allocates nothing — but the sentence has to stop claiming a measurement it no
   longer has.
2. Derive it. Every number in `silent` could come from `lib/derive.ts` the way
   `cost` does, leaving only the argument hand-written. That is the change that
   stops this recurring, and it is bigger than this entry.

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

## TC-20 — a development row reached a published `.jl` (2026-08-15, fixed)

While the runner was being built, `node bench/run.js spread --max-load=99` was
run to check that a flag parsed, on a machine at load 1.91, and it appended a
real measured row to `bench/spread.jl`. `spread.array.reads` picks every
`spread`/`excl` row in that file, so a number README publishes would have moved
because of a row measured to test an argument parser.

Reverted with `git checkout` before anything was derived from it. The fix is
`--scratch`, which sends a run to `bench/scratch.jl` — gitignored, and read by
nothing. The never-overwrite rule protects published sweeps from being replaced;
it had nothing to say about a published file gaining a row that was never a
sweep, and now the runner does.

## TC-19 — megamorphic-elements prints a fix nobody at the finding can apply (2026-08-15, open, proposal)

Found while giving every rule an end-to-end example. `examples/` can only hold a
rule whose printed fix is a change to the function the rule fired on, and this
one never is.

The rule reads a **parameter's** declared element type and reports the load
site inside the callee. Its fix line says *"get the element type to four shapes
or fewer, or give it one construction path"* — and the function holding the
finding received that array already built. Whoever can act on the line is a
caller the report never names, in a file the walk may never have visited.

So there is no before/after pair to vendor, and the gap is not a missing
example: it is the finding addressing the wrong reader.

The survey that found it also refutes what README said until today. Extended
from five libraries to twelve — 850 annotated functions — `megamorphic-elements`
fires **ten times, and all ten are one function**: zod's `prefixIssues`, whose
`issues` parameter unions twelve `$ZodRawIssue` types and whose body loads and
mutates `.path` on each element. Nine of the ten are that one site reported from
nine annotated roots that reach it. So the rule is not unfireable, as the
previous survey suggested; it is narrow, and its advice is misaddressed.

Proposals, none of them shipped:

1. **Say whose problem it is.** The fix line becomes something like *"the array
   reaching this parameter has to be built with four shapes or fewer — that is a
   change where it is built, not here"*. Cheap, honest, and still not actionable
   at the finding.
2. **Report at the construction site instead.** Needs whole-program flow to the
   parameter, which this tool does not have and which the annotation model
   (one root, its call tree) does not obviously give it.
3. **Withdraw the rule** on the grounds that a warning nobody at the site can
   act on is not worth a false-positive budget. TC-8 and TC-2 are already open
   against it.

A change to the printed contract, so: **owner signs off before anything ships.**

Reproduce: `node examples/annotate.js tmp/lib-zod/packages/zod/src/v4/core` then
`node bin/jitmax.ts tmp/lib-zod/packages/zod/src/v4/core`.

## TC-18 — allocating-select fires on advancing a cursor, which its benchmark never measured (2026-08-15, open, proposal)

Twelve libraries, 850 annotated functions, six `allocating-select` findings, and
**not one of them is the shape `bench/select.jl` measured.**

The benchmark keeps a running minimum: `b.lo = Box.min(b.lo, v)`, where after
the first item the incumbent almost always wins, so nearly every allocation is
for a value the target already held. That is what the 2.65-2.73x buys, and it is
what the fix — *"compare first and assign only when x really changes"* — saves.

What actually fires in real code:

- `date = addMinutes(date, step)`, `date = addQuarters(date, step)`,
  `currentDate = addWeeks(currentDate, step)`, `date = oneDayLater(date)` — four
  date-fns functions, one per loop, walking a cursor forward.
- `sink = lazyFunctions[index].lazy!(sink)` in es-toolkit's `pipe`, reported
  twice from one site.

Every one of them changes the value on **every** pass. The compare the fix asks
for never skips a store, so the fix cannot save an allocation; it can only add a
comparison. The rule is firing where its own evidence says there is nothing to
win — TC-9 again, in a fourth rule.

The rule already tries to separate the two: it requires the target to appear
among the ARGUMENTS, which is what makes `x = x.plus(1)` (target as receiver)
stay silent. Written as a free function, `x = plus(x, 1)`, the same arithmetic
walks straight through that test.

Proposal, not shipped: require a **peer** — at least one argument besides the
target whose type is the target's type. `Box.min(a, b)` and `Decimal.min(a, b)`
have one; `addMinutes(date, step)` does not, and neither does `lazy(sink)`. On
the survey that would take the rule from six findings to zero, which is the
honest outcome for a rule whose shape has not been seen in the wild — and it
needs a measurement of its own before anything is claimed for it.

A change to what the rule fires on, so: **owner signs off before anything
ships.**

Reproduce: the survey in README's "whole survey" table; the four date-fns sites
are in `pkgs/core/src/{differenceInBusinessDays,eachMinuteOfInterval,eachQuarterOfInterval,eachWeekOfInterval}/index.ts`.

## ✅ FIXED 2026-08-15 — TC-17 — a truncated walk printed "not a clean run" and exited 0

TC-7 taught the *report* to refuse the word "clean" when a walk hit the cap. It
never reached the exit code. `bin/jitmax.ts` sets it from
`findings.length > 0` alone, so a run that prints

    no findings, but 1 walk truncated: this is not a clean run.

exits `0` — and a CI gate reads exit codes, not prose. README's "a walk that
hits its limit prints `WALK TRUNCATED` and is never reported as clean" is true
of the text and false of the contract underneath it.

Found while fixing the detection half of the same defect: the walk stopped at
the cap without setting `Mark.truncated` whenever `reached` filled at the END
of a body rather than mid-body, so a 250-deep call chain printed "every
annotated function is clean" outright. That part is a plain bug and is fixed —
`lib/scan.ts` now walks every body it admitted. What remains is the exit code,
and only the shapes that DO set the flag ever reached it.

**Not fixed inline: the three exit codes are the tool's public contract.**
`0` clean, `1` findings, `2` the tool failed. Making a truncated walk exit `1`
overloads "findings" with "unproven", and a fourth code is a new contract. Both
are a change to what a CI gate means, so: **owner signs off before anything
ships**.

Reproduce: a call chain deeper than `MAX_BODIES` (200) with no finding in it —
`node bin/jitmax.ts <dir>; echo $?` prints the truncation warning and `0`.

**Fixed 2026-08-15, signed off: a truncated walk exits `1`.** No fourth code —
`1` already means "jitmax has something to report", and a run that proves
nothing about part of a call tree is something to report. `bin/jitmax.ts`
now sets the code from `findings.length > 0 || mark.truncated`. The repro is
checked in as `test/fixtures/deep/chain.ts` — 211 links against a cap of 200,
no finding anywhere in it — and a test runs the binary over it and asserts the
code is 1 with `0 findings` in the output, so the contract is tested where a CI
gate reads it rather than in the library beneath it. README's exit-code
paragraph and `CLAUDE.md` say the same thing.

## ✅ FIXED 2026-08-15 — TC-16 — the fix a rule printed could cost more than the defect

Found by `bench/example.jl` — the first sweep in this project that applies a
printed fix to a function somebody else shipped and measures the whole call.
Two of the three examples say the fix is not free, and the rules do not know it.

**One mechanism, two rules.** Adding properties to an object one at a time
normalizes it to dictionary mode. `%DebugPrint` on the result of
`examples/remeda-merge-all.after.ts` reads `[DictionaryProperties]`; on the
result of the shipped version it reads `[FastProperties]`. That is the same
demotion `delete-property` exists to warn about, reached through the fix for a
different rule.

- **`accumulating-spread`.** Its fix line is "mutate acc in place — push, or
  assign the key". On remeda's `mergeAll` that fix makes the caller's reads
  **8x slower**: 0.11-0.12x at n=8 and n=64, in all six sweeps, with no
  interval near 1.0. The build gets faster (1.31-1.36x at n=8; the n=64 cell
  reads 17.34/19.34/20.10x and does not replicate), so the rule trades a
  quadratic build for a per-load cost it never mentions. The rule's own
  EVIDENCE already contains the fact — `bench/spread-object.jl` measured the
  spread-built object reading 30-50x FASTER — and the `fix:` line does not
  carry it.
- **`delete-property`.** Its fix line is "assign undefined, or build the object
  without the property". On es-toolkit's `omit` the second branch works at 12
  keys — the caller's reads are 10.95-11.86x faster, the rule's 12.6-17.1x
  landing almost intact — and stops working by 48, where the cell rejects at
  0.94-1.02x with an interval spanning 1.0 in all three sweeps.
  `%HasFastProperties` is false on **both** sides there: the fixed object was
  normalized by being built key by key. The first branch, "assign undefined",
  is not available at all in `omit`, because it leaves the key present and
  computes a different object; the driver's checksum rejects it.

**Not a symptom to log louder.** The honest shape of the fix is conditional —
below some width, build the object without the property; above it, the
rewrite buys nothing on reads — and neither rule can see the width, which is
TC-9 again from the other end. A cause fix means the `fix:` line stops being
one sentence, and that is a contract change, so it is a proposal, not an inline
edit: **owner signs off before anything ships**.

Reproduce: `make example`; `node --allow-natives-syntax` over the pairs for the
properties state. Data in `bench/example.jl`, all 36 sweeps.

**Fixed 2026-08-15, signed off: the advice changed, the detection did not.**
Both rules now print the condition their own measurement established, and
neither fires anywhere it did not fire before.

`accumulating-spread` prints **two** fix lines, because it always knew which of
the four forms it matched and was throwing that away:

- array (`[...acc, v]`, `acc.concat(v)`) — *"push onto acc instead of rebuilding
  it — the finished array reads the same either way, 0.96-1.07x"*. No condition,
  because the sweep found none: `bench/spread.jl`'s reads-only cells are
  0.96-1.07x across both sizes and both sweeps.
- object (`{ ...acc, k: v }`, `Object.assign({}, acc, …)`) — *"assign the key on
  acc instead of rebuilding it — but that fills the result key by key, which
  normalizes it: its reads measured 0.11-0.12x of the spread-built object's
  (remeda mergeAll)"*.

`delete-property` prints *"assign undefined where the key may stay present, or
build the object without it — the rebuild helps at 12 keys and not at 48, where
filling it key by key normalizes it too"*. The first branch is conditioned on
what `omit` proved: it computes a different object when the key must go. The
second carries the width the sweep bracketed.

Both quoted ratios are derived from the `.jl` rows like every other published
number — `spread.array.reads`, `spread.object.reads` and `ex.mergeall.reads` in
`lib/derive.ts` — so a re-run that moves them moves the printed advice, and
`make test` fails if the two ever disagree. Two tests assert the sentences.
`EVIDENCE.silent` for `accumulating-spread` was reading its own 0.03x as
evidence that the value left behind does not matter, when that number IS the fix
reading slower; it now says so.

What is NOT fixed, and stays with TC-9: neither rule can see the width or the
reads at check time. The fix line states the condition; it does not evaluate it.

## ✅ FIXED 2026-08-15 — TC-15 — delete-property's number predates the current protocol

**Closed by `bench/delete.jl`: 16 cells, 20 pairs each, every cell replicated
three times. The audit below was right, and the probe it doubted was wrong in
both directions.**

The number moved down. 28-67x becomes **12.6-17.1x per property load** —
13.35-16.32x at n=16384 and 12.57-17.14x at n=262144, both replicating; the
n=256 cell spread 10.75-14.49x with mutually exclusive intervals and is
withdrawn. With construction counted it is 23.22-24.33x at n=256, where the
delete is paid on every object built; the n=16384 construction cell disagrees
across sweeps (11.68/16.79/12.89) and is withdrawn, and at n=262144 one rep
builds 262144 dictionary objects and overruns the 240 ms region guard, so all
three sweeps are void. Void and printed, not rounded into the range.

**And the singleton half of the probe is refuted, which is the bigger result.**
The audit above asked for both populations to be reproduced, expecting the 0x to
stand. It does not: ONE object with ONE delete, read in a loop, costs
**13.32-15.57x** — at every working set, in all nine of its sweeps, with tighter
intervals than the per-row population manages. Both families run the identical
kernel over an array of the same length (`sh` fills n slots with n references to
one object), so the only variable is how many distinct receivers reach the load
site, and the answer is that it does not matter.

The old probe guessed why its own singleton read 0x — *"TurboFan appears to
specialize the constant object"* — and that guess is the explanation for the
whole discrepancy. A bare loop over one object in a local has nothing the
optimizer cannot see through; the fast side can be served by a load hoisted out
of the loop while the dictionary side keeps calling into the runtime.

The probe's stated *mechanism* is wrong too. `%HaveSameMap` reports that every
normalized object in the per-row population shares one map
(`node --allow-natives-syntax bench/delete.js rowdel 262144 kinds 1 1`), so
"every dictionary-mode object gets its own map, so the site goes megamorphic" is
false: the site is not megamorphic and what costs is the dictionary lookup — the
reason one object pays as much as a quarter of a million.

The fix the rule names holds: `o.tmp = undefined` costs 1.01-1.10x on reads
(withdrawn — two of three intervals span 1.0 and they disagree) and 1.07-1.19x
to build, and `delete` measured against *that* rather than against never adding
the property still costs 12.38-12.86x.

EVIDENCE is derived from the file by `lib/derive.ts`, and `make bench-delete`
re-runs it. TC-9's delete bullet goes with it — see TC-9 below.

## TC-15 — the original entry (2026-08-14)

`EVIDENCE['delete-property']` quotes **28-67x per property load**, sourced to
"round 3b" of the product-design document — the probe appendix at the bottom of
it: an ad-hoc median-of-runs on a noisy VM, taken before `bench/driver.js`
existed. That document is gone; `bench/delete.jl` is the sweep that replaced it.

It has none of the six things every other shipped number has: fresh process per
observation, AB/BA randomization, 20 paired runs, a bootstrap interval, a
recorded rep count, a per-pair checksum. There is no `bench/delete*.jl` and
no `bench/delete*.js`, so `make bench-…` cannot re-run it and a skeptic cannot
either. The README's "every rule includes the benchmark that earned it" is
false for this rule in the same way it was false for `closed-world` before
`bench/inline.js` was written.

V8's source is *strongly* on the rule's side about the mechanism — every named
`delete` on a fast object normalizes it unconditionally
(`src/objects/lookup.cc:843`), a dictionary receiver loses inlined property
access (`src/compiler/access-info.cc:57`), and nothing in normal execution puts
it back (`src/objects/js-objects.cc:5097` is the only automatic caller of
`MigrateSlowToFast`, and it is for prototypes). See the V8 table in `README.md`.

That makes this a provenance defect, not a refutation: the mechanism is real and
the magnitude is unverified. Closing it means writing `bench/delete.js` with
both populations the old probe measured — singleton (0x, dictionary up to 10%
*faster*) and per-row over 100k objects (28-67x) — and re-deriving the EVIDENCE
string from the `.jl`. Until then the number should be read as a decorated
memory of a probe, not as this project's evidence standard. Related: TC-9,
which is about the rule firing on the singleton case regardless.

## ✅ FIXED 2026-08-15 — TC-14 — boxed-elements cannot be re-run, and its trigger is an inference

**Closed by withdrawing the rule.** Both halves of the audit below were right,
and `bench/arrays.jl` — 20 cells, 20 pairs each, every cell replicated three
times — settles which half is fatal.

**The first half: the numbers were re-derived and they moved.** A genuinely
boxed array (PACKED_ELEMENTS holding doubles, so every element is a pointer to a
HeapNumber) costs **1.39-1.66x** to read against PACKED_DOUBLE across n=256,
16384 and 262144 — nine sweeps, no rejecting interval. The published 1.45-1.89x
overstates the top. The construction claim was simply wrong: 2.36-3.28x was
quoted, and it measures 1.07-1.23x in cache and 1.58-1.69x at RAM size, where
allocating a quarter of a million HeapNumbers is the whole difference. So the
effect is real, replicates, and is *not* lost inside the 1.0-1.7x band §11 warns
about — the reads are not the problem.

**The second half is the one that kills it.** The rule fires on the declared
element type. `node --allow-natives-syntax bench/arrays.js unionnum 8 kinds 1 1`
reports `%HasDoubleElements` **true** for an array built exactly the way
`(number | string)[]` code builds one when it only ever stores numbers, and the
benchmark agrees: **0.96-1.08x** over six cells and eighteen sweeps, seventeen of
them with an interval spanning 1.0. The single sweep that excluded 1.0 read
1.08x and its own two replications read 1.00x and 0.99x.

There is no narrower trigger to retreat to, and that is why this is a withdrawal
rather than a re-derivation. What decides the representation is what gets
stored; no annotation decides that. An array that really does hold both types is
a different kernel, and "give the array one element type" is not a rewrite
available to code whose data is genuinely mixed — so the case where the fix
applies is the case where nothing is wrong.

The rule is gone from `lib/rules.ts`, TC-14 is gone from the `DEFECT` map,
`demo/lib.ts` `mixed` is a must-stay-silent fixture with a test on it, and the
effect stays published in `bench/arrays.jl` as a measured cost that ships no rule —
the same shape as TC-12. The controls reproduce as well: holey 0.93-1.06x on
reads (and faster to build, though that cell compares a preallocated array
against a grown one and measures allocation strategy too), `Float64Array`
0.97-1.10x on reads with every interval spanning 1.0 and 0.44-0.53x to build at
RAM size, where round 2 reported roughly 3x rather than 2x.

`make bench-arrays` re-runs it. The audit that found this stands below.

## TC-14 — the original entry (2026-08-14)

Two defects in one rule, both found while tracing mechanisms to V8's source.

**The benchmark is not in the repository.** `EVIDENCE['boxed-elements']` cites
"round 2, suite A" of a benchmark write-up for 1.45-1.89x on reads and
2.36-3.28x with construction. That write-up's §Results says, in full:
*"(filled in after the runs; raw observations in `bench/results.jsonl`)"*. There
is no `bench/results.jsonl`, and the kernels it names — `bench/arrays_kind.js`,
`bench/arrays_obj.js` — do not exist either. The numbers survive only as a table
in the spec. This is the project's central claim ("a rerunnable benchmark per
rule") failing for the rule with the weakest number: one sweep, unreplicated,
inside the 1.0-1.7x band this harness has twice failed to resolve. Both
documents are gone; `bench/arrays.jl` is the sweep that replaced them.

**And V8's source does not support the trigger.** The elements kind is decided
by the values actually stored — `Object::OptimalElementsKind`
(`src/objects/objects-inl.h:700`) is called per store from
`LookupIterator::PrepareForDataProperty` (`src/objects/lookup.cc:449`). The rule
fires on the *declared* element type. A `(number | string)[]` that only ever
holds numbers stays `PACKED_DOUBLE_ELEMENTS` and pays nothing, exactly as a
five-member union can reach a load site as one map. That is TC-2 in a second
rule, and the mechanism citation makes it concrete rather than theoretical.

Not fixed, and the two halves have different remedies: the first needs a
`bench/arrays.js` sweep written and run (and the rule's numbers re-derived or
withdrawn); the second is unfixable statically and belongs to a runtime half
this project does not have — one that asks V8 for the elements kind instead of
inferring it from a declared type.

Full write-up in the V8 table in `README.md`.

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

## ✅ FIXED 2026-08-15 — TC-11 — one sweep's interval cannot see between two sweeps

**The audit below stands. The diagnosis under it was wrong, and it was mine.**
It said a cell whose rep count falls below some floor is not a measurement, and
proposed a floor of five repetitions with the region extended to a cap of about
1000 ms to reach it. Five and 1000 are numbers nobody measured, and a constant
nobody measured is a hypothesis, not a protocol — the same objection this project
raises against every rule it refuses to ship. A kernel that fits two passes into
the 120 ms region has been measured for 120 ms; how many passes that took is a
fact about the kernel. The floor was written into `driver.js` and reverted before
a single cell ran under it.

What the audit actually found is in the original report, mis-read there as a rep
count problem: three near-identical `addprop` constructions measured 1.64x, 0.91x
and 0.89x, every interval excluding 1.0 and no two of them able to be true
together. **The bootstrap resamples the twenty pairs of ONE sweep.** It sees what
varies between two processes and is blind to what varies between two sweeps — a
different calibration, a heap that grew differently, a machine ten minutes older.
A low rep count travels with that blind spot, because a slow cell has fewer and
larger passes and each one lands somewhere different. It is a correlate, not the
mechanism, and thresholding it would have treated the symptom.

Fixed three ways, none of them a threshold:

- `bench/driver.js` records the achieved region in milliseconds beside the rep
  count in every cell — `msBase` and `msTest` — and `bench/run.js` prints
  both with every sweep. Facts in the file, no cut-off.
- `driver.js` gains `replicate()` and `replicates()`. A cell is run **whole,
  three times**, and agreement is a value common to all three 95% intervals: a
  criterion the intervals supply rather than one this project picks.
- Protocol rule 13 (`CLAUDE.md`) is the contract, and it says in as many words
  that there is no floor on the repetition count.

**33 flagged cells, three sweeps each, 99 sweeps, `make bench-tc11`.** Every
row is appended to the sweep's own `.jl` and carries `protocol: "replicated"`,
so nothing that was published before is overwritten or hidden:

| Sweep | cells | replicate | do not |
|---|---|---|---|
| `shapes-calibrated` incl, n=262144 | 4 | 4 | — |
| `spread` incl, n=10000 | 1 | 1 | — |
| `spread-object` incl, n=500 | 2 | 2 | — |
| `strings`, n=100000 | 9 | 8 | `s += x` at construction |
| `addprop`, n=262144 and `keyed16` n=8192 | 7 | 1 | 6 |
| `dispatch` incl, n=262144 | 10 | 9 | `lit3` |

**The addprop cells are the result.** Five of six do not replicate, and the sixth
contradicts what it replaces: two divergent construction paths published 0.89x
and then measured 1.14x, 1.21x and 1.34x on three consecutive sweeps — a cell
that was on the wrong side of 1.0. Two sweeps failed the region guard outright.
Those cells were already withdrawn by hand; they are now withdrawn on evidence.

**Everything else came back, and eleven published point estimates fell outside
their own replicated range** — `bench/tc11-report.js` prints each one. The most quoted
number in the project, accumulating array spread at n=10000, replicates at
1750–2011x — so **2348x is outside the replicated range and is no longer
quoted**. `Object.assign` copying at n=500 moved *up*, from 815x to 846–875x.
The ten `dispatch` and four `shapes` cells withdrawn under the old diagnosis are
measurements again: at RAM size the five-shape step survives construction for
`cls` (1.46–1.86x against 0.93–1.20x below it) and there is no step at all for
the object-shape load sweep (1.05–1.20x flat from two shapes to five). The
`strings` read-back cells came back at 0.74–0.87x.

**No rule's verdict moved.** Every rule that shipped still ships and every
refusal still refuses; what changed is the ranges they quote and, in four places,
which cells they are allowed to quote at all. `megamorphic-elements`,
`megamorphic-dispatch` and `accumulating-spread` carry new `EVIDENCE` strings.

Still open after this: the three cells this sweep left VOID under the region
guard are void because their single repetition overshoots 240 ms, which is a
different guard (TC-5) and is not touched here. Every benchmark in
`bench/run.js` that is not marked `replicated` still runs one sweep per cell —
rule 13 binds what is published, and only the flagged cells have been re-run
under it.

The audit follows, then the original report.

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

## TC-11 — the original report (2026-08-14)

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

## TC-10 — the walk follows calls but not constructors (2026-08-13, FIXED 2026-08-29)

`reach()` in `lib/scan.ts` visits `ts.isCallExpression(node)` only. A
`new Foo(...)` is a `NewExpression`, so the walk never enters the constructor
and never reports it as unreadable either.

Two consequences. A constructor in your own source is not checked, so a rule
violation inside it is missed. A constructor from a typed dependency is not
listed as an escape, so the closed-world report says the world is closed when
it is not — the failure mode the whole rule exists to prevent.

This matters more now that `allocating-select` ships: the pattern it detects is
an allocation, and allocation is what constructors do.

The fix is one predicate — accept `NewExpression` alongside `CallExpression`,
since both carry `expression` and `arguments` — plus a demo function, a test,
and a check that `usesDependency` does not double-report.

**FIXED 2026-08-29**, with one thing the plan above did not anticipate.
`new Foo()` resolves to the CLASS, not to a body, so the class is expanded to
its constructor before the followable test. A class the walk can read that
declares no constructor of its own runs a default one with no body: it is
neither followed nor reported, and without that case every `new Plain()` in a
program would have become a false escape. `isFunctionLike` accepts
`ConstructorDeclaration` now, so `/** @jitmax */` on a constructor also works.

`demo/lib.ts`'s `viaConstructor` covers both halves: the chain inside `Built`'s
constructor is found, and `new Bare()` reports nothing.

## ✅ FIXED 2026-08-10 — TC-1 — the protocol and bench/run.js disagreed

The protocol required 10 discarded pilot pairs, 50 measured pairs, and raw
observations. `bench/run.js` runs 1 calibration process, 20 measured pairs, and
writes only per-cell aggregates to `bench/shapes.jl`.

The array sweep's write-up already declared a sanctioned reduction to 20 pairs on
wall-clock grounds, so the pair count is defensible; the 1-vs-10 pilot gap and
the missing raw observations are not. A reader cannot recompute the intervals
from what is published, which is the one thing this project claims to offer.

Found by: codex round 5. Fixed both ways: the protocol now states the sanctioned
reduction to 20 pairs and one calibration run, and requires any near-1.0 cell
to be re-run at fifty before a rule ships on it; `bench/run.js` now writes the
raw per-pair `base` and `test` arrays next to each aggregate, so the interval
is recomputable.

## ✅ FIXED 2026-08-11 — TC-5 — the driver calibrated from a cold run, and it inflated ratios

Fixed in `bench/driver.js`: `calibrate()` now iterates the probe until two
successive rep-count estimates agree within 20%, so the count is derived from
warm cost; and `cell()` asserts the achieved timed region landed within 2x of
the 120 ms target, throwing when it did not. A mis-sized cell can no longer be
published as a result. Protocol rule 3 states both.

`bench/spread.jl` was re-run under the fix and the old file kept as
`bench/spread-precal.jl`. The re-run changed the published claims: the
`excl` cells at n=1000 and n=10000 both moved to REJECTED (0.87x CI 0.67-1.05
and 1.05x CI 0.89-1.26), which withdraws the "a spread-built array reads
faster" claim entirely — it was the artifact this defect predicted. The
construction effect grew rather than shrank once both sides were sized from
warm cost. `bench/chained.jl` is kept as `bench/chained-precal.jl` and
needs the same re-run before `chained-allocation` can be reconsidered.

The original report follows.

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

## ✅ FIXED 2026-08-11 — TC-7 — a truncated walk reported "clean"

The recursive walk stops at `MAX_BODIES` (200). It stopped silently, so a
function whose call tree exceeded the cap could be checked in part and still
print with no findings — and the run could end with "every annotated function
is clean". That is the failure mode this project exists to prevent: a checker
that quietly checks less than it claims.

Found by the CEO audit of the onepager, which caught the page admitting it in
its own limits section — *"the tool does not currently tell you it hit the
cap"* — and correctly called that unacceptable for anything gating CI.

Fixed: `Mark.truncated` records it, the report prints `WALK TRUNCATED` under
the affected function with the line "treat any silence from this function as
unproven", and the summary now refuses to say "clean" when any walk truncated —
it says "no findings, but N walks truncated: this is not a clean run."

## ✅ FIXED 2026-08-11 — TC-6 — an interrupted sweep lost every cell it had measured

All three runners wrote rows to an `fs.createWriteStream`. The sweep body
blocks the event loop from end to end in `execFileSync`, so the stream's
asynchronous `open()` callback never fired and every row stayed in the stream's
buffer until the run finished. The file did not exist on disk while the sweep
was printing results to the terminal.

Found by inspecting `/proc/<pid>/fd` after `ls bench/*.jl` showed no output
file for a sweep that had already printed eight cells. A 24-cell sweep that was
stopped part-way lost all twelve cells it had measured — half an hour of
machine time, gone, with the numbers visible in the log but not recorded
anywhere a tool could read.

Fixed: the runners now `fs.appendFileSync` one row per cell, so a cell is durable the moment it is
measured and an interrupted sweep keeps everything it finished.

## ✅ FIXED 2026-08-11 — TC-4 — two copies of the measurement protocol

`bench/run.js` now runs on `bench/driver.js` like every other sweep, so there
is one protocol and one place to fix it. Its own copy of `once`, `calibrate`,
`bootstrap` and `cell` is gone, and with it the single cold calibration probe
that TC-5 showed inflates ratios toward shipping a rule.

The 24 cells were re-run under the fixed driver and written to
`bench/shapes-calibrated.jl`. The two earlier sweeps stay on disk under
their own names — `shapes.jl` and `shapes-aggregates-only.jl` — because
they were produced by the old method and are not comparable cell-for-cell with
the new one. Nothing was deleted and nothing was overwritten.

The original report follows.

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

## TC-8 — megamorphic-elements fires without a property load (2026-08-11, FIXED 2026-08-28)

**FIXED 2026-08-28 in 0cf1005, with a correction in df8aafb.**
`readsFromElement` walks the body and the rule stays quiet unless something
reads a property off an element — a property access, an element access, a method
call, or a destructure. Narrowed to a READ on purpose: V8 charges the same
four-map budget at a StoreIC and at `in`, but `bench/shape-sets.js` measures
`s += r.x + r.y`, so firing on `r.x = v` would quote a read's number for a
write. `in` is the known gap and the code says so.

The survey then caught the fix overshooting. zod's `prefixIssues` is written
`(iss as any).path.unshift(path)`, so the receiver's type came back `any` and the
one true instance of this rule in twelve libraries went silent along with the
false ones. A cast is a claim about the type checker, not about the object; V8
loads from the object's map either way. The receiver is unwrapped through `as`,
`<T>`, `!` and parentheses.

Measured on real code, both directions: vue 46 findings before, 8 after; zod 10
before, 0 after the first fix, 10 again after the correction; TypeScript 19
before, 5 after. Across 22 codebases the rule fires 23 times. `fiveShapes` reads
`r.x`, `fiveShapesCast` reads through a cast, and `fiveShapesNoLoad` is the old
body — `return rows.length` — with a test asserting silence on it.

The rule reports "loads here go megamorphic" from the *type of a parameter*
alone. It never checks that the function loads a property from an element. The
cost it quotes, 3.6-10.6x, was measured on a kernel that does
`s += r.x + r.y` — an actual property load in a loop.

The project's own demo fixture proves the gap:

```ts
/** @jitmax */
export function fiveShapes(rows: (A | B | C | D | E)[]): number {
  return rows.length;
}
```

`rows.length` is a load on the array, not on any element. No element property is
ever read, so no element load site exists, so nothing can go megamorphic — and
the rule fires anyway, quoting the full cliff. `test/check.test.ts` asserts this
firing, which means the suite currently locks in a false positive.

Found by a commissioned adversarial teardown, verified here by running
the demo. This is the same family as TC-2 (a union member is not a V8 map) but
strictly worse: TC-2 is an unsound inference about how many maps reach a site,
TC-8 is firing where there is no site at all.

Not fixed inline: requiring a property-load site on the element changes what
the rule triggers on, which is a redesign of the flagship rule and needs
sign-off. Proposal: fire only when the annotated call tree contains an element
access on that parameter — an indexed access followed by a property read, or a
`for...of` binding whose properties are read — and re-point the demo fixture at
a kernel that matches the benchmark.

**2026-08-28 — implemented in the working tree, not yet committed.**
`lib/rules.ts` now requires a property READ off an element before the rule
fires; `TC-8` is gone from `DEFECT` and from this rule's `defects`. Verified:
a function whose only contact with a three-member union parameter is
`items.length` reports nothing, where the entry above says it fired. Mark this
✅ FIXED and fill the SHA when that change lands.

The narrowing is to a read, deliberately — a body that only writes `r.x = v`
pays a StoreIC that `bench/shape-sets.jl` never priced, and `in` is left out for
the same reason. That gap is stated in the code and is the honest boundary.

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
the mapping is unmeasured. `bench/optsize.js` reproduces it.
