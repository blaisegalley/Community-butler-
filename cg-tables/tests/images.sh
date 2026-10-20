#!/bin/sh
# Every image recorded in wix-site.json must load as an image.
set -e
cd "$(dirname "$0")/.."
for u in $(grep -oE 'https://[^"]+' wix-site.json | grep -iE '\.(png|jpe?g|webp)'); do
  ct=$(curl -sSIL "$u" | grep -i '^content-type' | tail -1)
  echo "$ct" | grep -qi 'image/' || { echo "FAIL $u ($ct)"; exit 1; }
  echo "ok $u"
done
