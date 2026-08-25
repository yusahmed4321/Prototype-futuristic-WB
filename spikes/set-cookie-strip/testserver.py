#!/usr/bin/env python3
"""
testserver.py — Python 3 fallback for the ESR/mainline browser test, for
machines where installing Node is inconvenient (e.g. Catalina, where the last
Node line is 18). Behaves like testserver.js.

Run:   python3 testserver.py
       HOST=0.0.0.0 PORT=8787 python3 testserver.py   # to browse from the LAN

Then open the printed URL in Firefox 154, once with the extension loaded and
once without, and compare whether the HttpOnly `sid` cookie persists.
"""
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from html import escape
from time import time

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        seen = self.headers.get("Cookie", "(none)")
        if self.path.startswith("/set"):
            self.send_response(200)
            # sid is HttpOnly (vault target); theme is a normal cookie (keeper).
            # No Secure flag, so plain-HTTP LAN testing works.
            self.send_header("Set-Cookie", "sid=SECRET-SESSION-%d; HttpOnly; SameSite=Lax; Path=/" % int(time()))
            self.send_header("Set-Cookie", "theme=dark; Path=/")
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Cookies set</h1><p>One HttpOnly <code>sid</code>, one normal <code>theme</code>.</p>"
                             b"<p>Now open <a href='/'>/</a> and check Storage / cookies.sqlite.</p>")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        body = """<!doctype html><meta charset="utf-8"><title>Strip spike target</title>
<h1>Set-Cookie strip spike — test target</h1>
<p><a href="/set">&#9312; Set cookies</a>, then reload this page.</p>
<h2>Cookie header the server received on THIS request</h2>
<pre>%s</pre>
<h2>Pass / fail</h2>
<ul>
  <li><b>Extension OFF:</b> after /set, this echoes <code>sid=&hellip;</code> and <code>theme=&hellip;</code>; profile holds <code>sid</code>. (baseline)</li>
  <li><b>Extension ON (assumption holds):</b> after /set, NO <code>sid</code> here or in Storage &mdash; only <code>theme</code> &mdash; and the extension console logged <code>[vault] captured + stripped &hellip; sid</code>.</li>
  <li><b>Assumption REFUTED:</b> <code>sid</code> still appears despite the extension. Record exactly where it leaked.</li>
</ul>""" % escape(seen)
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *args):
        pass  # quiet


if __name__ == "__main__":
    shown = "<this-machine-ip>" if HOST == "0.0.0.0" else HOST
    print("Spike test server -> http://%s:%d/" % (shown, PORT))
    print("Load the extension in Firefox 154 via about:debugging, then compare ON vs OFF.")
    HTTPServer((HOST, PORT), Handler).serve_forever()
