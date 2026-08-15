.PHONY: test lint check v8-check bench bench-spread bench-spread-object bench-strings bench-select bench-chained bench-inline bench-addprop bench-dispatch bench-delete bench-arrays bench-tc11 example meme meme-png clean

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

bench:
	node bench/run.js

bench-spread:
	node bench/run-spread.js

bench-spread-object:
	node bench/run-spread-object.js

bench-strings:
	node bench/run-strings.js

bench-select:
	node bench/run-select.js

bench-chained:
	node bench/run-chained.js

bench-inline:
	node bench/run-inline.js

bench-addprop:
	node bench/run-addprop.js

bench-dispatch:
	node bench/run-dispatch.js

bench-delete:
	node bench/run-delete.js

bench-arrays:
	node bench/run-arrays.js

# The TC-11 cells, three sweeps each. Appends to the sweeps' own .jsonl files.
bench-tc11:
	node bench/run-tc11.js

# The end-to-end examples: three real library functions, the finding turbocharge
# printed on each, and what applying that fix is worth to a caller. The check
# comes first because the findings are the reason the benchmark exists; exit 1
# there means findings, which is the expected outcome, and exit 2 means the tool
# failed, which is not.
example:
	node bin/turbocharge.ts examples; test $$? -le 1
	node bench/run-example.js

meme:
	node bench/meme.js > meme.svg

# Social cards must be raster: X's card crawler does not render SVG and drops
# the image silently. Rasterized through the browser because no SVG converter
# is installed on this machine.
meme-png: meme
	agent-browser set viewport 1200 700 >/dev/null
	agent-browser open file://$(CURDIR)/meme.svg >/dev/null
	agent-browser screenshot svg $(CURDIR)/meme.png >/dev/null

clean:
	rm -f meme.svg meme.png tmp/probe.cjs

publish: meme meme-png
	cp meme.svg /srv/data/arizuko_krons/web/pub/turbocharge/meme.svg
	cp meme.png /srv/data/arizuko_krons/web/pub/turbocharge/meme.png
	cp site/index.html /srv/data/arizuko_krons/web/pub/turbocharge/index.html
