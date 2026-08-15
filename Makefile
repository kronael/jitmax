.PHONY: test lint check v8-check numbers bench bench-spread bench-spread-object bench-strings bench-select bench-chained bench-inline bench-addprop bench-dispatch bench-delete bench-arrays bench-tc11 example meme meme-png clean

test:
	node --test test/check.test.ts

lint:
	npx tsc --noEmit

check:
	node bin/turbocharge.ts demo

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

bench-dispatch:
	node bench/run.js dispatch

bench-delete:
	node bench/run.js delete

bench-arrays:
	node bench/run.js arrays

# The TC-11 cells, three sweeps each. Appends to the sweeps' own .jl files.
bench-tc11:
	node bench/run.js tc11

# The end-to-end examples: three real library functions, the finding turbocharge
# printed on each, and what applying that fix is worth to a caller. The check
# comes first because the findings are the reason the benchmark exists; exit 1
# there means findings, which is the expected outcome, and exit 2 means the tool
# failed, which is not.
example:
	node bin/turbocharge.ts examples; test $$? -le 1
	node bench/run.js example

meme:
	node bench/meme.js > meme.svg

# Social cards must be raster: X's card crawler does not render SVG and drops
# the image silently. Rasterized through the browser because no SVG converter
# is installed on this machine.
meme-png: meme
	agent-browser set viewport 1200 700 >/dev/null
	agent-browser open file://$(CURDIR)/meme.svg >/dev/null
	agent-browser screenshot svg $(CURDIR)/meme.png >/dev/null

# The two build products, both gitignored. `lib/numbers.ts` is generated too but
# is tracked and imported, so it is not a clean target — deleting it breaks the
# build until `make numbers` runs. `tmp/probe.cjs` used to be listed here and no
# target has ever written it: a hand-run scratch file clean had no business
# deleting.
clean:
	rm -f meme.svg meme.png

publish: meme meme-png
	cp meme.svg /srv/data/arizuko_krons/web/pub/turbocharge/meme.svg
	cp meme.png /srv/data/arizuko_krons/web/pub/turbocharge/meme.png
	cp site/index.html /srv/data/arizuko_krons/web/pub/turbocharge/index.html
