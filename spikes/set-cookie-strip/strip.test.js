'use strict';
/*
 * Unit tests for the strip/parse algorithm — the load-bearing logic of spike V1.
 * Runs on node's built-in test runner:  node --test
 * These prove the ALGORITHM is correct. Whether Firefox ESR 115 honors the
 * mutated responseHeaders (and truly skips persistence) is the separate
 * browser-level half — see README.md and testserver.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseSetCookie, isVaultCandidate, stripResponseCookies } = require('./strip.js');

const H = (name, value) => ({ name, value });

test('parse: extracts name/value and all attributes', () => {
  const c = parseSetCookie('sid=abc123; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600');
  assert.equal(c.name, 'sid');
  assert.equal(c.value, 'abc123');
  assert.equal(c.domain, 'example.com');
  assert.equal(c.path, '/');
  assert.equal(c.secure, true);
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'Lax');
  assert.equal(c.maxAge, '3600');
});

test('parse: value containing "=" (JWT/base64) splits only on the first "="', () => {
  const c = parseSetCookie('token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig==; HttpOnly');
  assert.equal(c.name, 'token');
  assert.equal(c.value, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig==');
  assert.equal(c.httpOnly, true);
});

test('parse: malformed input returns null (no throw)', () => {
  assert.equal(parseSetCookie('notacookie'), null);
  assert.equal(parseSetCookie(''), null);
  assert.equal(parseSetCookie('   '), null);
  assert.equal(parseSetCookie(42), null);
});

test('policy: httponly vaults only HttpOnly cookies', () => {
  assert.equal(isVaultCandidate(parseSetCookie('a=1; HttpOnly'), 'httponly'), true);
  assert.equal(isVaultCandidate(parseSetCookie('a=1'), 'httponly'), false);
});

test('policy: "all" vaults every cookie', () => {
  assert.equal(isVaultCandidate(parseSetCookie('a=1'), 'all'), true);
  assert.equal(isVaultCandidate(parseSetCookie('a=1; HttpOnly'), 'all'), true);
});

test('strip: removes the HttpOnly Set-Cookie, keeps the rest, preserves order', () => {
  const headers = [
    H('Content-Type', 'text/html'),
    H('Set-Cookie', 'sid=secret; HttpOnly; Secure'),
    H('Set-Cookie', 'theme=dark; Path=/'),
    H('X-Frame-Options', 'DENY'),
  ];
  const { headers: out, stripped } = stripResponseCookies(headers, 'httponly');
  assert.equal(stripped.length, 1);
  assert.equal(stripped[0].name, 'sid');
  const setCookies = out.filter(h => h.name.toLowerCase() === 'set-cookie');
  assert.equal(setCookies.length, 1);
  assert.equal(setCookies[0].value, 'theme=dark; Path=/');
  assert.equal(out[0].name, 'Content-Type');
  assert.equal(out[out.length - 1].name, 'X-Frame-Options');
});

test('strip: case-insensitive on header name AND the HttpOnly attribute', () => {
  const { headers: out, stripped } = stripResponseCookies([H('set-cookie', 'sid=x; httponly')], 'httponly');
  assert.equal(stripped.length, 1);
  assert.equal(out.length, 0);
});

test('strip: multiple HttpOnly cookies all removed, keeper survives', () => {
  const headers = [
    H('Set-Cookie', 'a=1; HttpOnly'),
    H('Set-Cookie', 'b=2'),
    H('Set-Cookie', 'c=3; HttpOnly'),
  ];
  const { headers: out, stripped } = stripResponseCookies(headers, 'httponly');
  assert.deepEqual(stripped.map(c => c.name), ['a', 'c']);
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 'b=2');
});

test('strip: empty / non-array input never throws', () => {
  assert.deepEqual(stripResponseCookies([], 'httponly'), { headers: [], stripped: [] });
  assert.deepEqual(stripResponseCookies(undefined, 'httponly'), { headers: [], stripped: [] });
  assert.deepEqual(stripResponseCookies(null, 'httponly'), { headers: [], stripped: [] });
});

test('strip: __Host- prefixed HttpOnly cookie is vaulted and parsed', () => {
  const { headers: out, stripped } = stripResponseCookies(
    [H('Set-Cookie', '__Host-sid=z; Path=/; Secure; HttpOnly')], 'httponly');
  assert.equal(stripped[0].name, '__Host-sid');
  assert.equal(stripped[0].secure, true);
  assert.equal(out.length, 0);
});

test('strip: never splits a Set-Cookie value on commas (Expires safety)', () => {
  const headers = [H('Set-Cookie', 'sid=x; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly')];
  const { stripped } = stripResponseCookies(headers, 'httponly');
  assert.equal(stripped.length, 1, 'the Expires comma must not create a phantom second cookie');
  assert.equal(stripped[0].name, 'sid');
  assert.ok(stripped[0].expires.includes('21 Oct 2026'));
});

test('strip: a non-HttpOnly cookie is left entirely in the browser', () => {
  const headers = [H('Set-Cookie', 'analytics=1; Path=/; SameSite=Lax')];
  const { headers: out, stripped } = stripResponseCookies(headers, 'httponly');
  assert.equal(stripped.length, 0);
  assert.equal(out.length, 1);
});
