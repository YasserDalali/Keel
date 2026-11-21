#!/usr/bin/env bash
# Render sheets to PNG at 2x with headless Chrome. Usage: ./render.sh name [name...]  (names without .svg)
cd "$(dirname "$0")"
# Each sheet has a light file and a -dark file. The background is transparent, so the rounded corners show the page.
for n in "$@"; do
  for v in "" "-dark"; do
    google-chrome --headless --no-sandbox --disable-gpu --hide-scrollbars --default-background-color=00000000 \
      --force-device-scale-factor=2 --window-size=1600,$(grep -o "viewBox=\"0 0 1600 [0-9]*" "$n.svg" | head -1 | grep -o "[0-9]*$") \
      --screenshot="$PWD/$n$v.png" "file://$PWD/$n$v.svg" >/dev/null 2>&1 && echo "rendered $n$v"
  done
done
