# One Day in Kyiv — iOS shell

Thin Apple-only WKWebView app that loads the live GitHub Pages mini-games
([menu](https://mikerudine.github.io/kyiv-slots/menu/)) and keeps an offline
snapshot so play still works without a network.

Games stay plain HTML/JS in the repo root. This folder does **not** affect
GitHub Pages (Pages serves from `main` at the repository root).

## Identity (easy to change)

| Setting | Value | Where |
| --- | --- | --- |
| Display name | **One Day in Kyiv** | `Info.plist` → `CFBundleDisplayName`, Xcode target |
| Bundle ID | `com.mikerudine.onedayinkyiv` | Xcode target **Signing & Capabilities**, also documented in `Sources/AppConfig.swift` |
| Live site | `https://mikerudine.github.io/kyiv-slots/` | `Sources/AppConfig.swift` |
| Entry URL | `…/menu/` | `AppConfig.menuPath` |

To rename the bundle ID later: change it in the Xcode target, update
`AppConfig.bundleID`, and register the new App ID in your Apple Developer
account. No game files need to change.

## Open & run in Xcode

1. On a Mac, open `ios/OneDayInKyiv.xcodeproj` in Xcode 15+ (iOS 16 deployment target).
2. Select the **OneDayInKyiv** scheme and an iPhone simulator or a plugged-in device.
3. Set your **Team** under Signing & Capabilities (leave Bundle Identifier as-is unless you changed it).
4. Press **Run** (⌘R).

First launch needs a network connection so the shell can download the site into
its offline cache. After that, Airplane Mode still opens the last cached copy.

### Signing / TestFlight / App Store

This project contains **no** certificates, provisioning profiles, or secrets.
CI archives the shell on GitHub-hosted `macos-latest` runners and uploads the
IPA to TestFlight with automatic signing via an App Store Connect API key.

#### GitHub Actions → TestFlight

Workflow: [`.github/workflows/ios-testflight.yml`](../.github/workflows/ios-testflight.yml)

**Trigger manually:** GitHub → **Actions** → **iOS TestFlight** → **Run workflow**.

It also runs on pushes to `main` that touch `ios/**` or that workflow file (not
on ordinary game/content-only changes; GitHub Pages remains the content source
of truth).

**Repository secrets** (Settings → Secrets and variables → Actions). Use these
exact names; paste the real values in the GitHub UI only — never commit them:

| Secret | What to paste |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect API Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect Issuer ID |
| `APP_STORE_CONNECT_API_KEY` | Full `.p8` PEM text, including the `BEGIN` / `END PRIVATE KEY` lines (multiline secret, not base64) |
| `APP_STORE_CONNECT_TEAM_ID` | Apple Team ID |

The workflow sets `CFBundleVersion` / `CURRENT_PROJECT_VERSION` at build time
(latest TestFlight build + 1, or a `github.run_number`-based fallback). It does
**not** submit for App Store review or notify external testers.

## Update & offline model

```
Online launch
  → fetch cache-manifest.json from the live site (bundled copy is fallback)
  → download every listed file into Application Support/OfflineSite
  → open the live menu URL so a fresh GitHub Pages publish is visible immediately

Offline launch
  → open onedayinkyiv://cache/menu/ from the last successful snapshot
```

So: **publish to GitHub Pages → open the app online once → content updates.**
You only need a new App Store build when *native* shell bits change (icon,
display name, permissions, native code).

When you add a new game or static asset, append its path to the root
[`cache-manifest.json`](../cache-manifest.json) (and keep the copy under
`OneDayInKyiv/Resources/` in sync when you cut a native release). The app
prefers the live manifest, so Pages-only additions work without rebuilding
once that JSON is published.

## Donate / external links

«Підтримати ЗСУ» and any other `http(s)` navigation that leaves
`mikerudine.github.io/kyiv-slots/` opens in **SFSafariViewController**
(Safari UI), never inside the webview and never as In-App Purchase.

The shared web helper [`shared/zsu-donate.js`](../shared/zsu-donate.js) stays
browser-compatible: in a normal browser it still uses `target="_blank"`. Inside
the shell it can also call the injected `KYIV_OPEN_EXTERNAL` bridge; the native
navigation policy is the safety net either way.

## Native chrome notes

- App icon + static launch screen (dark `#0b1020`, yellow title) — no stripes,
  flashes, or shake.
- Status bar is light content; the webview is edge-to-edge and games already
  honor `safe-area-inset-*`.
- Status overlays use a short fade and skip animation when Reduce Motion is on.
- iOS only — no Android target.

## Layout

```
ios/
  README.md
  OneDayInKyiv.xcodeproj/
  OneDayInKyiv/
    Info.plist
    Assets.xcassets/          # App icon
    Base.lproj/LaunchScreen.storyboard
    Resources/cache-manifest.json
    Sources/                  # WKWebView shell
```
