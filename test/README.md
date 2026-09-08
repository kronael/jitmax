# The test suite

What the suite guards, and how to run one test.

```sh
make test    # 192 unit tests, including the must-stay-silent cases
node --test --test-name-pattern '<name>' test/check.test.ts   # one test
node --test test/check.test.ts test/tiers.test.ts test/provenance.test.ts
```

There is no build step. Node runs the TypeScript directly, and a test file is
run by name.

## The test files

`test/check.test.ts` holds the checker's tests and every register described
below. `test/tiers.test.ts` holds the tier diagnostic's tests.
`test/provenance.test.ts` checks representative builder sources and tracing limits.
`test/fixtures/` holds the TOML config a test loads and a call chain longer
than the walk's cap, which is how the truncation contract is exercised.

## What it guards

**One test per rule, and one per silent case.** Each rule fires on its fixture
in `demo/lib.ts` and stays quiet on the neighbouring fixture its own benchmark
refused. A rule that fires in a case its measurement rejected fails here, which
is the repository's central rule and not a style preference. `docs/rules.md`
names the two fixtures for every rule.

**The exit contract.** The exit code is what a CI gate reads, so it is tested
through the binary rather than through the library: 0 clean, 1 a finding or a
walk that could not see everything, 2 the tool failed. A truncated walk that
printed `WALK TRUNCATED` and exited 0 told the gate the opposite of what the
text said (`BUGS.md` TC-17), and that is the shape of failure these tests
exist for.

**Every published number, against its own rows.** `lib/numbers.ts` and the
generated block in `bench/README.md` are re-derived from the `.jl` files and
compared. A stale artifact fails `make test`; `make numbers` is the fix.

**Every ratio in the prose.** A ratio in any of the documentation files is
either a derived value or an entry in the `HISTORICAL` register with the reason
it cannot be — a superseded range quoted as superseded, a withdrawn rule's
cost, or the three sweeps of a cell rule 13 refuses. A NEW typed ratio fails
the build while history stays sayable (`BUGS.md` TC-73). The register is
checked in both directions: an entry that stops appearing, or that becomes a
derived value, fails too.

**The end-to-end tables.** Both tables in `examples/README.md` print every
sweep of every example cell and the interval its three sweeps share. They are
read back out of the file and re-derived from `bench/example.jl`, in both
directions: a cell that stops being printed is a measurement that left the page
and said nothing.

**The load gate, per sweep file.** `OVER_GATE` records how many rows in each
`.jl` were written while the machine was over that row's own gate, and how many
rows can be judged at all. A new row over the reworked gate fails here. A file
that can judge none of its rows is on record as unjudgeable rather than as
clean, because a judged count of 0 has answered no question.

**The version, the rule count and the test count.** `package.json` is the one
statement of the version and `lib/rules/index.ts` the one register of the
rules; `README.md`, `docs/rules.md`, `examples/README.md` and
`site/index.html` are held to them. The count beside `make test` at the top of
this file is compared against the tests the two files actually define.

**The packaging contract.** An installed copy runs compiled JavaScript from
`dist/`, and a checkout runs the TypeScript. Neither half shows up in a run
from a clone — the only place they are visible is somebody else's `npx` — so
both are asserted here (`BUGS.md` TC-72, TC-130).

## What it does not do

It does not run benchmarks. A sweep needs a quiet machine and takes hours;
`make test` must stay under a few seconds. What the suite checks is that the
numbers on the page are the numbers in the rows, never that the rows are right.
Re-running a sweep is the only thing that checks that, and `bench/README.md`
says how.
