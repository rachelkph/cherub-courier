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

1. Make sure the sprite art in `assets/` is cleared for distribution (it ships inside the app).
2. Bump `version` in `package.json`, commit.
3. `APPLE_KEYCHAIN_PROFILE=newscat-notary npm run release`
   - lint + tests, universal build, hardened runtime, signing, notarization and stapling
     of the app and the DMG, then Gatekeeper checks (`spctl`) on both.
   - Output: `out/CherubCourier-<version>.dmg` and its `.sha256`.
4. Test on a Mac that has never run Cherub Courier (or a fresh user account): download the DMG
   from the release page (so it gets the quarantine flag), drag to Applications, open.
   It must open with no Gatekeeper warning beyond the normal "downloaded from the
   internet" prompt, and the cat must appear.
5. Tag and publish: `git tag v<version> && git push origin v<version>`, then
   `gh release create v<version> out/CherubCourier-<version>.dmg out/CherubCourier-<version>.dmg.sha256`.

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
