# The workflow: after appending a .jl sweep or moving the V8 pin, `make build`
# regenerates the derived artifacts; commit them, and `make` confirms they
# still match their sources. `all` never runs `build` — regenerating right
# before the drift assertions would leave them comparing fresh against fresh,
# and a stale committed artifact could never fail again.
.DEFAULT_GOAL := all
.PHONY: all verify build builtins test lint check v8-check reality numbers bench bench-all bench-shape-sets bench-spread bench-spread-object bench-strings bench-select bench-chained bench-inline bench-addprop bench-arguments bench-sparse bench-dispatch bench-delete bench-arrays bench-tc11 tiers example demo meme publish clean

all: lint test check

# Every gate, in the order a release needs them: `all` first because it needs
# nothing but the repo, then the two that need a checkout somebody has to clone
# (v8src/ and radash) and say so when they do not have it. This is the whole
# pre-publication list, in one place, because it was three commands and a
# paragraph of prose, and the paragraph is what went stale (TC-123).
verify: all v8-check reality

# Regenerate every derived artifact. Never a prerequisite of `all` or `test`.
build: numbers builtins

test:
	node --test test/check.test.ts test/tiers.test.ts test/provenance.test.ts

lint:
	npx tsc --noEmit

# demo/ holds every rule's fixture, so findings are the expected outcome:
# exit 1 means the tool ran and found them, 0 means the rules went quiet on
# their own fixtures, 2 means the tool failed.
check:
	node bin/jitmax.ts demo; test $$? -eq 1

# Every V8 citation in bench/README.md against the pinned checkout. Exits
# non-zero when v8src/ is missing rather than passing quietly.
v8-check:
	node bench/v8-check.ts

# The tool against somebody else's library: radash. Every finding is an error
# since 2026-08-31, so the gate reads the composition rather than the count
# alone: exactly ONE error is accumulating-spread, on `assign`, and every other
# error is an escape rule — radash's callback parameters, which the walk reports
# rather than drops. A third rule anywhere in the log is a false positive, and so
# is a second accumulating-spread. The total is pinned too, at the revision CI
# clones: a local checkout at another revision fails here and the count it
# printed is the message. A missing checkout exits 2 and says how to get it
# rather than passing quietly, the same rule as v8-check. This was prose nothing
# ran, and it asked for a count that had been wrong for a release (TC-123).
REAL = tmp/demo-real
REAL_ERRORS = 10
reality:
	@test -d $(REAL)/src || { \
	  echo "reality: $(REAL)/src is missing. git clone https://github.com/rayepps/radash $(REAL)"; \
	  exit 2; }
	@mkdir -p tmp
	@node bin/jitmax.ts $(REAL)/src > tmp/reality.log 2>&1; \
	  test $$? -le 1 || { echo "reality: the tool failed"; cat tmp/reality.log; exit 2; }
	@head -1 tmp/reality.log | grep -q ", $(REAL_ERRORS) errors" || { \
	  echo "reality: expected $(REAL_ERRORS) errors at the pinned radash revision"; \
	  head -1 tmp/reality.log; exit 1; }
	@test "`grep -c 'error  accumulating-spread' tmp/reality.log`" = 1 || { \
	  echo "reality: accumulating-spread must fire exactly once — a second is a false positive"; \
	  grep -n 'error  accumulating-spread' tmp/reality.log; exit 1; }
	@grep -B1 'error  accumulating-spread' tmp/reality.log | grep -q 'object.ts:.*assign()' || { \
	  echo "reality: the one accumulating-spread is no longer on assign()"; \
	  grep -B1 'error  accumulating-spread' tmp/reality.log; exit 1; }
	@! grep 'error  ' tmp/reality.log \
	   | grep -qvE 'accumulating-spread|closed-world|interface-dispatch' || { \
	  echo "reality: a rule other than assign's and the escapes fired — a false positive"; \
	  grep 'error  ' tmp/reality.log \
	    | grep -vE 'accumulating-spread|closed-world|interface-dispatch'; exit 1; }
	@head -1 tmp/reality.log

# Every published ratio, re-derived from the .jl sweeps into lib/numbers.ts and
# bench/README.md's generated block. `make test` fails when they are out of date.
numbers:
	node lib/derive.ts --write

# The builtins TurboFan lowers to inline code, re-derived from the pinned
# v8src/ checkout into lib/builtins.ts. `make test` fails when the committed
# list and the source disagree; deriving needs the checkout (see v8-check).
builtins:
	node lib/derive-builtins.ts --write

bench:
	node bench/run.ts shapes

bench-shape-sets:
	node bench/run.ts shape-sets

bench-spread:
	node bench/run.ts spread

bench-spread-object:
	node bench/run.ts spread-object

bench-strings:
	node bench/run.ts strings

bench-select:
	node bench/run.ts select

bench-chained:
	node bench/run.ts chained

bench-inline:
	node bench/run.ts inline

bench-addprop:
	node bench/run.ts addprop

bench-arguments:
	node bench/run.ts arguments

bench-sparse:
	node bench/run.ts sparse

