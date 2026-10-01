#!/usr/bin/env bash
# Drives the recording behind demo/demo.gif. Every command here is typed on
# screen and really runs — the finding in the recording is the finding the tool
# prints today, against a function radash ships. Reproducible from a clean
# checkout: `make demo`.
#
# DEMO_TYPE=1 types character by character (for the recording); unset it and the
# same script runs instantly, which is how a human checks it still works.
set -u
cd "$(dirname "$0")/.."

G=$'\033[1;32m'; W=$'\033[1;37m'; C=$'\033[1;36m'; D=$'\033[0m'

note() { printf '\n%s# %s%s\n' "$C" "$*" "$D"; sleep "${NOTE_PAUSE:-1.6}"; }

# A pause the viewer needs, not one the machine needs. agg trims idle at
# --idle-time-limit, so that flag has to sit ABOVE the longest hold here or
# every deliberate pause is silently cut back to it — which is what made the
# first recording unreadable.
hold() { sleep "${HOLD_PAUSE:-4.5}"; }

type_run() {
	printf '%s$ %s' "$G" "$W"
	if [ "${DEMO_TYPE:-0}" = 1 ]; then
		local i
		for ((i = 0; i < ${#1}; i++)); do printf '%s' "${1:i:1}"; sleep 0.042; done
	else
		printf '%s' "$1"
	fi
	printf '%s\n' "$D"
	sleep "${RUN_PAUSE:-0.9}"
	eval "$1"
}

clear
note "mark the function you need fast. nothing else to configure."
# Lines 10-13 are the annotation and the signature under it. Pinned to the
# vendored file's real line numbers, which is why a range here is checked by
# make check rather than trusted: this said 41-43 against a 30-line file and
# printed nothing at all.
type_run "sed -n '10,13p' examples/radash-assign.before.ts"
hold

# Every narration line goes BEFORE the run, on its own screen. The finding is
# 26 lines of output in a 27-row terminal, so anything printed after it scrolls
# the top of the finding away — and the finding is what the last frame should
# hold.
note "now check it. this is a function radash ships, vendored verbatim."
note "exit 1 means it has something to report. 0 is clean, 2 is the tool failing."
note "this rule is about copying work, not about V8 — read the note it prints."
hold
clear

# `bun bin/cli.js` is the command the README's checkout route teaches, so a
# viewer can retype what they just watched.
# The exit code is read in the SAME command, because type_run sleeps before it
# evals: a separate `echo $?` would report that sleep and not the checker.
type_run "bun bin/cli.js examples/radash-assign.before.ts; echo \"exit \$?\""

# The finding is twenty lines of dense text and it is why anyone watches this.
# Three holds and nothing printed after them: the last frame is the finding.
hold
hold
hold
