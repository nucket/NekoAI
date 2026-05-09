// Maps a GitHub Release asset name to { os, arch, format } so the metrics
// pipeline can aggregate downloads by platform.
//
// Returns null for files that are not user installers (signatures, updater
// bundles, latest.json). The release tag is the source of truth for the
// version; we never infer it from the filename because past releases have
// shipped assets whose embedded version did not match the tag.

const PATTERNS = [
  // Windows
  {
    re: /^nekoai-v[\d.]+-portable-windows-x64\.zip$/,
    os: 'windows',
    arch: 'x86_64',
    format: 'portable',
  },
  { re: /^nekoai_[\d.]+_x64-setup\.exe$/, os: 'windows', arch: 'x86_64', format: 'nsis' },
  { re: /^nekoai_[\d.]+_x64_en-US\.msi$/, os: 'windows', arch: 'x86_64', format: 'msi' },

  // macOS
  { re: /^nekoai_[\d.]+_aarch64\.dmg$/, os: 'macos', arch: 'aarch64', format: 'dmg' },
  { re: /^nekoai_[\d.]+_x64\.dmg$/, os: 'macos', arch: 'x86_64', format: 'dmg' },

  // Linux
  { re: /^nekoai_[\d.]+_amd64\.AppImage$/, os: 'linux', arch: 'x86_64', format: 'appimage' },
  { re: /^nekoai_[\d.]+_amd64\.deb$/, os: 'linux', arch: 'x86_64', format: 'deb' },
  { re: /^nekoai-[\d.]+-1\.x86_64\.rpm$/, os: 'linux', arch: 'x86_64', format: 'rpm' },
]

// Files that exist on every release but are not installations.
const SKIP_PATTERNS = [
  /\.sig$/,
  /^latest\.json$/,
  /^nekoai_(?:aarch64|x64)\.app\.tar\.gz$/, // Tauri updater bundle, not a user installer
]

export function parseAssetName(name) {
  if (typeof name !== 'string' || name.length === 0) return null
  if (SKIP_PATTERNS.some((re) => re.test(name))) return { skip: true }
  for (const p of PATTERNS) {
    if (p.re.test(name)) return { os: p.os, arch: p.arch, format: p.format }
  }
  return null
}
