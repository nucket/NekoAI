/**
 * Creates a minimal 512x512 app-icon.png (solid pink square)
 * using only Node.js built-ins (zlib, fs), then tauri icon does the rest.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const SIZE = 512
const R = 255,
  G = 105,
  B = 180 // hot-pink placeholder

// ─── CRC-32 ───────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ─── PNG chunk ────────────────────────────────────────────────────────────────
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcVal = Buffer.alloc(4)
  crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crcVal])
}

// ─── Build image data ─────────────────────────────────────────────────────────
// One filter byte (0x00 = None) + SIZE × 3 bytes per row
const rowLen = 1 + SIZE * 3
const raw = Buffer.alloc(SIZE * rowLen)
for (let y = 0; y < SIZE; y++) {
  raw[y * rowLen] = 0
  for (let x = 0; x < SIZE; x++) {
    const i = y * rowLen + 1 + x * 3
    raw[i] = R
    raw[i + 1] = G
    raw[i + 2] = B
  }
}

// ─── IHDR ─────────────────────────────────────────────────────────────────────
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0) // width
ihdr.writeUInt32BE(SIZE, 4) // height
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // color type: RGB
// compression, filter, interlace = 0

// ─── Assemble PNG ─────────────────────────────────────────────────────────────
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = resolve(__dir, '../src-tauri/app-icon.png')
writeFileSync(outPath, png)
console.log(`Created ${outPath} (${png.length} bytes)`)
