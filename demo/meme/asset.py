# Turns the fetched meme panel into a PH3-palette plate.
#
# The source is the real "This Is Fine" comic, not a redrawing of it — a
# hand-copied meme reads cheap and stops being the reference it is quoting.
# `make meme` fetches it to tmp/; it is never committed here. See BUGS TC-30.
#
# The duotone is not decoration. The comic is orange, PH3 is near-black and
# red-p, and a warm orange panel dropped into this film would read as a
# screenshot of a different piece. Mapping its luminance onto the palette makes
# the fire the same red the loop uses for "off the fast path", which is the
# thing the fire is standing in for.
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'tmp' / 'thisisfine.jpg'
OUT = pathlib.Path(__file__).parent / 'fine.png'

if not SRC.exists():
    sys.exit(f'{SRC} is missing — `make meme` fetches it, see the target')

BG = (10, 10, 10)        # --bg
RED = (204, 41, 54)      # --red-p
LIT = (255, 107, 107)    # --red-lit
WHITE = (240, 255, 240)  # --white-p

# The ramp is fed INVERTED luminance. Mapped straight, the comic's bright paper
# becomes the brightest colour and the plate reads as a light card sitting on a
# near-black page — the panel wins the frame and PH3 loses it. Inverted, the ink
# lines carry white-p, the paper falls to the page's own near-black, and the
# fire lands in the middle, on the red the loop already uses for "off the fast
# path". Four stops rather than two, because a straight two-colour ramp flattens
# the fire and the dog into one mid tone.
STOPS = [(0.00, BG), (0.30, RED), (0.62, LIT), (1.00, WHITE)]


def ramp(x: float) -> tuple[int, int, int]:
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if x <= b:
            k = 0.0 if b == a else (x - a) / (b - a)
            return (
                round(ca[0] + (cb[0] - ca[0]) * k),
                round(ca[1] + (cb[1] - ca[1]) * k),
                round(ca[2] + (cb[2] - ca[2]) * k),
            )
    return STOPS[-1][1]


lut = [ramp(1 - i / 255) for i in range(256)]
grey = Image.open(SRC).convert('L')
plate = Image.new('RGB', grey.size)
plate.putdata([lut[p] for p in grey.getdata()])

# Upscaled here rather than in the browser: the rig places it at a fixed width,
# and scaling a 580px source up in CSS softens the comic's ink lines.
plate = plate.resize((plate.width * 2, plate.height * 2), Image.Resampling.LANCZOS)
plate.save(OUT)
print(f'{OUT.name} written, {plate.width}x{plate.height}')
