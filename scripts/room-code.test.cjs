const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

const source = readFileSync('src/services/signaling/types.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleExports = {};
runInNewContext(compiled, { exports: moduleExports });

test('room codes accept exactly four unambiguous uppercase letters', () => {
  const { ROOM_CODE_PATTERN, normalizeRoomCode } = moduleExports;
  assert.equal(normalizeRoomCode(' abio-cd '), 'ABCD');
  assert.equal(normalizeRoomCode('wxyzq'), 'WXYZ');
  assert.equal(ROOM_CODE_PATTERN.test('ABCD'), true);
  for (const invalid of ['ABC', 'ABCDE', 'AB2D', 'ABID', 'ABOD', 'abcd']) {
    assert.equal(ROOM_CODE_PATTERN.test(invalid), false, invalid);
  }
});
