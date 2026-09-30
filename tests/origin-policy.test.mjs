import assert from 'node:assert/strict';
import test from 'node:test';
import { hasTrustedOrigin } from '../lib/server/origin-policy.ts';

const request = (origin, headers = {}) => new Request('https://forge.vercel.app/api/machines', { headers: { ...(origin ? { origin } : {}), ...headers } });
test('unrelated preview tenants and opaque origins are not trusted', () => {
  for (const origin of ['https://evil.vercel.app', 'https://evil.v0.app', 'https://evil.vusercontent.net', 'http://localhost:9999', 'null']) {
    assert.equal(hasTrustedOrigin(request(origin)), false, origin);
  }
});
test('actual origin and explicitly configured origins remain usable', () => {
  assert.equal(hasTrustedOrigin(request('https://forge.vercel.app')), true);
  assert.equal(hasTrustedOrigin(request('https://custom.example'), ['https://custom.example']), true);
  assert.equal(hasTrustedOrigin(request('https://3000-demo.e2b.app', { 'x-forwarded-host': '3000-demo.e2b.app', 'x-forwarded-proto': 'https' })), true);
});
test('non-browser installers work without granting cross-site browser requests access', () => {
  assert.equal(hasTrustedOrigin(request()), true);
  assert.equal(hasTrustedOrigin(request(null, { 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(hasTrustedOrigin(request(null, { 'sec-fetch-site': 'cross-site' })), false);
});
