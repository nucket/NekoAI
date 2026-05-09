import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parseAssetName } from './parse-asset.mjs'

// Fixtures captured from real assets on github.com/nucket/NekoAI v0.1.0 and v0.2.0.
const REAL_ASSETS = [
  ['nekoai_0.1.0_x64-setup.exe', { os: 'windows', arch: 'x86_64', format: 'nsis' }],
  ['nekoai_0.1.0_x64_en-US.msi', { os: 'windows', arch: 'x86_64', format: 'msi' }],
  ['nekoai-v0.1.0-portable-windows-x64.zip', { os: 'windows', arch: 'x86_64', format: 'portable' }],
  ['nekoai_0.1.0_aarch64.dmg', { os: 'macos', arch: 'aarch64', format: 'dmg' }],
  ['nekoai_0.1.0_x64.dmg', { os: 'macos', arch: 'x86_64', format: 'dmg' }],
  ['nekoai_0.1.0_amd64.AppImage', { os: 'linux', arch: 'x86_64', format: 'appimage' }],
  ['nekoai_0.1.0_amd64.deb', { os: 'linux', arch: 'x86_64', format: 'deb' }],
  ['nekoai-0.1.0-1.x86_64.rpm', { os: 'linux', arch: 'x86_64', format: 'rpm' }],
]

const SKIP_ASSETS = [
  'nekoai_aarch64.app.tar.gz',
  'nekoai_x64.app.tar.gz',
  'nekoai_0.1.0_x64-setup.exe.sig',
  'nekoai_0.1.0_amd64.AppImage.sig',
  'latest.json',
]

const FUTURE_TAG_VARIANTS = [
  ['nekoai_0.3.0_x64-setup.exe', { os: 'windows', arch: 'x86_64', format: 'nsis' }],
  ['nekoai_1.10.2_aarch64.dmg', { os: 'macos', arch: 'aarch64', format: 'dmg' }],
  ['nekoai-v0.3.0-portable-windows-x64.zip', { os: 'windows', arch: 'x86_64', format: 'portable' }],
]

const UNKNOWN_ASSETS = [
  'README.md',
  'nekoai_0.1.0_arm64.deb', // arm64 linux not built today; should be unknown
  'nekoai_x86_64.tar.xz',
  '',
  'random-file.bin',
]

test('parses every real release asset', () => {
  for (const [name, expected] of REAL_ASSETS) {
    assert.deepEqual(parseAssetName(name), expected, `failed for ${name}`)
  }
})

test('flags signatures, latest.json and updater bundles as skip', () => {
  for (const name of SKIP_ASSETS) {
    assert.deepEqual(parseAssetName(name), { skip: true }, `should skip ${name}`)
  }
})

test('handles future version numbers without code change', () => {
  for (const [name, expected] of FUTURE_TAG_VARIANTS) {
    assert.deepEqual(parseAssetName(name), expected, `failed for ${name}`)
  }
})

test('returns null for unknown assets so they surface in the snapshot', () => {
  for (const name of UNKNOWN_ASSETS) {
    assert.equal(parseAssetName(name), null, `should be unknown: ${name}`)
  }
})

test('null inputs do not throw', () => {
  assert.equal(parseAssetName(null), null)
  assert.equal(parseAssetName(undefined), null)
  assert.equal(parseAssetName(123), null)
})
