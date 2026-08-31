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
