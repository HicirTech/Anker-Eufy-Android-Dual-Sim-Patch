// Patch libeufy_link.so inside an arm64 split APK in place (STORED entry),
// changing the strstr needle "usb" -> "rmn" at .so file offset 0x796fa so the
// EufyLink broadcast skips rmnet* cellular interfaces. Same length => no realign.
// Recomputes the zip CRC32 for the entry (local + central headers), then the APK
// must be re-signed with apksigner.

const SRC = process.argv[2];
const OUT = process.argv[3];
const ENTRY = "lib/arm64-v8a/libeufy_link.so";
const SO_OFF = 0x796fa; // offset of "usb" within the .so
const FROM = Buffer.from("usb", "ascii");
const TO = Buffer.from("rmn", "ascii");

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const buf = Buffer.from(await Bun.file(SRC).arrayBuffer());

// locate EOCD
let eocd = -1;
for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0x10000; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error("EOCD not found");
const cdOff = buf.readUInt32LE(eocd + 16);
const cdCount = buf.readUInt16LE(eocd + 10);

// walk central directory
let p = cdOff, found: any = null;
for (let i = 0; i < cdCount; i++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad CD sig at " + p.toString(16));
  const method = buf.readUInt16LE(p + 10);
  const crc = buf.readUInt32LE(p + 16);
  const compSize = buf.readUInt32LE(p + 20);
  const uncompSize = buf.readUInt32LE(p + 24);
  const fnLen = buf.readUInt16LE(p + 28);
  const exLen = buf.readUInt16LE(p + 30);
  const cmLen = buf.readUInt16LE(p + 32);
  const lho = buf.readUInt32LE(p + 42);
  const name = buf.toString("utf8", p + 46, p + 46 + fnLen);
  if (name === ENTRY) found = { cdPos: p, method, crc, compSize, uncompSize, lho };
  p += 46 + fnLen + exLen + cmLen;
}
if (!found) throw new Error("entry not found: " + ENTRY);
console.log("entry:", ENTRY, "method=", found.method, "size=", found.uncompSize, "oldCRC=0x" + found.crc.toString(16), "lho=0x" + found.lho.toString(16));
if (found.method !== 0) throw new Error("entry is COMPRESSED (method " + found.method + "); in-place byte patch unsafe");

// local header -> data offset
if (buf.readUInt32LE(found.lho) !== 0x04034b50) throw new Error("bad LFH sig");
const lfnLen = buf.readUInt16LE(found.lho + 26);
const lexLen = buf.readUInt16LE(found.lho + 28);
const dataOff = found.lho + 30 + lfnLen + lexLen;
const patchAbs = dataOff + SO_OFF;
const cur = buf.toString("ascii", patchAbs, patchAbs + 3);
console.log("data@0x" + dataOff.toString(16), "patchAbs=0x" + patchAbs.toString(16), "bytesThere=", JSON.stringify(cur), buf.subarray(patchAbs, patchAbs + 4));
if (!buf.subarray(patchAbs, patchAbs + 3).equals(FROM)) throw new Error("expected 'usb' at patch site, got " + JSON.stringify(cur));

// patch
TO.copy(buf, patchAbs);

// recompute CRC32 over the entry data
const newCrc = crc32(buf, dataOff, dataOff + found.uncompSize);
buf.writeUInt32LE(newCrc, found.lho + 14);   // local header CRC
buf.writeUInt32LE(newCrc, found.cdPos + 16); // central dir CRC
console.log("patched 'usb'->'rmn'; newCRC=0x" + newCrc.toString(16));

await Bun.write(OUT, buf);
console.log("wrote", OUT, buf.length, "bytes");
