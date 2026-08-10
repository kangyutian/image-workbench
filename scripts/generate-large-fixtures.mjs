import { randomFillSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const width = 2048;
const height = 2048;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createFixture(shape) {
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  randomFillSync(raw);
  for (let y = 0; y < height; y += 1) raw[y * stride] = 0;

  const center = width / 2;
  const radius = 524;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inShape = shape === "circle"
        ? ((x - center) ** 2 + (y - center) ** 2 <= radius ** 2)
        : (x >= 512 && x < 1536 && y >= 512 && y < 1536);
      if (!inShape) continue;
      const offset = y * stride + 1 + x * 3;
      if (shape === "circle") raw.set([245, 245, 245], offset);
      else raw.set([220, 175, 35], offset);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND"),
  ]);
}

writeFileSync(resolve("test-assets", "large-fusion-red.png"), createFixture("circle"));
writeFileSync(resolve("test-assets", "large-fusion-blue.png"), createFixture("square"));
