'use strict';
/*
 * Integration test: run the strip logic against Set-Cookie headers produced by
 * a REAL HTTP server (not hand-written strings). This closes the gap between
 * "the parser handles strings I wrote" and "the parser handles what a server
 * actually emits" — the part still short of a real browser is only whether
 * Firefox honors the mutated array, which node cannot exercise.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { stripResponseCookies } = require('./strip.js');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Set-Cookie', [
        'sid=SECRET-SESSION; HttpOnly; Secure; SameSite=Lax; Path=/',
        'theme=dark; Path=/',
        '__Host-csrf=TOK123; Secure; Path=/; HttpOnly',
      ]);
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('integration: strip logic applied to a live HTTP response', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { port } = server.address();

  const resp = await fetch('http://127.0.0.1:' + port + '/');
  const raw = resp.headers.getSetCookie(); // real Set-Cookie lines from the server
  assert.ok(raw.length >= 3, 'server emitted multiple Set-Cookie headers');

  // Reshape into the webRequest.onHeadersReceived responseHeaders array shape.
  const responseHeaders = [{ name: 'Content-Type', value: 'text/plain' }]
    .concat(raw.map(v => ({ name: 'Set-Cookie', value: v })));

  const { headers, stripped } = stripResponseCookies(responseHeaders, 'httponly');

  // Both HttpOnly cookies are vaulted; the non-HttpOnly one stays in the browser.
  assert.deepEqual(stripped.map(c => c.name).sort(), ['__Host-csrf', 'sid']);
  const remaining = headers.filter(h => h.name.toLowerCase() === 'set-cookie');
  assert.equal(remaining.length, 1);
  assert.ok(remaining[0].value.startsWith('theme=dark'));
});
