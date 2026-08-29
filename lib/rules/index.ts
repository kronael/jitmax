import type * as TS from 'typescript';
import type { Ts } from '../ts.ts';
import type { Mark } from '../scan.ts';
import type { Add, Evidence, Finding, Rule } from './shared.ts';
import { megamorphicElements } from './megamorphic-elements.ts';
import { megamorphicDispatch } from './megamorphic-dispatch.ts';
import { accumulatingSpread } from './accumulating-spread.ts';
import { allocatingSelect } from './allocating-select.ts';
import { chainedAllocation } from './chained-allocation.ts';
import { closedWorld } from './closed-world.ts';
import { deleteProperty } from './delete-property.ts';

export type { Evidence, Finding } from './shared.ts';

// One line per code in `defects`, taken from the BUGS.md heading. Keep in
// sync with BUGS.md: a code appears here only if a rule's `defects` cites it.
export const DEFECT: Record<string, string> = {
  'TC-2': 'a TypeScript union member is not a V8 map',
  'TC-9': 'rules fire outside the conditions their own evidence establishes',
  'TC-13': 'a method in a field has no four-map budget',
  'TC-33': 'the rule fires on one program and its benchmark measured another',
};

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
export const EVIDENCE: Record<string, Evidence> = {
  [megamorphicElements.name]: megamorphicElements.evidence,
  [megamorphicDispatch.name]: megamorphicDispatch.evidence,
  [accumulatingSpread.name]: accumulatingSpread.evidence,
  [allocatingSelect.name]: allocatingSelect.evidence,
  [chainedAllocation.name]: chainedAllocation.evidence,
  [closedWorld.name]: closedWorld.evidence,
  [deleteProperty.name]: deleteProperty.evidence,
};

const RULES: Rule[] = [
  megamorphicElements.detect,
  megamorphicDispatch.detect,
  accumulatingSpread.detect,
  allocatingSelect.detect,
  chainedAllocation.detect,
  deleteProperty.detect,
];

export function check(ts: Ts, checker: TS.TypeChecker, mark: Mark): Finding[] {
  const findings: Finding[] = [];
  const add: Add = (f) => findings.push({ ...f, evidence: EVIDENCE[f.rule] ?? null });
  // Every rule over every body the annotation reaches. njit compiles the call
  // tree; we check the call tree.
  for (const body of mark.reached) {
    for (const rule of RULES) rule(ts, checker, body, add, mark);
  }
  closedWorld.detect(mark, add);
  return findings;
}

// A disable key is either a rule name, or a defect code that names every rule
// carrying it — a config's [rules] table and an annotation's `-key` both go
// through here. An unknown key is not disabling anything, silently, which is
// the same lie a typo tells anywhere else in this project: it throws instead.
export function resolveDisabled(keys: Iterable<string>): Set<string> {
  const rules = new Set<string>();
  for (const key of keys) {
    if (key in EVIDENCE) {
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
