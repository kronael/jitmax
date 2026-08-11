.PHONY: test lint check bench bench-spread bench-chained bench-inline meme meme-png clean

test:
	node --test test/check.test.ts

lint:
	npx tsc --noEmit

check:
	node bin/turbocharge.ts demo

bench:
	node bench/run.js

bench-spread:
	node bench/run-spread.js

bench-chained:
	node bench/run-chained.js

bench-inline:
	node bench/run-inline.js

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
