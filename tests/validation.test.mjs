import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, resolveMime, versionedFilename, MAX_FILE_SIZE } from '../src/lib/validation.js';

const f = (name, size, type = '') => ({ name, size, type });

test('accepts a small text file', () => {
  assert.equal(validateFile(f('notes.txt', 20, 'text/plain')), null);
});
test('falls back to the extension when the browser gives no type', () => {
  assert.equal(resolveMime(f('readme.md', 5, '')), 'text/markdown');
  assert.equal(validateFile(f('data.csv', 5, '')), null);
});
test('rejects empty, oversized and unsupported files', () => {
  assert.match(validateFile(f('a.txt', 0, 'text/plain')), /empty/i);
  assert.match(validateFile(f('a.txt', MAX_FILE_SIZE + 1, 'text/plain')), /10 MB/);
  assert.match(validateFile(f('virus.exe', 100, 'application/x-msdownload')), /not allowed/i);
});
test('rejects names with slashes or that are too long', () => {
  assert.match(validateFile(f('a/b.txt', 5, 'text/plain')), /slashes/i);
  assert.match(validateFile(f('a\\b.txt', 5, 'text/plain')), /slashes/i);
  assert.match(validateFile(f('x'.repeat(256) + '.txt', 5, 'text/plain')), /255/);
});
test('builds versioned download names', () => {
  assert.equal(versionedFilename('report.txt', 2), 'report_v2.txt');
  assert.equal(versionedFilename('Makefile', 1), 'Makefile_v1');
  assert.equal(versionedFilename('a.b.tar.zip', 3), 'a.b.tar_v3.zip');
});
