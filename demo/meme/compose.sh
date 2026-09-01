#!/usr/bin/env bash
# Cuts the film: joke, proof, payoff.
#
#   act one   the meme panel — your function looks fine and nothing said otherwise
#   act two   the REAL terminal recording, unaltered
#   act three the word V8 takes the hit and returns, with the measured number
#
# Act two is the current demo/demo.mp4 recording. The rig acts use separate
# frame counts because act one needs reading time and act three needs motion.
set -Eeuo pipefail

BG=0x0a0a0a          # --bg, the colour the terminal is padded out to
FPS=24
A1_FRAMES=204        # 8.5s — eight names arriving one at a time. 180 gave
                     # the last name 0.02s at full opacity before the fade.
A3_FRAMES=120        # 5.0s — the strike and the lockup

node demo/meme/capture.js "$A1_FRAMES" 0    0.42 meme-a1
node demo/meme/capture.js "$A3_FRAMES" 0.42 1.0  meme-a3

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
  -map "[v]" -movflags faststart -crf 20 \
  demo/meme/jitmax.mp4

# The gif is only the fallback for a browser that will not autoplay video, so
# it is sized for someone on a phone who is about to be served it by accident:
# 480px at 8fps. At 600px and 10fps the same 37 seconds came to 2.7MB.
ffmpeg -y -loglevel error -i demo/meme/jitmax.mp4 \
  -vf "fps=8,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  demo/meme/jitmax.gif

# The social card is a frame of act three, not a separate design: whatever the
# film ends on is what the link preview shows.
cp "tmp/meme-a3/$(printf '%04d' $((A3_FRAMES - 12))).png" demo/meme/jitmax-card.png

printf 'jitmax.mp4 %s  jitmax.gif %s\n' \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 demo/meme/jitmax.mp4)" \
  "$(du -h demo/meme/jitmax.gif | cut -f1)"
