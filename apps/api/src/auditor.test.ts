import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTarget } from './auditor.js';

test('rejects loopback targets to prevent SSRF', async () => {
 await assert.rejects(assertSafeTarget('http://127.0.0.1:3000'), /Private and local/);
});

test('rejects credentials embedded in target URLs', async () => {
 await assert.rejects(assertSafeTarget('https://user:secret@example.com'), /credentials/);
});
