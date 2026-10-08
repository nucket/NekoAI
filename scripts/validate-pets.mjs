#!/usr/bin/env node
// Validates every pet listed in pets/manifest.json:
//   - the folder and pet.json exist and parse
//   - pet.json has the top-level fields and animations the schema requires
//   - every sprite file referenced by an animation exists on disk
//   - every trigger points at a defined animation
//
// The tray menu (src-tauri/src/lib.rs) and PetSelector both read the
// manifest, so a broken entry here ships as a broken or invisible pet.
//
// Usage: node scripts/validate-pets.mjs   (exits 1 on any problem)

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const petsDir = join(root, 'pets')
const schema = JSON.parse(readFileSync(join(root, 'schemas', 'pet.schema.json'), 'utf-8'))
const requiredFields = schema.required ?? []
const requiredAnimations = schema.properties?.animations?.required ?? []

const problems = []
const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    problems.push(`${label}: cannot read ${path} (${err.message})`)
    return null
  }
}

const manifest = readJson(join(petsDir, 'manifest.json'), 'manifest')
const entries = manifest?.pets ?? []
if (manifest && entries.length === 0) problems.push('manifest: no pets listed')

const seen = new Set()
for (const entry of entries) {
  const id = entry.id
  if (!id || !entry.name) {
    problems.push(`manifest: entry missing id or name (${JSON.stringify(entry)})`)
    continue
  }
  if (seen.has(id)) problems.push(`manifest: duplicate id "${id}"`)
  seen.add(id)

  const petPath = join(petsDir, id, 'pet.json')
  if (!existsSync(petPath)) {
    problems.push(`${id}: missing pets/${id}/pet.json`)
    continue
  }
  const pet = readJson(petPath, id)
  if (!pet) continue

  for (const field of requiredFields) {
    if (pet[field] === undefined) problems.push(`${id}: pet.json is missing "${field}"`)
  }

  const animations = pet.animations ?? {}
  for (const name of requiredAnimations) {
    if (!animations[name]) problems.push(`${id}: missing required animation "${name}"`)
  }

  const spritesDir = join(petsDir, id, pet.spritesDir ?? 'sprites')
  const missing = []
  for (const [name, anim] of Object.entries(animations)) {
    if (!Array.isArray(anim.files) || anim.files.length === 0) {
      problems.push(`${id}: animation "${name}" has no files`)
      continue
    }
    for (const file of anim.files) {
      if (!existsSync(join(spritesDir, file))) missing.push(`${name}/${file}`)
    }
  }
  if (missing.length > 0) {
    const shown = missing.slice(0, 5).join(', ')
    const more = missing.length > 5 ? ` (+${missing.length - 5} more)` : ''
    problems.push(`${id}: ${missing.length} missing sprite file(s): ${shown}${more}`)
  }

  for (const [trigger, target] of Object.entries(pet.triggers ?? {})) {
    if (typeof target === 'string' && !animations[target]) {
      problems.push(`${id}: trigger "${trigger}" points at undefined animation "${target}"`)
    }
  }
}

if (problems.length > 0) {
  console.error(`✖ ${problems.length} pet problem(s):`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`✓ ${entries.length} pets valid`)
