# Releasing Cherub Courier

A release is a signed, notarized DMG attached to a GitHub Release. Credentials never
go in this repository or through Claude: Rachel enters them herself, and they live in
her login keychain.

`[COST]` Only the Apple Developer Program ($99/yr, already paid). Everything else is free.

## One-time setup (Rachel)

1. **Developer ID certificate.** In Xcode: Settings > Accounts > your team > Manage
   Certificates > + > *Developer ID Application*. (Or create it at
   developer.apple.com > Certificates and import it.) Check:
   `security find-identity -v -p codesigning` lists `Developer ID Application: … (TEAMID)`.
2. **App-specific password.** account.apple.com > Sign-In and Security > App-Specific
   Passwords > generate one named "notarytool".
3. **Store notarization credentials in the keychain** (you type them; nothing is saved
   in the repo):
   ```sh
   xcrun notarytool store-credentials newscat-notary \
     --apple-id "<your Apple ID email>" --team-id "<TEAMID>"
   ```
   It prompts for the app-specific password.

## Each release

1. Make sure the cherub art in `assets/cherub/` is cleared for distribution (it ships inside
   the app, and the app icon is drawn from it; `npm run release` redraws the icon with
   `node scripts/icon.mjs`).
2. Bump `version` in `package.json`, commit.
3. `APPLE_KEYCHAIN_PROFILE=newscat-notary npm run release`
   - lint + tests, universal build, hardened runtime, signing, notarization and stapling
     of the app and the DMG, then Gatekeeper checks (`spctl`) on both.
   - Also checks the update zip the same way, and that `out/latest-mac.yml` is for this version.
   - Output, all attached to the release: `CherubCourier-<version>.dmg` and its `.sha256`
     (for new installs), `CherubCourier-<version>-mac.zip`, its `.blockmap`, and
     `latest-mac.yml` (for automatic updates, from 0.4.0). The script lists them.
4. Test on a Mac that has never run Cherub Courier (or a fresh user account): download the DMG
   from the release page (so it gets the quarantine flag), drag to Applications, open.
   It must open with no Gatekeeper warning beyond the normal "downloaded from the
   internet" prompt, and the cherub must appear.
5. Publish on GitHub (Releases > Draft a new release, tag `v<version>` on `main`), attach the
   five files, and publish as a full release (not a draft or pre-release: the updater only
   sees published releases). Installed copies from 0.4.0 on find it within about 6 hours,
   download it, and install it the next time they quit, or at once from "Restart to update".
   **Never attach `latest-mac.yml` without the zip it names**: apps would try to download it.

## Local test build (no Apple account needed)

`npm run dist:adhoc` builds an ad-hoc signed app in `out/mac-universal/` without hardened
runtime or notarization. It runs on this Mac only; never publish it.

## What the packaged app locks down

- Electron fuses: no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no `--inspect`; the app
  loads only from its integrity-checked `app.asar`.
- Quits if launched with `--remote-debugging-port`/`--remote-debugging-pipe`.
- Dev menu and `NEWSCAT_*` dev switches are disabled.
- Entitlements: only `com.apple.security.cs.allow-jit` (V8).
- One instance at a time.
