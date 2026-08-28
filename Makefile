.PHONY: test lint check v8-check numbers bench bench-all bench-spread bench-spread-object bench-strings bench-select bench-chained bench-inline bench-addprop bench-dispatch bench-delete bench-arrays bench-tc11 tiers example demo meme publish clean

test:
	node --test test/check.test.ts test/tiers.test.js

lint:
	npx tsc --noEmit

check:
	node bin/jitmax.ts demo

# Every V8 citation in README.md against the pinned checkout. Exits
# non-zero when v8src/ is missing rather than passing quietly.
v8-check:
	node bench/v8-check.js

# Every published ratio, re-derived from the .jl sweeps into lib/numbers.ts and
# README's generated block. `make test` fails when they are out of date.
numbers:
	node lib/derive.ts --write

bench:
	node bench/run.js shapes

bench-spread:
	node bench/run.js spread

bench-spread-object:
	node bench/run.js spread-object

bench-strings:
	node bench/run.js strings

bench-select:
	node bench/run.js select

bench-chained:
	node bench/run.js chained

bench-inline:
	node bench/run.js inline

bench-addprop:
	node bench/run.js addprop

bench-arguments:
	node bench/run.js arguments

bench-sparse:
	node bench/run.js sparse

bench-dispatch:
	node bench/run.js dispatch

bench-delete:
	node bench/run.js delete

bench-arrays:
	node bench/run.js arrays

# The TC-11 cells, three sweeps each. Appends to the sweeps' own .jl files.
bench-tc11:
	node bench/run.js tc11

# Every sweep, in the order bench/run.js declares, appending a manifest row per
# sweep to bench/manifest.jsonl — what ran, when, on what, and how long, so a
# release can point at one artifact instead of twelve terminal logs. Hours. The
# load gate refuses to start on a busy machine; --wait-load makes it wait
# instead.
bench-all:
	node bench/run.js --all

# Which tier the measured code was actually in — the diagnostic, never an
# evidence run (protocol rule 8). Reads every published cell's shape, at the
# rep count that cell was published at, and appends to bench/tiers.jl.
tiers:
	node bench/tiers.js all

# The end-to-end examples: four real library functions, the finding jitmax
# printed on each, and what applying that fix is worth to a caller. The check
# comes first because the findings are the reason the benchmark exists; exit 1
# there means findings, which is the expected outcome, and exit 2 means the tool
# failed, which is not.
example:
	node bin/jitmax.ts examples; test $$? -le 1
	node bench/run.js example

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

tmp/demo.cast: demo/cast.sh bin/jitmax.ts lib/rules.ts examples/radash-assign.before.ts
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
# Two source images, both somebody else's and NEITHER committed here — the V8
# mark and the "This Is Fine" panel are fetched into tmp/. See BUGS TC-30.
tmp/v8-outline.svg:
	mkdir -p tmp
	curl -sSfL -o $@ https://v8.dev/_img/v8-outline.svg

tmp/thisisfine.jpg:
	mkdir -p tmp
	curl -sSfL -o $@ https://i.imgflip.com/wxica.jpg

demo/meme/fine.png: demo/meme/asset.py tmp/thisisfine.jpg
	python3 demo/meme/asset.py

demo/meme/rig.html: demo/meme/rig.template.html demo/meme/recolour.py tmp/v8-outline.svg
	python3 demo/meme/recolour.py

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
	rm -f demo/meme/rig.html demo/meme/fine.png demo/meme/jitmax.mp4 demo/meme/jitmax.gif demo/meme/jitmax-card.png

# site/index.html is the page's ONE source. Editing the copy under the webroot
# instead leaves two versions of the same page and no way to tell which is
# current — which happened, and is why this comment is here.
publish: demo meme
	cp site/index.html $(WEB)/index.html
	cp demo/meme/jitmax.mp4 demo/meme/jitmax.gif demo/meme/jitmax-card.png $(WEB)/

WEB = /srv/data/arizuko_krons/web/pub/jitmax
space := $(subst ,, )
