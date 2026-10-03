#!/bin/sh
# tools/keycloak/deploy-theme.sh — MDRS-99
#
# Runs ON THE KEYCLOAK HOST. `.github/workflows/keycloak-theme-app.yaml` sends
# this file's contents over SSH (appleboy/ssh-action `script_path`) after it
# has copied the freshly built JAR onto the host. It swaps that JAR into the
# directory Keycloak loads providers from.
#
# POSIX sh on purpose: the remote login shell is whatever the deploy user has,
# not necessarily bash.
#
# Environment (both required, no defaults — a wrong guess fails silently,
# because Keycloak serves its built-in theme when ours is missing):
#   KC_THEME_DIR   Host directory mounted at /opt/keycloak/providers inside the
#                  Keycloak container. See docs/runbooks/deploy-keycloak-theme.md
#                  §0 for how to confirm it.
#   KC_STAGED_JAR  Path of the JAR the workflow just uploaded. It is copied, not
#                  read in place, and removed on success together with its
#                  directory when that is left empty.
#
# What it does, in order:
#   1. Backs up the current medaris-keycloak-theme.jar to
#      medaris-keycloak-theme.jar.backup.<UTC timestamp>.
#   2. Copies the staged JAR next to the target under a name that does not end
#      in .jar, then renames it over the target. The rename is atomic on one
#      filesystem, so a restart in between sees the old JAR or the new one,
#      never a half-written file.
#   3. Retires the pre-MDRS-10 file madrasah-theme.jar by renaming it to
#      madrasah-theme.jar.retired.<UTC timestamp>. Keycloak only loads *.jar,
#      so the old theme id `madrasah-keycloak-theme` disappears on the next
#      restart and a realm still pointing at it shows up as a fallback instead
#      of quietly working.
#   4. Keeps the newest KC_THEME_BACKUPS backups (default 5) and deletes older
#      ones, so the providers directory does not grow by ~3 MB per deploy.
#   5. Prints the deployed file's SHA-256 so the run log records which bytes
#      went out.
#
# Exit codes: 0 deployed, 1 bad input, anything else is the failing command's.

set -eu

THEME_ID="medaris-keycloak-theme"
LEGACY_JAR="madrasah-theme.jar"

fail() {
  echo "deploy-theme: $*" >&2
  exit 1
}

[ -n "${KC_THEME_DIR:-}" ] || fail "KC_THEME_DIR is not set"
[ -n "${KC_STAGED_JAR:-}" ] || fail "KC_STAGED_JAR is not set"
[ -d "$KC_THEME_DIR" ] || fail "KC_THEME_DIR does not exist: $KC_THEME_DIR"
[ -s "$KC_STAGED_JAR" ] || fail "staged JAR is missing or empty: $KC_STAGED_JAR"

# A JAR is a zip; its first two bytes are "PK". Catches an HTML error page or
# a truncated upload before it replaces a working theme.
magic=$(dd if="$KC_STAGED_JAR" bs=2 count=1 2>/dev/null)
[ "$magic" = "PK" ] || fail "staged file is not a JAR (no zip header): $KC_STAGED_JAR"

target="$KC_THEME_DIR/$THEME_ID.jar"
partial="$KC_THEME_DIR/.$THEME_ID.jar.partial"
stamp=$(date -u +%Y%m%d_%H%M%S)

if [ -f "$target" ]; then
  cp -p "$target" "$target.backup.$stamp"
  echo "deploy-theme: backed up $target -> $target.backup.$stamp"
else
  echo "deploy-theme: no existing $target to back up"
fi

cp "$KC_STAGED_JAR" "$partial"
mv -f "$partial" "$target"
rm -f "$KC_STAGED_JAR"
rmdir "$(dirname "$KC_STAGED_JAR")" 2>/dev/null || true
echo "deploy-theme: installed $target"

keep="${KC_THEME_BACKUPS:-5}"
case "$keep" in '' | *[!0-9]*) fail "KC_THEME_BACKUPS must be a number: $keep" ;; esac
# The timestamp in the name sorts chronologically; the names are ours and
# carry no whitespace.
for old in "$target".backup.*; do
  [ -e "$old" ] && printf '%s\n' "$old"
done | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
  rm -f "$old"
  echo "deploy-theme: pruned $old"
done

legacy="$KC_THEME_DIR/$LEGACY_JAR"
if [ -f "$legacy" ]; then
  mv "$legacy" "$legacy.retired.$stamp"
  echo "deploy-theme: retired $legacy -> $legacy.retired.$stamp"
fi

if command -v sha256sum >/dev/null 2>&1; then
  sum=$(sha256sum "$target" | cut -d' ' -f1)
elif command -v shasum >/dev/null 2>&1; then
  sum=$(shasum -a 256 "$target" | cut -d' ' -f1)
else
  sum="unavailable (no sha256sum or shasum on the host)"
fi
echo "deploy-theme: sha256 $sum"
echo "deploy-theme: done — restart Keycloak for the new JAR to load"
