import assert from 'node:assert/strict';
import test from 'node:test';

import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { TerminalConnection, terminalClientId } from '../lib/client/terminal-connection.ts';
import { packTerminal } from '../lib/client/terminal-frames.ts';

const utf8 = (value) => new TextEncoder().encode(value);
const base64 = (value) => Buffer.from(value).toString('base64');
const fromBase64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static latest = null;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.binaryType = 'blob';
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    FakeWebSocket.latest = this;
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  send(data) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('socket is not open');
    this.sent.push(data);
  }

  message(data) {
    this.onmessage?.({ data });
  }

  close(code = 1000, reason = '') {
    if (this.readyState >= FakeWebSocket.CLOSING) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

async function withBrowserMocks(run) {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  FakeWebSocket.latest = null;
  globalThis.WebSocket = FakeWebSocket;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ url: 'wss://relay.example.test/term?ticket=once' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  }
}

async function waitFor(check, label, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

test('terminal client ids are stable per surface but do not collide in one tab', () => {
  const originalStorage = globalThis.sessionStorage
  const values = new Map()
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  try {
    const heroId = terminalClientId('hero-terminal')
    const sectionId = terminalClientId('page-terminal')
    assert.equal(terminalClientId('hero-terminal'), heroId)
    assert.equal(terminalClientId('page-terminal'), sectionId)
    assert.notEqual(heroId, sectionId)
  } finally {
    if (originalStorage === undefined) delete globalThis.sessionStorage
    else globalThis.sessionStorage = originalStorage
  }
})

async function deviceFrame(open, deviceId, sessionId, deviceSecret, deviceSalt, text) {
  const shared = x25519.getSharedSecret(deviceSecret, fromBase64(open.clientPub));
  const raw = hkdf(
    sha256,
    shared,
    sha256(utf8(deviceId)),
    utf8(`forge-e2e-v2:${deviceId}:${open.clientId}`),
    32,
  );
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const nonce = new Uint8Array(12);
  nonce.set(deviceSalt, 0);
  new DataView(nonce.buffer).setBigUint64(4, 0n, false);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, utf8(text));
  const sealed = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
  sealed.set(nonce);
  sealed.set(new Uint8Array(ciphertext), nonce.byteLength);
  return packTerminal(sessionId, open.clientId, sealed).buffer;
}

test('terminal connection serializes key, ready, and the first PTY output', async () => {
  await withBrowserMocks(async () => {
    const deviceId = 'device-e2e';
    const sessionId = '6af21841-1604-480c-8495-12d0416df124';
    const statuses = [];
    let readyInfo = null;
    let output = '';
    const connection = new TerminalConnection(
      { deviceId, phoneSecret: 'phone-secret', cols: 80, rows: 24 },
      {
        onOutput: (bytes) => {
          output += new TextDecoder().decode(bytes);
        },
        onStatus: (status, detail) => statuses.push({ status, detail }),
        onReady: (info) => {
          readyInfo = info;
        },
      },
    );

    try {
      await connection.connect();
      const socket = FakeWebSocket.latest;
      assert.ok(socket, 'ticket should create a WebSocket');
      socket.open();
      const open = JSON.parse(socket.sent[0]);
      assert.equal(open.type, 'term_open');
      assert.equal(socket.binaryType, 'arraybuffer');

      const deviceSecret = x25519.utils.randomSecretKey();
      const devicePublic = x25519.getPublicKey(deviceSecret);
      const deviceSalt = crypto.getRandomValues(new Uint8Array(4));
      const terminalOutput = await deviceFrame(
        open,
        deviceId,
        sessionId,
        deviceSecret,
        deviceSalt,
        'live PTY output\r\n',
      );

      // WebSocket events arrive in order, but crypto import is asynchronous.
      // Send all three without yielding to reproduce the old key/ready race.
      socket.message(
        JSON.stringify({
          type: 'term_key',
          devicePub: base64(devicePublic),
          deviceSalt: base64(deviceSalt),
        }),
      );
      socket.message(
        JSON.stringify({
          type: 'term_ready',
          sessionId,
          shell: '/bin/sh',
          cwd: '/tmp',
          cols: 80,
          rows: 24,
        }),
      );
      socket.message(terminalOutput);

      await waitFor(() => output.includes('live PTY output'), 'decrypted terminal output');
      assert.ok(statuses.some(({ status }) => status === 'ready'));
      assert.equal(readyInfo.sessionId, sessionId);
      assert.equal(readyInfo.shell, '/bin/sh');
      assert.equal(socket.readyState, FakeWebSocket.OPEN, 'the first output must not desync the socket');

      connection.send('echo works\n');
      await waitFor(() => socket.sent.some((frame) => frame instanceof Uint8Array), 'encrypted keystrokes');
      assert.ok(!socket.sent.some((frame) => typeof frame === 'string' && frame.includes('echo works')));
    } finally {
      connection.detach();
    }
  });
});

test('terminal connection reports relay errors and retries instead of waiting forever', async () => {
  await withBrowserMocks(async () => {
    const statuses = [];
    const connection = new TerminalConnection(
      { deviceId: 'device-offline', phoneSecret: 'phone-secret', cols: 80, rows: 24 },
      {
        onOutput: () => {},
        onStatus: (status, detail) => statuses.push({ status, detail }),
      },
    );

    try {
      await connection.connect();
      const socket = FakeWebSocket.latest;
      assert.ok(socket);
      socket.open();
      socket.message(JSON.stringify({ type: 'error', code: 'DEVICE_OFFLINE', message: 'Laptop is offline' }));
      const retry = await waitFor(
        () => statuses.findLast(({ status }) => status === 'reconnecting'),
        'reconnecting state',
      );
      assert.match(retry.detail, /Laptop is offline/);
      assert.equal(socket.readyState, FakeWebSocket.CLOSED);
    } finally {
      connection.detach();
    }
  });
});
