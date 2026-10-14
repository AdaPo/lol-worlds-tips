// Generates the app icons into web/public (no dependencies).
// Run: node scripts/make-icons.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 13, 18]; // --ink
const FG = [215, 255, 58]; // --open (acid lime)
const OUT = new URL('../web/public/', import.meta.url);

// A bold "W", as a polyline in a 0..1 square.
const GLYPH = [
  [0.17, 0.28],
  [0.335, 0.74],
  [0.5, 0.42],
  [0.665, 0.74],
  [0.83, 0.28],
];
const HALF_STROKE = 0.0575;

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// scale < 1 shrinks the glyph toward the centre (keeps maskable icons in the safe zone).
function render(size, scale = 1) {
  const SS = 4;
  const rowLen = size * 3 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = 0.5 + ((x + (sx + 0.5) / SS) / size - 0.5) / scale;
          const v = 0.5 + ((y + (sy + 0.5) / SS) / size - 0.5) / scale;
          let d = Infinity;
          for (let i = 0; i < GLYPH.length - 1; i++) {
            d = Math.min(d, distToSegment(u, v, GLYPH[i], GLYPH[i + 1]));
          }
          if (d <= HALF_STROKE) hits++;
        }
      }
      const c = hits / (SS * SS);
      const o = y * rowLen + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k] * (1 - c) + FG[k] * c);
    }
  }
  return png(size, raw);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const points = GLYPH.map(([x, y]) => `${Math.round(x * 512)},${Math.round(y * 512)}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b0d12"/>
  <polyline points="${points}" fill="none" stroke="#d7ff3a" stroke-width="${Math.round(HALF_STROKE * 2 * 512)}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

mkdirSync(OUT, { recursive: true });
const files = {
  'icon.svg': svg,
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'icon-maskable-512.png': render(512, 0.8),
  'apple-touch-icon.png': render(180),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, OUT), data);
  console.log('wrote web/public/' + name);
}
