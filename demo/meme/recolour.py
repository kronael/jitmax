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
# The 8 keeps its explicit fill-opacity="1": its parent group paints at
# fill-opacity=".2", and a replace that dropped the attribute made the 8
# inherit the .2 — which is why the first card's circles read as a smudge.
s = s.replace('fill="#4285f4" fill-opacity="1"', 'class="v8-body" fill-opacity="1"')
# Chevron and wings get separate tones. Upstream draws the wings lighter than
# the V; flattening both to one grey merged the shapes into each other.
s = s.replace('fill="#424242"', 'class="v8-chev"')
s = s.replace('fill="#9e9e9e"', 'class="v8-wing"')
s = s.replace('fill="#fff"', 'fill="#0a0a0a"')
s = s.replace('fill="#263238"', 'fill="#0a0a0a"')
# Upstream lays a white radial haze over the whole mark. On its blue it is a
# sheen; on PH3's near-black it is the wash that made the mark look muddy.
s = s.replace('fill="url(#b)"', 'fill="none"')
s = s.replace('<svg xmlns', '<svg id="mark" xmlns')
s = s.replace(' fill="#fff" viewBox', ' fill="#0a0a0a" viewBox')

# Upstream moving its own fills would leave the rig with an unstyled mark that
# still renders, so the swap is checked rather than assumed.
if s.count('v8-body') != 2 or s.count('v8-chev') != 1 or s.count('v8-wing') != 1:
    sys.exit(f'v8-outline.svg no longer has the fills this recolour expects '
             f'(body {s.count("v8-body")}, chevron {s.count("v8-chev")}, '
             f'wing {s.count("v8-wing")}) — read it and fix the map')

here = pathlib.Path(__file__).parent
tpl = (here / 'rig.template.html').read_text()
assert '<!--V8SVG-->' in tpl
(here / 'rig.html').write_text(tpl.replace('<!--V8SVG-->', s))
print('demo/meme/rig.html written')
