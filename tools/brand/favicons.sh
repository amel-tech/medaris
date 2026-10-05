#!/usr/bin/env bash
# Regenerates every app's favicon from tools/brand/medaris-mark.svg: the
# Medaris mark of design-system/medaris-unified (assets/logo-mark.svg) with
# its two colours written in (--icon-logo-ground = laciverd-700 #343D93,
# --icon-logo-arch = laciverd-50 #EBEFFD), the same in both themes.
#
#   Next apps (landing, tedris, nizam, nazir): app/icon.svg, app/favicon.ico
#     (16, 32, 48) and app/apple-icon.png (180), which Next serves by file
#     convention; every middleware matcher skips paths with a dot.
#   keycloak-theme: public/favicon.svg, public/favicon-32x32.png and
#     public/apple-touch-icon.png, linked from index.html.
#
# Needs rsvg-convert and python3 with Pillow. Run from the repository root.
set -euo pipefail

src=tools/brand/medaris-mark.svg
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for size in 16 32 48 180; do
  rsvg-convert -w "$size" -h "$size" "$src" -o "$tmp/$size.png"
done
python3 - "$tmp" <<'PY'
import sys
from PIL import Image
tmp = sys.argv[1]
images = [Image.open(f"{tmp}/{s}.png").convert("RGBA") for s in (48, 32, 16)]
images[0].save(f"{tmp}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=images[1:])
PY

for app in landing tedris nizam nazir; do
  cp "$src" "apps/$app/app/icon.svg"
  cp "$tmp/favicon.ico" "apps/$app/app/favicon.ico"
  cp "$tmp/180.png" "apps/$app/app/apple-icon.png"
done

cp "$src" apps/keycloak-theme/public/favicon.svg
cp "$tmp/32.png" apps/keycloak-theme/public/favicon-32x32.png
cp "$tmp/180.png" apps/keycloak-theme/public/apple-touch-icon.png
