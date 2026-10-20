#!/bin/sh
# The whole local suite (Wix mocked; no network to Wix needed).
set -e
cd "$(dirname "$0")"
for t in layout motion menu drawer; do
  echo "== $t"
  node "$t.mjs" | tail -1
done
