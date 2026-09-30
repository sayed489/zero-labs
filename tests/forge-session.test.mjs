import assert from 'node:assert/strict';
import test from 'node:test';
import { isUsableForgeSession, readForgeSession, FORGE_SESSION_KEY } from '../lib/client/forge-session.ts';

test('claimed devices survive expired pair codes and account restoration without a code', () => {
  assert.equal(isUsableForgeSession({ deviceId: 'device', phoneSecret: 'secret', code: '', expiresAt: '2000-01-01' }), true);
  assert.equal(isUsableForgeSession({ deviceId: 'device', phoneSecret: 'secret', code: 'ABC', expiresAt: '2000-01-01' }), true);
});

test('unclaimed expired or malformed sessions cannot be resumed', () => {
  for (const value of [null, {}, 'text', { code: 'ABC', phoneSecret: {} }, { code: 'ABC', phoneSecret: 'secret', expiresAt: '2000-01-01' }, { code: 'ABC', phoneSecret: 'secret', expiresAt: 'not-a-date' }]) {
    assert.equal(isUsableForgeSession(value), false);
  }
  assert.equal(isUsableForgeSession({ code: 'ABC', phoneSecret: 'secret', expiresAt: '2099-01-01' }), true);
});

test('storage reader restores device-only credentials and tolerates blocked storage', () => {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem(key) {
      assert.equal(key, FORGE_SESSION_KEY);
      return JSON.stringify({ code: '', deviceId: 'device', phoneSecret: 'secret' });
    } };
    assert.equal(readForgeSession()?.deviceId, 'device');
    globalThis.localStorage = { getItem() { throw new Error('blocked'); } };
    assert.equal(readForgeSession(), null);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
