---
name: store-release
description: Build the tribbu mobile app for iOS and Android locally with EAS (zero cloud-build quota) and submit both to the stores (Play internal track + App Store Connect). Use when the user wants to ship a new mobile release, "build y submit", or publish the app to the stores.
argument-hint: [all|android|ios] [--cloud] (default: all, local builds)
---

# Store Release — build local + submit a ambas tiendas

You are shipping a release of **tribbu mobile** (`mobile/`, Expo managed + EAS).
Builds run **locally** by default (`eas build --local`) so they consume **no EAS
cloud-build quota** — the user is on the free tier and wants to avoid paying.
Signing still uses the EAS-managed remote credentials (Android keystore, iOS
certs), and `versionCode`/`buildNumber` auto-increment from the EAS server
(`appVersionSource: remote`), so no manual version bumping.

Platforms to release: **$ARGUMENTS** (default `all` = android + ios, sequentially
— never both builds at once, they'd contend for CPU/RAM. Only use cloud builds
if `--cloud` was passed or the user explicitly asks after a local failure).

## Phase 0 — Preflight (abort on failure)

1. Everything below runs from `mobile/`. **Prefix every eas command with an
   explicit `cd <repo>/mobile &&`** (especially background runs — the session
   cwd can silently reset to the repo root, and from there eas fails with
   "EAS project not configured").
2. Working tree: `git status` must be clean (or only contain changes the user
   just asked to ship — confirm with them if dirty) and on `main` with the
   release commit pushed.
3. Validation gates: `npm run lint` and `npx expo export -p ios` must pass.
4. Toolchain (per platform being built):
   - **Android**: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
     and `ANDROID_HOME="$HOME/Library/Android/sdk"` must exist (`/usr/bin/java` is a stub).
   - **iOS**: `xcodebuild -version` and `which fastlane` must succeed
     (`brew install fastlane` if missing).
5. EAS session: `npx -y eas-cli@latest whoami` (login lives in `~/.expo`; if it
   fails, ask the user to run `npx eas-cli login` — you can't do OAuth for them).
6. Artifacts go to `mobile/tribbu-production.aab` / `.ipa` (gitignored — never
   commit them).

## Phase 1 — Android (build → submit)

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
npx -y eas-cli@latest build -p android --profile production --local \
  --non-interactive --output ./tribbu-production.aab
```

- Run in background (takes 10–25 min); watch for completion, then confirm the
  `.aab` exists and is non-trivial in size (> 20 MB).
- `google-services.json` is gitignored but reaches the build via the EAS file
  env var `GOOGLE_SERVICES_JSON` — do not "fix" its absence by un-ignoring it.
- Submit (does **not** consume build quota; targets come from `eas.json > submit`,
  Play **internal** track, `play-service-account.json` must exist locally):

```bash
npx -y eas-cli@latest submit -p android --profile production \
  --path ./tribbu-production.aab --non-interactive
```

## Phase 2 — iOS (build → submit)

Only start after Phase 1's build finished (resource contention).

```bash
npx -y eas-cli@latest build -p ios --profile production --local \
  --non-interactive --output ./tribbu-production.ipa
```

- Requires Xcode + fastlane. First run may prompt for keychain access — if the
  build hangs or fails on codesigning/keychain, surface the error and ask the
  user to run it once in an interactive terminal; don't loop retries.
- Submit (uploads to App Store Connect, `ascAppId` from `eas.json`):

```bash
npx -y eas-cli@latest submit -p ios --profile production \
  --path ./tribbu-production.ipa --non-interactive
```

## Phase 3 — Verify & report

1. `npx -y eas-cli@latest build:list --limit 4 --json --non-interactive` — report
   the new `appBuildVersion` per platform (local builds appear with
   `distribution: store`).
2. Report submission status from each submit command's output (Play: aparece en
   el track interno en minutos; ASC: el build tarda ~10–30 min en procesarse y
   luego hay que asignarlo a la versión en App Store Connect).
3. Remind the user of the manual console steps that EAS does NOT do, per
   `mobile/STORE_RELEASE.md`: promotion beyond the internal track in Play
   Console, and attaching the processed build + submitting for review in ASC.
4. Delete or leave the local artifacts as the user prefers (they're gitignored).

## Failure fallbacks

- If a **local** build fails for environment reasons you can't fix, offer the
  cloud build (`npx eas-cli build -p <plat> --profile production`) but warn it
  consumes the free-tier build quota — never launch it without the user's OK.
- Never commit: `*.aab`, `*.ipa`, `google-services.json`,
  `play-service-account.json`, `mobile/android/`, `mobile/ios/`.
- Do not touch native version numbers in `app.json` — versions are remote.
