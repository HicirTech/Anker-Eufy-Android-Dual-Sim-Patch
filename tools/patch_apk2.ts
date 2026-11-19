// Generalized in-place byte patch for a STORED .so entry inside a split APK.
// Usage: bun patch_apk2.ts SRC.apk OUT.apk ENTRY SO_OFFSET FROM_HEX TO_HEX
// e.g.   ... lib/arm64-v8a/libmega_media_sdk.so 0x34a0a0 fd7bb2a9fd030091 00008052c0035fd6
const [SRC, OUT, ENTRY, OFFs, FROMs, TOs] = process.argv.slice(2);
const SO_OFF = Number(OFFs);
const FROM = Buffer.from(FROMs, "hex");
const TO = Buffer.from(TOs, "hex");
if (FROM.length !== TO.length) throw new Error("FROM/TO length mismatch");

const T = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
const crc32 = (b: Buffer, s: number, e: number) => { let c=0xffffffff; for(let i=s;i<e;i++) c=T[(c^b[i])&0xff]^(c>>>8); return (c^0xffffffff)>>>0; };

const buf = Buffer.from(await Bun.file(SRC).arrayBuffer());
let eocd = -1;
for (let i = buf.length-22; i>=0 && i>buf.length-22-0x10000; i--) if (buf.readUInt32LE(i)===0x06054b50){eocd=i;break;}
if (eocd<0) throw new Error("no EOCD");
const cdOff = buf.readUInt32LE(eocd+16), cdCount = buf.readUInt16LE(eocd+10);
let p = cdOff, f: any = null;
for (let i=0;i<cdCount;i++){
  if (buf.readUInt32LE(p)!==0x02014b50) throw new Error("bad CD");
  const method=buf.readUInt16LE(p+10), uncompSize=buf.readUInt32LE(p+24);
  const fnLen=buf.readUInt16LE(p+28), exLen=buf.readUInt16LE(p+30), cmLen=buf.readUInt16LE(p+32);
  const lho=buf.readUInt32LE(p+42), name=buf.toString("utf8",p+46,p+46+fnLen);
  if (name===ENTRY) f={cdPos:p,method,uncompSize,lho,oldCrc:buf.readUInt32LE(p+16)};
  p+=46+fnLen+exLen+cmLen;
}
if (!f) throw new Error("entry not found: "+ENTRY);
if (f.method!==0) throw new Error("entry COMPRESSED");
const lfnLen=buf.readUInt16LE(f.lho+26), lexLen=buf.readUInt16LE(f.lho+28);
const dataOff=f.lho+30+lfnLen+lexLen, abs=dataOff+SO_OFF;
console.log(ENTRY,"data@0x"+dataOff.toString(16),"patchAbs=0x"+abs.toString(16),"have=",buf.subarray(abs,abs+FROM.length).toString("hex"),"oldCRC=0x"+f.oldCrc.toString(16));
if (!buf.subarray(abs,abs+FROM.length).equals(FROM)) throw new Error("FROM mismatch at site: "+buf.subarray(abs,abs+FROM.length).toString("hex"));
TO.copy(buf, abs);
const newCrc = crc32(buf, dataOff, dataOff+f.uncompSize);
buf.writeUInt32LE(newCrc, f.lho+14); buf.writeUInt32LE(newCrc, f.cdPos+16);
await Bun.write(OUT, buf);
console.log("patched; newCRC=0x"+newCrc.toString(16),"-> wrote",OUT);
