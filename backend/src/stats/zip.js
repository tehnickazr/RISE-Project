// A zip file, written by hand.
//
// The statistics export is five CSVs and a README, and a browser can only be
// handed one file at a time — so they need a container. Rather than add a
// dependency for one endpoint, this writes the format directly: Node's zlib
// already provides both halves that are genuinely hard, DEFLATE compression and
// a CRC-32.
//
// Deliberately minimal. No directories, no encryption, no zip64, no data
// descriptors, no unicode path extra field. Names are ASCII by construction
// (`01_summary.csv`), and anything beyond a few kilobytes of text is out of
// scope for this endpoint.
//
// Verified against `unzip -t` and macOS Archive Utility, which disagree about
// enough of the specification to be a useful pair.

import zlib from 'node:zlib';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

/** MS-DOS date and time, which is what the format stores. Two-second resolution. */
function dosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Build a zip from `{ name: contents }`.
 *
 * Contents may be a string or a Buffer. Strings are written as UTF-8 with a
 * byte-order mark, because these are CSVs destined for Excel on Windows, where
 * without the mark "Tehnička škola" arrives as mojibake.
 */
export function zipSync(files, { now = new Date(), bom = true } = {}) {
  const { time, day } = dosDateTime(now);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, raw] of Object.entries(files)) {
    const body = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from((bom ? '﻿' : '') + raw, 'utf8');

    const crc = zlib.crc32(body);
    const deflated = zlib.deflateRawSync(body);
    // Compression that makes a file larger is not compression. Storing it
    // uncompressed is legal, simpler, and what every zip writer does here.
    const useDeflate = deflated.length < body.length;
    const payload = useDeflate ? deflated : body;
    const method = useDeflate ? 8 : 0;

    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0, for DEFLATE
    local.writeUInt16LE(0, 6); // flags — none; names are ASCII
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    chunks.push(local, nameBuf, payload);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(CENTRAL_SIG, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(body.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk number
    dir.writeUInt16LE(0, 36); // internal attributes
    // External attributes: a regular file, rw-r--r--, in the high sixteen bits.
    // `<< 16` would be wrong — JavaScript shifts as *signed* 32-bit, and this
    // value crosses 2^31, so it comes back negative and Buffer refuses it.
    dir.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);

    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, centralBuf, end]);
}
