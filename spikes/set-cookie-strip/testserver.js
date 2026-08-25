'use strict';
/*
 * testserver.js — manual browser-verification aid for the ESR 115 half of the spike.
 *
 * Run:   node testserver.js
 * Then open http://127.0.0.1:8787/ in Firefox ESR 115, once with the extension
 * loaded (about:debugging → This Firefox → Load Temporary Add-on → manifest.json)
 * and once without, and compare whether the HttpOnly `sid` cookie persists.
 */
const http = require('node:http');
const PORT = process.env.PORT || 8787;
// Default loopback-only. To browse from another machine on your LAN
// (e.g. server on the Windows PC, Firefox on the Catalina Mac), run:
//   HOST=0.0.0.0 node testserver.js     (then browse to http://<server-ip>:8787/)
// The sid cookie deliberately omits `Secure` so plain-HTTP LAN testing works.
const HOST = process.env.HOST || '127.0.0.1';

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

http.createServer((req, res) => {
  const seen = req.headers.cookie || '(none)';

  if (req.url.startsWith('/set')) {
    res.setHeader('Set-Cookie', [
      'sid=SECRET-SESSION-' + Date.now() + '; HttpOnly; SameSite=Lax; Path=/',
      'theme=dark; Path=/',
    ]);
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Cookies set</h1><p>One HttpOnly <code>sid</code>, one normal <code>theme</code>.</p>'
      + '<p>Now open <a href="/">/</a> and check Storage / cookies.sqlite.</p>');
    return;
  }

  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>Strip spike target</title>
<h1>Set-Cookie strip spike — test target</h1>
<p><a href="/set">① Set cookies</a>, then reload this page.</p>
<h2>Cookie header the server received on THIS request</h2>
<pre>${esc(seen)}</pre>
<h2>Pass / fail</h2>
<ul>
  <li><b>Extension OFF:</b> after /set, this echoes <code>sid=…</code> and <code>theme=…</code>; profile holds <code>sid</code>. (baseline)</li>
  <li><b>Extension ON (assumption holds):</b> after /set, the browser holds NO <code>sid</code> — this echoes only <code>theme=…</code>, Storage shows only <code>theme</code>, and the extension console logged <code>[vault] captured + stripped … sid</code>.</li>
  <li><b>Assumption REFUTED:</b> <code>sid</code> still shows up here or in Storage despite the extension — stripping in onHeadersReceived did NOT prevent persistence. Record exactly where it leaked (redirect? cache? http/2?).</li>
</ul>`);
}).listen(PORT, HOST, () => {
  console.log('Spike test server → http://' + (HOST === '0.0.0.0' ? '<this-machine-ip>' : HOST) + ':' + PORT + '/');
  console.log('Load the extension in Firefox ESR 115 via about:debugging, then compare ON vs OFF.');
});
