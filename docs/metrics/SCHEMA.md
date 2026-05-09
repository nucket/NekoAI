# Metrics snapshot schema

Each file under `snapshots/` is a JSON document produced by `scripts/metrics/collect.mjs`. `latest.json` is a copy of the most recent snapshot.

```jsonc
{
  "schema_version": 1,
  "captured_at": "2026-05-09T06:17:32Z",
  "source": "github-releases",
  "repo": "nucket/NekoAI",
  "totals": {
    "all": 1234,
    "by_os": { "windows": 600, "macos": 200, "linux": 434 },
    "by_arch": { "x86_64": 1100, "aarch64": 134 },
    "by_format": {
      "nsis": 300,
      "msi": 80,
      "portable": 220,
      "dmg": 200,
      "appimage": 120,
      "deb": 200,
      "rpm": 114,
    },
    "by_version": { "v0.1.0": 500, "v0.2.0": 734 },
  },
  "releases": [
    {
      "tag": "v0.2.0",
      "published_at": "2026-04-…",
      "assets": [
        {
          "name": "nekoai_0.2.0_x64-setup.exe",
          "os": "windows",
          "arch": "x86_64",
          "format": "nsis",
          "download_count": 312,
          "size": 12345678,
        },
      ],
    },
  ],
  "unknown_assets": [{ "tag": "v0.4.0", "name": "nekoai_0.4.0_arm64.deb", "download_count": 5 }],
}
```

## Field reference

| Field                 | Type            | Notes                                                                                                                                                                         |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`      | int             | Bump on breaking changes. Current: `1`.                                                                                                                                       |
| `captured_at`         | ISO-8601 string | UTC timestamp at which the GitHub API was queried.                                                                                                                            |
| `source`              | string          | Origin of the data. Today: `"github-releases"`. Future sources (winget, Homebrew, Flathub, Snap) will write parallel snapshots with the same schema and a different `source`. |
| `repo`                | string          | `owner/name` queried.                                                                                                                                                         |
| `totals.all`          | int             | Sum of `download_count` over every recognised asset.                                                                                                                          |
| `totals.by_os`        | object          | Keys: `windows`, `macos`, `linux`.                                                                                                                                            |
| `totals.by_arch`      | object          | Keys: `x86_64`, `aarch64`.                                                                                                                                                    |
| `totals.by_format`    | object          | Keys: `nsis`, `msi`, `portable`, `dmg`, `appimage`, `deb`, `rpm`.                                                                                                             |
| `totals.by_version`   | object          | Keyed by release tag (e.g. `v0.2.0`). Counts cumulative downloads of recognised assets per release.                                                                           |
| `releases[]`          | array           | One entry per release, ordered as returned by the GitHub API (newest first).                                                                                                  |
| `releases[].tag`      | string          | Release tag — the source of truth for version. The version embedded in the filename is ignored because it has been inconsistent in past releases.                             |
| `releases[].assets[]` | array           | Recognised installer assets. `.sig`, `latest.json` and `nekoai_*.app.tar.gz` (Tauri updater bundles) are skipped.                                                             |
| `unknown_assets[]`    | array           | Asset names that did not match any pattern in `parse-asset.mjs`. Surface here so a future packaging change is visible at a glance instead of being silently dropped.          |

## Caveats

- **Downloads ≠ installations.** A user can download an asset and never run it.
- **Cumulative, not daily.** GitHub returns the live `download_count`. We persist a snapshot per day for trends, but daily deltas can be negative if a release is renamed or an asset deleted, so present cumulative numbers as authoritative.
- **Drafts and pre-releases excluded by default.** Set `INCLUDE_PRERELEASES=1` to count them.
- **Privacy.** No data leaves the user's machine. The pipeline runs entirely in GitHub Actions against the public API.
