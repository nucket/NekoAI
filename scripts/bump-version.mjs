#!/usr/bin/env node
// Bumps NekoAI's version across the three sources of truth in one shot:
//   - package.json
//   - src-tauri/Cargo.toml          (top-level [package] version)
//   - src-tauri/tauri.conf.json
//
// Usage:  node scripts/bump-version.mjs <new-version>
// Example: node scripts/bump-version.mjs 0.3.7
//
// Refuses to run if the new version isn't strictly higher than the current
// package.json version, so an accidental downgrade can't ship.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const root = resolve(dirname(__filename), '..')

const next = process.argv[2]
if (!next || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(next)) {
  console.error('Usage: node scripts/bump-version.mjs <new-version>')
  console.error('       e.g. 0.3.7  or  0.4.0-rc.1')
  process.exit(1)
}

function cmpSemver(a, b) {
  const pa = a.split(/[-.]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x))
  const pb = b.split(/[-.]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue
    if (pa[i] === undefined) return -1
    if (pb[i] === undefined) return 1
    return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

const pkgPath = resolve(root, 'package.json')
const tauriPath = resolve(root, 'src-tauri', 'tauri.conf.json')
const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const current = pkg.version

if (cmpSemver(next, current) <= 0) {
  console.error(`Refusing to bump: ${next} is not greater than current ${current}`)
  process.exit(1)
}

// package.json — preserve formatting with a targeted regex on the version line
const pkgRaw = readFileSync(pkgPath, 'utf-8')
const pkgUpdated = pkgRaw.replace(/("version"\s*:\s*)"[^"]+"/, (_m, prefix) => `${prefix}"${next}"`)
writeFileSync(pkgPath, pkgUpdated)

// tauri.conf.json — same approach
const tauriRaw = readFileSync(tauriPath, 'utf-8')
const tauriUpdated = tauriRaw.replace(
  /("version"\s*:\s*)"[^"]+"/,
  (_m, prefix) => `${prefix}"${next}"`
)
writeFileSync(tauriPath, tauriUpdated)

// Cargo.toml — only the FIRST `version = "..."` (the [package] one)
const cargoRaw = readFileSync(cargoPath, 'utf-8')
const cargoUpdated = cargoRaw.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`)
writeFileSync(cargoPath, cargoUpdated)

console.log(`✓ Bumped ${current} → ${next}`)
console.log('  - package.json')
console.log('  - src-tauri/tauri.conf.json')
console.log('  - src-tauri/Cargo.toml')
console.log('')
console.log('Next steps:')
console.log(`  git add -A && git commit -m "chore(release): v${next}"`)
console.log(`  git tag v${next} && git push origin HEAD --tags`)
