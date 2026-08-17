import { deflateRawSync } from "node:zlib";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeName(name) {
  const clean = String(name || "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return clean && !clean.includes("..") ? clean : "download.bin";
}

async function dataUrlBuffer(url) {
  const match = String(url || "").match(/^data:[^;]+;base64,(.+)$/);
  if (match) return Buffer.from(match[1], "base64");
  if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("套图结果不是可下载的图片 URL。");
  const response = await fetch(url);
  if (!response.ok) throw new Error("无法读取套图结果图片。");
  return Buffer.from(await response.arrayBuffer());
}

export async function createZipArchive(entries = []) {
  const files = await Promise.all(entries.filter((entry) => entry?.url && !String(entry.name || "").includes(".."))
    .map(async (entry) => ({ name: safeName(entry.name), data: Buffer.isBuffer(entry.buffer) ? entry.buffer : await dataUrlBuffer(entry.url) })));
  const local = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 6);
    header.writeUInt32LE(crc32(file.data), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 8);
    directory.writeUInt32LE(crc32(file.data), 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(file.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}
