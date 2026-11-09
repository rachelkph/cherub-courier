#!/usr/bin/env bash
# Builds a signed, notarized DMG and checks it the way Gatekeeper will.
# Needs (see docs/RELEASE.md): a "Developer ID Application" certificate in the login
# keychain, and a notarytool keychain profile named in APPLE_KEYCHAIN_PROFILE.
# No credentials are read from or written to this repository.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_KEYCHAIN_PROFILE:?set APPLE_KEYCHAIN_PROFILE to your notarytool profile name (docs/RELEASE.md)}"
export APPLE_KEYCHAIN="${APPLE_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}" # where that profile is stored
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "No 'Developer ID Application' certificate in your keychain (docs/RELEASE.md, step 1)." >&2
  exit 1
fi
for d in walk walk_nobag loaf sleep pile fx; do
  [ -d "assets/$d" ] || { echo "Sprite folder assets/$d is missing; the app would ship without art." >&2; exit 1; }
done

npm run lint
npm test
rm -rf out
npm run dist # builds, signs with hardened runtime, notarizes and staples the app

version=$(node -p 'require("./package.json").version')
dmg="out/NewsCat-${version}.dmg"
app="out/mac-universal/NewsCat.app"

echo "Notarizing the DMG…"
xcrun notarytool submit "$dmg" --keychain-profile "$APPLE_KEYCHAIN_PROFILE" --wait
xcrun stapler staple "$dmg"

echo "Checking…"
codesign --verify --deep --strict --verbose=2 "$app"
xcrun stapler validate "$app"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
mnt=$(mktemp -d)
hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$dmg" >/dev/null
trap 'hdiutil detach "$mnt" >/dev/null 2>&1 || true' EXIT
spctl --assess --type execute --verbose=2 "$mnt/NewsCat.app"
shasum -a 256 "$dmg" | tee "$dmg.sha256"
echo "Ready: $dmg"
