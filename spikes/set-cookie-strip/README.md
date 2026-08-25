# Spike V1 — does stripping `Set-Cookie` prevent persistence?

This is the load-bearing assumption from the design spec (§5, validation item V1):

> Stripping `Set-Cookie` in `onHeadersReceived` actually prevents the browser
> from persisting the cookie.

The assumption has **two layers**, and they have very different confidence:

| Layer | Question | Confirmable where | Status |
|------|----------|-------------------|--------|
| **1. Algorithm** | Does our code correctly identify HttpOnly `Set-Cookie` and remove exactly those, preserving everything else? | Node (here) | ✅ **Confirmed — 13/13 tests pass** |
| **2. Browser behavior** | Does Firefox ESR 115 honor the mutated `responseHeaders` and skip persistence — across redirects, HTTP/2, HTTP/3, cache? | Real ESR 115 only | ⏳ **Pending** — run the harness below |

Layer 1 is where the bugs hide (parsing, ordering, case, comma-in-`Expires`), and
it is now nailed down. Layer 2 is well-documented Firefox behavior but "documented"
is not "confirmed on ESR 115," so it stays open until run on real hardware.

## Files

| File | What it is |
|------|-----------|
| `strip.js` | The pure algorithm — parse `Set-Cookie`, decide vault candidacy, strip. No browser APIs; runs in both the extension and node. |
| `strip.test.js` | 12 unit tests over the algorithm and its edge cases. |
| `integration.test.js` | Runs the algorithm against `Set-Cookie` headers from a real `http` server. |
| `manifest.json` + `background.js` | The actual Firefox MV2 extension that wires `onHeadersReceived` to `strip.js`. |
| `testserver.js` | A target site for the manual ESR 115 verification. |

## Run layer 1 (here — no browser needed)

```
cd spikes/set-cookie-strip
node --test
```

Expected: `# pass 13 / # fail 0`.

## Run layer 2 (on a real Firefox ESR 115 machine)

1. `node testserver.js` → serves http://127.0.0.1:8787/
2. In Firefox ESR 115: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick `manifest.json`.
3. Open the target, click **① Set cookies**, reload.
4. **Baseline (extension off):** the page echoes `sid=…` and `theme=…`; the profile's `cookies.sqlite` (or DevTools → Storage → Cookies) holds `sid`.
5. **Assumption holds (extension on):** the browser holds **no** `sid` — the page echoes only `theme=…`, Storage shows only `theme`, and the extension console (about:debugging → Inspect) logged `[vault] captured + stripped … sid`.
6. **Assumption refuted:** `sid` still appears despite the extension — record exactly where it leaked (redirect chain? cached response? HTTP/2 vs 1.1?) and feed it back into the spec.

## What a green layer 2 would let us claim

That the whole strip/inject design in §2 rests on a real, ESR-115-verified
foundation — at which point v1 is worth building. A red layer 2 sends us to the
proxy tier in the spec's Figure 4, with eyes open about its certificate cost.
