# Spike V1 — recorded results

This file is the durable record of the spike's metrics, so the outcome survives
any ephemeral dev container. Raw runner output is committed alongside it in
`results-layer1.tap`.

## Layer 1 — strip/parse algorithm (unit + integration)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-25 |
| Runner | `node --test` (node:test, TAP output) |
| Node | v22.22.2, Linux x64 (dev container) |
| Suite | `strip.test.js` (12 unit) + `integration.test.js` (1 vs live `node:http` server) |
| **Result** | **13 pass / 0 fail** |
| Duration | ~316 ms total |
| Verdict | **Algorithm CONFIRMED** — parse, HttpOnly policy, strip-with-order-preserved, `=` in values, comma-in-`Expires`, `__Host-` prefix, case-insensitivity, malformed-input safety |

Covered edge cases worth remembering:
- Splits `name=value` on the **first** `=` only (JWT/base64 values survive).
- Never splits a `Set-Cookie` line on commas (an `Expires` date contains one).
- Case-insensitive on both the header name and the `HttpOnly` attribute.
- Non-HttpOnly cookies pass through untouched (v1 policy); `all` policy tested for v2.
- Malformed/empty/non-string input returns null / empty — never throws in the hot path.

## Layer 2 — browser behavior on Firefox ESR 115 (PENDING)

To be run on real target hardware per `README.md`. Record the outcome here:

| Field | Value |
|---|---|
| Date | _(fill in)_ |
| Machine / OS | _(e.g. Intel Mac, macOS 10.15.x)_ |
| Firefox | _(about:support → version; expect mainline 154.x — macOS 10.15 is mainline's minimum, NOT ESR 115)_ |
| Manifest tested | _(MV2 `manifest.json` / MV3 `manifest.mv3.json`)_ |
| Baseline (ext OFF): `sid` persisted? | _(expect YES)_ |
| Ext ON: `sid` echoed by server on reload? | _(assumption holds → NO)_ |
| Ext ON: `sid` in DevTools → Storage → Cookies? | _(assumption holds → NO)_ |
| Ext ON: `theme` still present? | _(expect YES — proves we didn't over-strip)_ |
| Extension console shows `[vault] captured + stripped … sid`? | _(expect YES)_ |
| Redirect / cache variations tried | _(optional: note any)_ |
| **Verdict** | _(HOLDS / REFUTED — if refuted, note exactly where `sid` leaked)_ |

**Decision rule** (from the design spec §5): layer 2 **HOLDS** → v1 architecture
is sound, proceed. **REFUTED** → the strip/inject core fails on the target and
we revisit the proxy tier (spec Figure 4) with its certificate cost.
