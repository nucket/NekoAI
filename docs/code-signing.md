# Code signing policy

This page describes how NekoAI release binaries are built and signed, who can approve a release, and what the
app does on the network.

## Current status

| Platform | Installer signing                                                                                                           | Update signing                |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Windows  | Not signed yet. An application to the [SignPath Foundation](https://signpath.org/) open-source programme is being prepared. | Signed with the updater key ¹ |
| macOS    | Not signed or notarized (no Apple Developer ID).                                                                            | Signed with the updater key ¹ |
| Linux    | Not applicable (AppImage, `.deb`, `.rpm`).                                                                                  | Signed with the updater key ¹ |

¹ From the first release that includes the in-app updater. Updates are verified against the updater public key in
[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) (`plugins.updater.pubkey`) before they are installed. The
private key is never committed; release builds read it from a GitHub Actions secret.

Until installers are signed, Windows and macOS show a warning the first time you open NekoAI. See
[Opening an unsigned build](#opening-an-unsigned-build).

Once Windows signing is in place, this section will read: _Free code signing provided by
[SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)._

## How releases are built

- Every release is built by the [Release workflow](../.github/workflows/release.yml) on GitHub-hosted runners,
  from a `v*.*.*` tag in this repository. No binary is built or uploaded from a personal machine.
- The workflow first runs the same checks as pull requests (lint, typecheck, tests, clippy, `cargo deny`). A tag
  that fails them is never published.
- Third-party GitHub Actions are pinned to commit SHAs.
- Only binaries built from this repository's source are signed. NekoAI does not sign third-party software.

## Team roles

| Role                     | Who                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Committers and reviewers | Changes land on `main` only through pull requests that pass the required checks.    |
| Approvers                | [Naudy Castellanos](https://github.com/nucket) (maintainer) approves every release. |

## Privacy

NekoAI sends nothing to any server unless you configure it to or accept it:

- **AI provider calls** go only to the provider you choose in Settings, with the API key you enter.
- **Update check:** once per launch the app downloads the release metadata (`latest.json`) from GitHub to see whether
  a newer version exists. It sends nothing about you beyond what any download from GitHub carries. Updates are only
  downloaded and installed if you accept them, and you can turn the check off in Settings.
- There is no telemetry, analytics or crash reporting.

The full list of network calls and stored data is in [SECURITY.md](../SECURITY.md#privacy--data-handling).

## Opening an unsigned build

### Windows

SmartScreen may show _"Windows protected your PC"_ for an unsigned installer. Click **More info**, check that the
file is `nekoai_X.Y.Z_x64-setup.exe` downloaded from the [releases page](https://github.com/nucket/NekoAI/releases),
then click **Run anyway**.

### macOS

macOS blocks apps that are not notarized the first time they open:

1. Open `nekoai.app` once. macOS says it can't verify the developer; click **Done**.
2. Open **System Settings → Privacy & Security**, scroll to the message about `nekoai`, and click **Open Anyway**.
3. Confirm with your password. From then on NekoAI opens normally.

Alternatively, from Terminal: `xattr -dr com.apple.quarantine /Applications/nekoai.app`.

## Reporting a problem

If a release binary looks tampered with, or its signature doesn't match this policy, please report it privately as
described in [SECURITY.md](../SECURITY.md#reporting-a-vulnerability).
