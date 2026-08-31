---
name: service-eval
description: Run jitmax's release-health checks: installed CLI, honest first run, rule fixtures, real radash composition, and evidence drift.
user-invocable: true
---

# jitmax service evaluation

Run from the repository root. jitmax is a local CLI, not a daemon, so it has no
service log. Write each run to `tmp/service-eval/`; never use an earlier terminal
summary as evidence.

## Health checks

1. Run `make 2>&1 | tee tmp/service-eval/make.log`. Require exit 0,
   `# fail 0`, and a non-zero error count from the final `demo/` check. Exit 0
   from the demo command means every rule went silent on its own fixture.
2. Run the no-annotation fixture. Require exit 1, `0 annotated functions`,
   `nothing was checked`, and the instruction to add `/** @jitmax */`. Reject
   any output containing `every annotated function is clean`.
3. Run the runtime-only profile test by name. Require exit 0 from Node's test
   runner, and require that its nested CLI run exits 1 with the instruction to
   reach source code or lower `min_self_pct`.
4. Pack and install the current checkout into a fresh temporary npm project.
   Install TypeScript 5.9 beside it. Run the installed `jitmax` binary on
   `examples/radash-assign.before.ts`. Require CLI exit 1, exactly one
   `error  accumulating-spread`, and no `jitmax: cannot load` text. This check
   must use the tarball; a local package symlink does not reproduce Node's
   `node_modules` type-stripping rule. Run the same tarball with
   `npx --package <tarball> jitmax` and `bunx -p <tarball> jitmax`; require the
   same finding and exit 1 from both.
5. Run `make reality 2>&1 | tee tmp/service-eval/reality.log`. Require exit 0.
   The target itself requires ten errors at the pinned radash revision, exactly
   one `accumulating-spread` on `assign()`, and only the two escape rules beside
   it.
6. Run `make v8-check 2>&1 | tee tmp/service-eval/v8-check.log`. Require exit 0
   and `14 citations match`. A missing `v8src/` is unavailable evidence, not a
   pass.
7. If README or the site advertises `npx github:kronael/jitmax`, run
   `git ls-remote origin HEAD`. Require one non-empty ref. An empty remote means
   the package passed local tests but no public user can install it.

## Exact first-run commands

```sh
mkdir -p tmp/service-eval
node bin/jitmax.ts test/fixtures/noannot > tmp/service-eval/noannot.log 2>&1
test $? -eq 1
grep -Fq 'add `/** @jitmax */` above one hot function' tmp/service-eval/noannot.log
! grep -Fq 'every annotated function is clean' tmp/service-eval/noannot.log

node --test --test-name-pattern 'profile selecting no source function' \
  test/check.test.ts 2>&1 | tee tmp/service-eval/profile-empty.log
```

For the package check, create the temporary directory with `mktemp -d`. Keep it
when the check fails so the installed artifact can be inspected. Do not publish
the package and do not use `npm link`.

## Failure handling

- Record a reproducible code or output defect in `BUGS.md` before changing it.
- Put a new output contract or profile-selection contract in `BUGS.md` as a
  proposal. It needs owner sign-off before implementation.
- Put a forward feature, such as static hotness suggestion, in `TODO.md`.
- Write the run result and exact failed assertion to
  `.ship/critique-service-eval-YYYYMMDD.md`.
- Never regenerate `lib/numbers.ts` or `lib/builtins.ts` to make a drift check
  pass. Correct the source or the cited evidence first.

The release is healthy only when all seven checks pass. A clean unit suite cannot
replace the packed install, radash composition, or V8 citation checks because
each guards a failure that previously shipped.
