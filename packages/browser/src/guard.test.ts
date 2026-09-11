import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeTarget, isPrivateAddress } from './guard.js';

test('isPrivateAddress covers the standard ranges', () => {
  for (const addr of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(addr), true, addr);
  }
  for (const addr of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(addr), false, addr);
  }
});

test('assertSafeTarget rejects loopback hostnames', async () => {
  await assert.rejects(() => assertSafeTarget('http://localhost:3000'));
  await assert.rejects(() => assertSafeTarget('http://127.0.0.1/'));
});

test('assertSafeTarget rejects non-http and credentialed URLs', async () => {
  await assert.rejects(() => assertSafeTarget('ftp://example.com'));
  await assert.rejects(() => assertSafeTarget('https://user:pass@example.com'));
});

test('assertSafeTarget accepts a public host', async () => {
  const { url } = await assertSafeTarget('https://example.com/path');
  assert.equal(url.hostname, 'example.com');
});
