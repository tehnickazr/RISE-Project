// The zip writer, checked against a real unzip rather than against itself.
//
// A hand-written container that only its own reader can open is worthless: the
// whole point is that a partner opens it in Excel on Windows or Finder on a
// Mac. So these tests shell out to the system `unzip` where it exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';

import { zipSync } from '../src/stats/zip.js';

const hasUnzip = (() => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function withZip(files, fn, opts) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rise-zip-'));
  const file = path.join(dir, 'export.zip');
  writeFileSync(file, zipSync(files, opts));
  try {
    return fn(file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the container starts with the local file header signature', () => {
  const buf = zipSync({ 'a.txt': 'hello' });
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
});

test('an empty set still produces a valid, empty archive', () => {
  const buf = zipSync({});
  assert.equal(buf.length, 22); // end-of-central-directory record only
  assert.equal(buf.readUInt32LE(0), 0x06054b50);
  assert.equal(buf.readUInt16LE(8), 0);
});

test('text files are written with a byte-order mark, for Excel', () => {
  const buf = zipSync({ 'a.csv': 'name;value\n' });
  assert.ok(buf.includes(Buffer.from([0xef, 0xbb, 0xbf])));
});

test('the mark can be turned off', () => {
  const buf = zipSync({ 'a.csv': 'name;value\n' }, { bom: false });
  assert.ok(!buf.includes(Buffer.from([0xef, 0xbb, 0xbf])));
});

test('incompressible content is stored rather than inflated', () => {
  // Genuinely random, not an arithmetic sequence — `(i * k) % n` looks random
  // and deflates beautifully, which is how this test failed the first time.
  const random = randomBytes(512);
  const buf = zipSync({ 'r.bin': random });
  assert.equal(buf.readUInt16LE(8), 0, 'method should be 0 (stored)');
});

test('compressible content is deflated', () => {
  const buf = zipSync({ 'a.csv': 'a;b;c\n'.repeat(500) });
  assert.equal(buf.readUInt16LE(8), 8, 'method should be 8 (deflate)');
});

test('the CRC recorded is the CRC of the content', () => {
  const body = Buffer.from('﻿hello', 'utf8');
  const buf = zipSync({ 'a.txt': 'hello' });
  assert.equal(buf.readUInt32LE(14), zlib.crc32(body));
});

test('the central directory counts every entry', () => {
  const buf = zipSync({ 'a.txt': 'x', 'b.txt': 'y', 'c.txt': 'z' });
  const end = buf.subarray(buf.length - 22);
  assert.equal(end.readUInt16LE(8), 3);
  assert.equal(end.readUInt16LE(10), 3);
});

test('system unzip accepts it', { skip: !hasUnzip }, () => {
  withZip({ '01_summary.csv': 'metric;value\nstarted;703\n' }, (file) => {
    const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    assert.match(out, /No errors detected/);
  });
});

test('what comes back out is what went in, diacritics included', { skip: !hasUnzip }, () => {
  const content =
    'school;country;students\nTehnička škola Zrenjanin;RS;96\n' +
    'Lycée Professionnel Jacques Le Caron;FR;64\nAEVA — Aveiro;PT;38\n';

  withZip({ '02_by_school.csv': content }, (file, dir) => {
    execFileSync('unzip', ['-q', file, '-d', dir]);
    const back = readFileSync(path.join(dir, '02_by_school.csv'), 'utf8');
    assert.equal(back.charCodeAt(0), 0xfeff, 'byte-order mark survives');
    assert.equal(back.slice(1), content);
  });
});

test('several files round-trip, compressed and stored alike', { skip: !hasUnzip }, () => {
  const files = {
    '00_README.txt': 'Read me.\n'.repeat(200), // deflates
    '01_summary.csv': 'metric;value\r\ncost;5,17\r\n', // small, may store
    '05_progress.csv': 'scope;score_first\r\nplatform;2,84\r\n',
  };
  withZip(files, (file, dir) => {
    execFileSync('unzip', ['-q', file, '-d', dir]);
    for (const [name, body] of Object.entries(files)) {
      assert.equal(readFileSync(path.join(dir, name), 'utf8').slice(1), body, name);
    }
  });
});
