# PIBvMix v0.2.0 — Final Audit & Test Report

Date: **2026-08-16**

This build was re-audited immediately before the first real-venue integration against:

- official vMix 29 HTTP Web API and Shortcut Function documentation;
- Bitfocus Companion vMix module architecture/state handling;
- `vmix-js-utils` XML input modeling;
- the established vMixUTC request-management patterns previously reviewed for this project.

## Corrections made during final audit

1. **Preview-only overlays are no longer treated as ON AIR.** The emulator now emits an active overlay and a `preview="True"` overlay, matching modern vMix XML semantics.
2. **Title PREVIEW indication is ambiguity-safe.** Resolution is performed against every configured preset for the same Title input; duplicate field values produce an ambiguous state rather than multiple PREVIEW badges.
3. **Preset editing survives polling.** Background `/api` polling no longer rebuilds the page when nothing visually changed and never destroys an open Preset modal.
4. **Demo → real vMix Connect is safe.** Connecting directly while Demo mode is active restores the operator's real configuration before persisting the real target.
5. **Index-only Title actions refresh safety state** after `SelectTitlePreset` before changing Preview.
6. **Repeated poll failures reach Disconnected** instead of remaining indefinitely Degraded; CONTROL resources become OFFLINE/disabled.
7. Static assets are versioned as **v0.2.0** to reduce stale-cache risk on the event browser.

## Automated results

### Node core + HTTP emulator

**12/12 passed**

Coverage includes address normalization, RFC4180-style CSV edge cases, recursive/cyclic ON AIR graph, active-vs-preview overlay behavior, mock Title/Preview commands, field verification, ambiguous Title preset detection, storage failures, connection failures, production `VmixClient` against the HTTP emulator, HTTP 200/500 behavior, and zero-based Title preset commands used by the emulator.

### Chromium / Playwright stress

**14/14 passed, 0 browser errors**

Coverage includes Demo boot, vMix field mapping, Preset modal persistence across multiple polling cycles, independent CONTROL labels, CONFIGURE ↔ CONTROL navigation, visible Edit Resources return path, nested ON AIR blocking, preview-only overlay non-blocking, Title preset selection + state verification, search persistence across polling, 25 navigation round-trips, rapid same-Lower clicks, and Preset-manager consistency after stress.

### Browser HTTP smoke tests

**2/2 passed**

- Chromium production `VmixClient` → real local HTTP emulator.
- Demo mode → direct Connect to HTTP emulator without leaking Demo resources into the real configuration.

### Syntax

All JavaScript/MJS source, emulator, and test files pass `node --check`.

## Remaining real-world integration gate

No emulator can prove the venue-specific chain:

`GitHub Pages HTTPS → Chrome/Edge Local Network Access → venue LAN/firewall → real vMix Web Controller :8088`.

The application is intentionally structured so this is a short integration validation, not development. See README/SPEC for the venue checklist.
