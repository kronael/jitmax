import type * as TS from 'typescript';
import type { Ts } from '../ts.ts';
import { inClosure, siteKey, type Mark, type Once } from '../scan.ts';
import type { Add, Evidence, Finding, RuleModule } from './shared.ts';
import { megamorphicElements } from './megamorphic-elements.ts';
import { megamorphicDispatch } from './megamorphic-dispatch.ts';
import { accumulatingSpread } from './accumulating-spread.ts';
import { allocatingSelect } from './allocating-select.ts';
import { chainedAllocation } from './chained-allocation.ts';
import { closedWorld } from './closed-world.ts';
import { interfaceDispatch } from './interface-dispatch.ts';
import { deleteProperty } from './delete-property.ts';

export type { Evidence, Finding } from './shared.ts';

// One line per code in `defects`, taken verbatim from the BUGS.md heading —
// backticks stripped, because this is printed to a terminal and not rendered.
// Both directions are asserted against BUGS.md by `make test`: nothing checked
// this register at all, and two lines had drifted while a third named a defect
// this repository had closed, so every finding of `interface-dispatch` printed
// `known defect: TC-82` about a defect that no longer existed (BUGS TC-98).
export const DEFECT: Record<string, string> = {
  'TC-44': "allocating-select fires on a value that never escapes, and prints the wrong cell's number",
  'TC-2': 'a TypeScript union member is not a V8 map',
  'TC-9': 'rules fire outside the conditions their own evidence establishes',
  'TC-13': 'a method in a field has no four-map budget',
  'TC-33': "closed-world's trigger and its benchmark measure different things",
};

// Every rule, once. `EVIDENCE`, the disable vocabulary `resolveDisabled` reads
// and the order `check` runs them in are all derived from this list. It used to
// be three registers — a hand-written map of eight evidences, a hand-written
// array of the six per-body detectors, and two more detectors called by name
// below both — so a rule could reach two of the three and lose its evidence
// silently, which downgrades it to a warning and takes it out of the exit code.
const ALL: RuleModule[] = [
  megamorphicElements,
  megamorphicDispatch,
  accumulatingSpread,
  allocatingSelect,
  chainedAllocation,
  deleteProperty,
  closedWorld,
  interfaceDispatch,
];

// Every rule cites a measurement, and the measurement also says where the rule
// must stay quiet. `silent` is not a caveat, it is a test: a rule that fires
// there is contradicting this project's own evidence.
//
// Every number in all three fields — `cost`, `source` AND `silent` — is
// interpolated from `lib/numbers.ts`, which `make numbers` derives from the
// `.jl` rows. `silent` was hand-typed until 2026-08-16 on the argument that a
// clause is prose; the consequence was that five clauses went on quoting sweeps
// that no longer existed while every other number in the repo moved with its
// data (BUGS TC-23, TC-26, TC-27, TC-28). Write the sentences here; never write
// a figure here.
export const EVIDENCE: Record<string, Evidence> = Object.fromEntries(
  ALL.map((rule) => [rule.name, rule.evidence])
);

export function check(ts: Ts, checker: TS.TypeChecker, mark: Mark): Finding[] {
  const findings: Finding[] = [];
  // Every finding carries the `once` of the body it sits in, so the report can
  // tell a site that runs per call from one that runs when a class is defined
  // — unless it sits in a closure nested in that body (BUGS TC-107).
  const push = (f: Omit<Finding, 'evidence'>, once: Once | undefined): void => {
    findings.push({ ...f, once, evidence: EVIDENCE[f.rule] ?? null });
  };
  // Every per-body rule over every body the annotation reaches. njit compiles
  // the call tree; we check the call tree.
  for (const body of mark.reached) {
    const add: Add = (f) =>
      push(f, body.once !== undefined && !inClosure(ts, body, f) ? body.once : undefined);
    for (const rule of ALL) if (rule.scope === 'body') rule.detect(ts, checker, body, add, mark);
  }
  // The escape rules read the whole mark once: `mark.escapes` is a property of
  // the walk, and running them per body would report every unfollowable call
  // once per body in the tree. Their findings sit at the escape's own site.
  const onceAt = new Map(mark.escapes.map((c) => [siteKey(c), c.once]));
  const add: Add = (f) => push(f, onceAt.get(siteKey(f)));
  for (const rule of ALL) if (rule.scope === 'escapes') rule.detect(mark, add);
  return findings;
}

// A disable key is either a rule name, or a defect code that names every rule
// carrying it — a config's [rules] table and an annotation's `-key` both go
// through here. An unknown key is not disabling anything, silently, which is
// the same lie a typo tells anywhere else in this project: it throws instead.
export function resolveDisabled(keys: Iterable<string>): Set<string> {
  const rules = new Set<string>();
  for (const key of keys) {
    if (Object.hasOwn(EVIDENCE, key)) {
      rules.add(key);
      continue;
    }
    const byDefect = Object.entries(EVIDENCE).filter(([, e]) => e.defects.includes(key));
    if (byDefect.length === 0) {
      throw new Error(`unknown rule or defect code: ${key}`);
    }
    for (const [name] of byDefect) rules.add(name);
  }
  return rules;
}
