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
type_run "sed -n '41,43p' examples/radash-assign.before.ts"
hold

note "now check it. this is a function radash ships, vendored verbatim."
# The exit code is read in the SAME command, because type_run sleeps before it
# evals: a separate `echo $?` would report that sleep and not the checker.
type_run "node bin/turbocharge.ts examples/radash-assign.before.ts; echo \"exit \$?\""

# The finding is fifteen lines of dense text and it is why anyone watches this.
# Two holds, so it can be read once here and once under the closing note.
hold
hold

note "exit 1 means it has something to report. 0 is clean, 2 is the tool failing."

hold
