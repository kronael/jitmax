#!/usr/bin/env bash
# Cuts the film: joke, proof, payoff.
#
#   act one   the meme panel — your function looks fine and nothing said otherwise
#   act two   the REAL terminal recording, unaltered
#   act three the V8 mark takes the hit and comes back, with the measured number
#
# The middle act is the reason the other two are allowed to make a claim, so it
# is never a mock-up: demo/demo.mp4 is asciinema driving demo/cast.sh. The two
# rig acts are captured at different frame densities because act one is text to
# read and act three is a strike — sampling one t-space uniformly starves the
# first and pads the second.
set -euo pipefail
cd "$(dirname "$0")/../.."

BG=0x0a0a0a          # --bg, the colour the terminal is padded out to
FPS=24
A1_FRAMES=180        # 7.5s — seven names arriving one at a time
A3_FRAMES=120        # 5.0s — the strike and the lockup

node demo/meme/capture.js "$A1_FRAMES" 0    0.42 meme-a1
node demo/meme/capture.js "$A3_FRAMES" 0.42 1.0  meme-a3

# One re-encode rather than three files and a concat demuxer: the segments come
# from different sources (PNG sequences and a gif-derived mp4) and the demuxer
# needs them already identical in codec, timebase and pixel format.
#
# The terminal is PADDED, never scaled. agg rendered it at 1028x548 and every
# glyph is on a whole pixel; scaling it to the canvas would soften the one part
# of the film that has to look like a real screen.
ffmpeg -y -loglevel error \
  -framerate "$FPS" -i tmp/meme-a1/%04d.png \
  -i demo/demo.mp4 \
  -framerate "$FPS" -i tmp/meme-a3/%04d.png \
  -filter_complex "\
    [0]fps=$FPS,format=yuv420p[a]; \
    [1]pad=1200:630:(ow-iw)/2:(oh-ih)/2:color=$BG,fps=$FPS,format=yuv420p[b]; \
    [2]fps=$FPS,format=yuv420p[c]; \
    [a][b][c]concat=n=3:v=1:a=0[v]" \
  -map "[v]" -movflags faststart -pix_fmt yuv420p -crf 20 \
  demo/meme/turbo.mp4

# The gif is only the fallback for a browser that will not autoplay video, so
# it is sized for someone on a phone who is about to be served it by accident:
# 480px at 8fps. At 600px and 10fps the same 37 seconds came to 2.7MB.
ffmpeg -y -loglevel error -i demo/meme/turbo.mp4 \
  -vf "fps=8,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  demo/meme/turbo.gif

# The social card is a frame of act three, not a separate design: whatever the
# film ends on is what the link preview shows.
cp "tmp/meme-a3/$(printf '%04d' $((A3_FRAMES - 12))).png" demo/meme/turbo-card.png

printf 'turbo.mp4 %s  turbo.gif %s\n' \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 demo/meme/turbo.mp4)" \
  "$(du -h demo/meme/turbo.gif | cut -f1)"
