'use strict';
/*
 * background.js — the Firefox MV2 wiring for the Set-Cookie strip spike.
 *
 * strip.js is listed first in manifest background.scripts, so self.CookieStrip
 * is defined by the time this runs. This file is the ONLY part that touches a
 * browser API; the logic it calls is the same pure module the unit tests cover.
 *
 * NOTE: this uses blocking webRequest, which Firefox retains (unlike Chromium
 * MV3). On Chromium this listener could not modify responseHeaders at all.
 */

const POLICY = 'httponly'; // v1: vault HttpOnly cookies only
const vaultLog = [];       // in the real product this goes to the native vault

browser.webRequest.onHeadersReceived.addListener(
  function (details) {
    const result = self.CookieStrip.stripResponseCookies(details.responseHeaders, POLICY);
    if (result.stripped.length === 0) {
      return {}; // nothing to do — leave the response untouched
    }
    for (const cookie of result.stripped) {
      vaultLog.push({ url: details.url, name: cookie.name, domain: cookie.domain, ts: Date.now() });
      // Real product: hand `cookie` to the native vault over native messaging.
      console.log('[vault] captured + stripped HttpOnly cookie:', cookie.name, 'from', details.url);
    }
    return { responseHeaders: result.headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'responseHeaders']
);

// Let a test page or the console read what was captured.
browser.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg === 'getVaultLog') { sendResponse(vaultLog); return true; }
});

console.log('[spike] Set-Cookie strip active — policy:', POLICY);
