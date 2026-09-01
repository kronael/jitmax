# Convert the fetched "This Is Fine" panel to the film palette.
import pathlib
import sys

from PIL import Image

SRC = pathlib.Path('tmp/thisisfine.jpg')
OUT = pathlib.Path('demo/meme/fine.png')

if not SRC.exists():
    sys.exit(f'{SRC} is missing — `make meme` fetches it, see the target')

BG = (10, 10, 10)        # --bg
RED = (204, 41, 54)      # --red-p
LIT = (255, 107, 107)    # --red-lit
WHITE = (240, 255, 240)  # --white-p

# The ramp is fed INVERTED luminance. Mapped straight, the comic's bright paper
# becomes the brightest colour and the panel wins the frame from the film. Four
# stops, not two: a two-colour ramp flattens the fire and the dog to one tone.
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

# Scale once before capture to keep the ink lines sharp.
plate = plate.resize((plate.width * 2, plate.height * 2), Image.Resampling.LANCZOS)
plate.save(OUT)
print(f'{OUT.name} written, {plate.width}x{plate.height}')
