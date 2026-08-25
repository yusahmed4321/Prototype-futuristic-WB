'use strict';
/*
 * strip.js — pure Set-Cookie handling for the Cookie Vault.
 *
 * This is the load-bearing algorithm from the design spec (§2, spike V1):
 * given the responseHeaders array that Firefox hands to
 * webRequest.onHeadersReceived, remove the Set-Cookie entries that belong in
 * the vault and hand back both the trimmed header array (safe to return to the
 * browser) and the parsed cookies to store.
 *
 * It is deliberately dependency-free and environment-neutral so the SAME code
 * runs in a Firefox MV2 background script (via self.CookieStrip) and under
 * node's test runner (via module.exports). No browser APIs are touched here.
 */

// Parse one Set-Cookie header VALUE into a structured cookie, or null if it is
// not a valid cookie. Splits name=value on the FIRST '=' only (values may be
// base64/JWT and contain '='), and never splits the whole string on commas
// (an Expires date legally contains a comma — comma-splitting corrupts it).
function parseSetCookie(headerValue) {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') return null;

  const segments = headerValue.split(';');
  const first = segments.shift();
  const eq = first.indexOf('=');
  if (eq === -1) return null;

  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (name === '') return null;

  const cookie = {
    name: name,
    value: value,
    domain: null,
    path: null,
    secure: false,
    httpOnly: false,
    sameSite: null,
    maxAge: null,
    expires: null,
  };

  for (const rawSeg of segments) {
    const seg = rawSeg.trim();
    if (seg === '') continue;
    const i = seg.indexOf('=');
    const attr = (i === -1 ? seg : seg.slice(0, i)).trim().toLowerCase();
    const attrVal = i === -1 ? null : seg.slice(i + 1).trim();
    switch (attr) {
      case 'httponly': cookie.httpOnly = true; break;
      case 'secure':   cookie.secure = true; break;
      case 'domain':   cookie.domain = attrVal; break;
      case 'path':     cookie.path = attrVal; break;
      case 'samesite': cookie.sameSite = attrVal; break;
      case 'max-age':  cookie.maxAge = attrVal; break;
      case 'expires':  cookie.expires = attrVal; break;
      default: break; // unknown attributes are ignored, not fatal
    }
  }
  return cookie;
}

// v1 policy is HttpOnly-only. 'all' is the v2 opt-in path (still exercised by
// tests so the switch is proven before it ships).
function isVaultCandidate(cookie, policy) {
  if (!cookie) return false;
  if ((policy || 'httponly') === 'all') return true;
  return cookie.httpOnly === true;
}

// The core operation. Returns { headers, stripped }:
//   headers  — new array with vault-bound Set-Cookie entries removed, order
//              of all other headers preserved; safe to return from
//              onHeadersReceived so the browser never persists them.
//   stripped — parsed cookies to hand to the native vault.
function stripResponseCookies(responseHeaders, policy) {
  const headers = [];
  const stripped = [];
  if (!Array.isArray(responseHeaders)) return { headers: headers, stripped: stripped };

  for (const h of responseHeaders) {
    if (h && typeof h.name === 'string' && h.name.toLowerCase() === 'set-cookie') {
      const cookie = parseSetCookie(h.value);
      if (isVaultCandidate(cookie, policy)) {
        stripped.push(cookie);
        continue; // drop it — the whole point of the spike
      }
    }
    headers.push(h);
  }
  return { headers: headers, stripped: stripped };
}

const API = { parseSetCookie, isVaultCandidate, stripResponseCookies };
if (typeof module !== 'undefined' && module.exports) module.exports = API; // node
if (typeof self !== 'undefined') self.CookieStrip = API;                    // extension