bench-dispatch:
	node bench/run.ts dispatch

bench-delete:
	node bench/run.ts delete

bench-arrays:
	node bench/run.ts arrays

# The TC-11 cells, three sweeps each. Appends to the sweeps' own .jl files.
bench-tc11:
	node bench/run.ts tc11

# Every sweep, in the order bench/run.ts declares, appending a manifest row per
# sweep to bench/manifest.jsonl — what ran, when, on what, and how long, so a
# release can point at one artifact instead of twelve terminal logs. Hours. The
# load gate refuses to start on a busy machine; --wait-load makes it wait
# instead.
bench-all:
	node bench/run.ts --all

# Which tier the measured code was actually in — the diagnostic, never an
# evidence run (protocol rule 8). Reads every published cell's shape, at the
# rep count that cell was published at, and appends to bench/tiers.jl.
tiers:
	node bench/tiers.ts all

# The end-to-end examples: the checker over every vendored library function,
# then the sweep over the four whose fix is a rewrite — what applying it is
# worth to a caller. The check comes first because the findings are the reason
# the benchmark exists; exit 1 there means findings, which is the expected
# outcome, and exit 2 means the tool failed, which is not.
example:
	node bin/jitmax.ts examples; test $$? -le 1
	node bench/run.ts example

# The terminal demo. The recording is REAL — asciinema drives demo/cast.sh,
# which runs the checker against a function radash ships. Nothing here is drawn
# to look like a terminal. 27 rows because that is what the output occupies at
# 120 columns; a taller frame is half void, and agg must be told the same size
# asciinema recorded at or the gif crops. Font 14 renders 1028x548, which the
# film pads out to its 1200x630 canvas rather than scaling — scaling is what
# makes a terminal look like a picture of a terminal.
DEMO_SIZE = --cols 120 --rows 27
# PH3, from /pub/krons/ph3: bg, fg, then the 8 normal and 8 bright slots mapped
# onto near-black, red-p, white-p and muted. The script uses bright green for
# the prompt and bright cyan for narration, so those two slots carry red-p and
# muted rather than a colour PH3 does not have.
DEMO_THEME = 0a0a0a,f0fff0,0a0a0a,cc2936,cc2936,ff6b6b,888888,cc2936,888888,888888,\
555555,ff6b6b,cc2936,ff6b6b,888888,ff6b6b,888888,f0fff0

tmp/demo.cast: demo/cast.sh bin/jitmax.ts lib/rules.ts $(wildcard lib/rules/*.ts) examples/radash-assign.before.ts
	mkdir -p tmp
	COLUMNS=120 LINES=27 DEMO_TYPE=1 asciinema rec $@ --overwrite $(DEMO_SIZE) -c 'bash demo/cast.sh'

demo/demo.gif: tmp/demo.cast
	# --idle-time-limit must sit ABOVE the longest hold in cast.sh (4.5s) or
	# every pause written for the viewer is silently trimmed back to it, which
	# is what made the first cut unreadable.
	agg --theme $(subst $(space),,$(DEMO_THEME)) --font-size 14 $(DEMO_SIZE) \
	    --idle-time-limit 6 --last-frame-duration 3 $< $@

demo/demo.mp4: demo/demo.gif
	ffmpeg -y -loglevel error -i $< -movflags faststart -pix_fmt yuv420p \
	    -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' $@

demo: demo/demo.mp4

# The film: the meme panel, the real terminal recording, and the payoff.
# The "This Is Fine" panel is fetched into tmp/ and is not committed.
tmp/thisisfine.jpg:
	mkdir -p tmp
	curl -sSfL -o $@ https://i.imgflip.com/wxica.jpg

demo/meme/fine.png: demo/meme/asset.py tmp/thisisfine.jpg
	python3 demo/meme/asset.py

# Depends on demo/demo.mp4: act two IS that recording, so a change to what the
# checker prints re-cuts the film rather than leaving it quoting an old run.
demo/meme/jitmax.mp4: demo/meme/rig.html demo/meme/fine.png demo/meme/capture.js \
                     demo/meme/compose.sh demo/demo.mp4
	bash demo/meme/compose.sh

meme: demo/meme/jitmax.mp4

# `lib/numbers.ts` is generated too but is tracked and imported, so it is not a
# clean target — deleting it breaks the build until `make numbers` runs.
# `tmp/probe.cjs` used to be listed here and no target has ever written it: a
# hand-run scratch file clean had no business deleting.
clean:
	rm -f demo/meme/fine.png demo/meme/jitmax.mp4 demo/meme/jitmax.gif demo/meme/jitmax-card.png

# site/index.html is the page's ONE source. Editing the copy under the webroot
# instead leaves two versions of the same page and no way to tell which is
# current — which happened, and is why this comment is here.
publish: demo meme
	cp site/index.html $(WEB)/index.html
	cp demo/meme/jitmax.mp4 demo/meme/jitmax.gif demo/meme/jitmax-card.png $(WEB)/

WEB = /srv/data/arizuko_krons/web/pub/jitmax
space := $(subst ,, )
