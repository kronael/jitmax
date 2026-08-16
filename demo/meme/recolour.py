# Inlines the V8 mark into the loop rig, recoloured to the PH3 palette.
#
# The mark is Google's and is NOT committed here: `make meme` fetches it to
# tmp/ first. Only fill and stroke attributes are rewritten — every coordinate
# stays upstream's, so the piece uses the real mark rather than a redrawing of
# it, which is the same rule examples/ follows for somebody else's code.
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[2]
src = root / 'tmp' / 'v8-outline.svg'
if not src.exists():
    sys.exit(f'{src} is missing — `make meme` fetches it, see the target')

s = src.read_text()
s = s.replace('fill="#4285f4" stroke="#fff" stroke-miterlimit="10" stroke-width="150"',
              'class="v8-body" stroke="#0a0a0a" stroke-miterlimit="10" stroke-width="150"')
s = s.replace('fill="#4285f4" fill-opacity="1"', 'class="v8-body"')
s = s.replace('fill="#424242"', 'class="v8-chev"')
s = s.replace('fill="#9e9e9e"', 'class="v8-chev"')
s = s.replace('fill="#fff"', 'fill="#0a0a0a"')
s = s.replace('fill="#263238"', 'fill="#0a0a0a"')
s = s.replace('<svg xmlns', '<svg id="mark" xmlns')
s = s.replace(' fill="#fff" viewBox', ' fill="#0a0a0a" viewBox')

# Upstream moving its own fills would leave the rig with an unstyled mark that
# still renders, so the swap is checked rather than assumed.
if s.count('v8-body') != 2 or s.count('v8-chev') != 2:
    sys.exit(f'v8-outline.svg no longer has the fills this recolour expects '
             f'(body {s.count("v8-body")}, chevron {s.count("v8-chev")}) — read it and fix the map')

here = pathlib.Path(__file__).parent
tpl = (here / 'rig.template.html').read_text()
assert '<!--V8SVG-->' in tpl
(here / 'rig.html').write_text(tpl.replace('<!--V8SVG-->', s))
print('demo/meme/rig.html written')
