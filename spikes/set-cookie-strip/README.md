# Spike V1 — does stripping `Set-Cookie` prevent persistence?

This is the load-bearing assumption from the design spec (§5, validation item V1):

> Stripping `Set-Cookie` in `onHeadersReceived` actually prevents the browser
> from persisting the cookie.

The assumption has **two layers**, and they have very different confidence:

| Layer | Question | Confirmable where | Status |
|------|----------|-------------------|--------|
| **1. Algorithm** | Does our code correctly identify HttpOnly `Set-Cookie` and remove exactly those, preserving everything else? | Node (here) | ✅ **Confirmed — 13/13 tests pass** |
| **2. Browser behavior** | Does Firefox honor the mutated `responseHeaders` and skip persistence — across redirects, HTTP/2, HTTP/3, cache? | Real Firefox only | ⏳ **Pending** — run the harness below |

## Target browser — corrected

An earlier draft said "Firefox ESR 115." **That was wrong.** ESR 115's final
phase supports only Windows 7–8.1 and macOS 10.12–10.14. **macOS 10.15 Catalina
is the *minimum* for mainline Firefox** (since v116), so on a 10.15 Mac you run
**current mainline Firefox — 154 at time of writing — not an ESR.** Windows 10
runs mainline Firefox too. That is good news: we are on modern WebExtension APIs,
not a frozen 2023 baseline.

## Files

| File | What it is |
|------|-----------|
| `strip.js` | The pure strip/parse algorithm, shared verbatim by the extension and the tests. |
| `strip.test.js` | 12 unit tests over the algorithm and its edge cases. |
| `integration.test.js` | Runs the algorithm against `Set-Cookie` from a real `http` server. |
| `manifest.json` | Firefox **MV2** extension (simplest; loads on 154). |
| `manifest.mv3.json` | Firefox **MV3** variant — optional second run; also proves blocking `webRequest` survives under MV3. |
| `background.js` | Wires `onHeadersReceived` → `strip.js`. Works under both manifests. |
| `testserver.js` / `testserver.py` | The test target — Node or Python 3, pick whichever installs cleanly. |
| `RESULTS.md` / `results-layer1.tap` | The durable, committed record of outcomes. |

## Run layer 1 (here — no browser needed)

```
cd spikes/set-cookie-strip
node --test           # expect: # pass 13 / # fail 0
```

## Run layer 2 (on the real Firefox 154 machine)

### 1. Start the test target

Pick whichever runtime you have. On **Catalina**, if you use Node, install the
**Node 18** line (the last that supports macOS 10.15); or just use Python 3:

```
node testserver.js        # → http://127.0.0.1:8787/
# ── or ──
python3 testserver.py     # → http://127.0.0.1:8787/
```

Simplest is to run the server and Firefox **on the same machine** (localhost),
which avoids Firefox 154's Local Network Access prompts entirely. If you'd rather
run the server on your Windows PC and browse from the Mac, start it with
`HOST=0.0.0.0 node testserver.js` and open `http://<pc-ip>:8787/`. Directly
typing a LAN IP in the address bar is a top-level navigation, so it is **not**
subject to the LNA permission prompt (that targets public sites reaching *into*
your network, which is a different thing).

### 2. Baseline first — extension OFF

Open the page, click **① Set cookies**, reload. It should echo `sid=…` and
`theme=…`, and DevTools → Storage → Cookies should show both. This proves the
target works before the extension is in the picture.

### 3. Load the extension

`about:debugging` → **This Firefox** → **Load Temporary Add-on** → select
`manifest.json`. Then clear the site's cookies (or use a fresh private window),
and repeat **① Set cookies** → reload.

> **Optional MV3 run:** to also confirm the design's grounding fact that Firefox
> keeps *blocking* `webRequest` in MV3, back up `manifest.json`, copy
> `manifest.mv3.json` over it, and load again. Same expected result.

### 4. Read the verdict

- **Assumption HOLDS:** page echoes only `theme=…`; Storage shows **no `sid`**;
  the extension console (about:debugging → **Inspect**) logged
  `[vault] captured + stripped … sid`.
- **Assumption REFUTED:** `sid` still appears despite the extension — record
  exactly where (page echo vs. Storage, first load vs. reload, redirect/cache).

### 5. Record it

Fill the layer-2 table in `RESULTS.md` and commit, or just report the
observations and they'll be recorded for you.

## Why it matters

A green layer 2 means the whole strip/inject design (§2) rests on a real,
on-hardware foundation, and v1 is worth building. A red layer 2 sends us to the
proxy tier (spec Figure 4), eyes open about its certificate cost.

> **Note:** a temporary add-on unloads when Firefox closes. Keep the browser
> open for the whole test, and reload the add-on if you restart it.
