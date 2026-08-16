# PIBvMix — Development Plan

Status: **Execution plan for v1**  
Source of truth: [`SPEC.md`](./SPEC.md)  
Visual reference: [`estudo ui.png`](./estudo%20ui.png)

## Product goal

Build a static GitHub Pages application that makes the operator's live task extremely fast:

> **See which resources are PROGRAM/PREVIEW/ON AIR, find the next resource, click once to send it to vMix Preview.**

The application has two distinct moments:

1. **CONFIGURE** — connect to vMix, discover inputs, import Title Preset CSVs, create one resource per person/title, choose resources, rename and organize them.
2. **CONTROL** — a compact dashboard of large resource cards. PROGRAM/PREVIEW/ON AIR state is shown directly on the cards; there are no large Program/Preview monitors because the operator already has the vMix UI open.

---

## Phase 0 — Architecture and test harness

- [ ] Create framework-free HTML/CSS/JavaScript module structure.
- [ ] Keep transport, parser, normalized state, safety logic, persistence and UI separate.
- [ ] Implement `VmixClient` contract for real HTTP vMix.
- [ ] Implement `MockVmixClient` with realistic vMix state transitions.
- [ ] Add representative vMix XML and Title CSV fixtures.
- [ ] Add a built-in **Demo/Mock mode** so the full UI can be exercised without vMix.

**Gate:** the application can load a realistic mock production and mutate Preview/Title state without any vMix installation.

## Phase 1 — vMix state and command core

- [ ] Normalize vMix target addresses and construct commands with `URL`/`URLSearchParams`.
- [ ] Parse `/api` XML using `DOMParser` in browser and a portable parser path for tests.
- [ ] Build GUID↔input-number maps.
- [ ] Parse Program, Preview, active overlays, nested layers and Title fields.
- [ ] Implement single-flight polling and reconnection state.
- [ ] Implement `PreviewInput`.
- [ ] Implement `SelectTitlePreset`.
- [ ] Verify command success from subsequent vMix state, not optimistic UI only.

**Gate:** parser/client tests pass and mock commands reproduce expected vMix state changes.

## Phase 2 — Live safety

- [ ] Build recursive parent→child input dependency graph.
- [ ] Compute `onAirInputKeys` from Program + active overlays + nested descendants.
- [ ] Block Title preset mutation when the underlying Title is ON AIR.
- [ ] Serialize commands per Title GUID to prevent rapid-click races.
- [ ] Resolve exact Title preset from current field values when possible.
- [ ] Detect preset mismatch after `SelectTitlePreset`; never Preview a verified Title when values do not match.

**Gate:** automated tests cover direct, overlay, nested and cyclic dependency cases plus rapid clicks and preset drift.

## Phase 3 — CONFIGURE experience

- [ ] Connection card with forgiving address input, Test/Connect and diagnostic help.
- [ ] Available-input browser with search and filters.
- [ ] Select normal vMix resources.
- [ ] Identify Title/Lower candidates.
- [ ] Import Title Preset CSV locally in browser.
- [ ] Parse quoted commas/quotes/BOM/newlines safely.
- [ ] Preview imported rows before accepting them.
- [ ] Allow individual Title presets to become independent resources.
- [ ] Generate useful labels and allow renaming.
- [ ] Selected-resource panel with reorder/remove controls.
- [ ] Persist configuration in namespaced/versioned `localStorage`.
- [ ] Export/import configuration JSON.

**Gate:** a complete resource configuration can be built, reordered, reloaded and restored entirely client-side.

## Phase 4 — CONTROL experience

- [ ] Match the dashboard visual language of `estudo ui.png` without reproducing unnecessary broadcast-monitor clutter.
- [ ] Compact top bar: PIBvMix, connection status, search/filter, Configure.
- [ ] Large responsive resource cards optimized for fast visual scanning.
- [ ] Show `PROGRAM`, `PREVIEW`, `ON AIR`, `READY`, `SENDING`, `UNAVAILABLE`, `ERROR` directly on cards.
- [ ] No large Program/Preview panels.
- [ ] Clicking a normal resource sends it to Preview.
- [ ] Clicking a Title resource safely selects preset then sends the Lower to Preview.
- [ ] Keep cards fixed in CONTROL; reorder only in CONFIGURE.
- [ ] Support desktop and tablet widths with strong focus/keyboard states.

**Gate:** in Mock mode the operator can identify and send any resource to Preview with one clear click.

## Phase 5 — Emulator and automated verification

- [ ] Provide a standalone local vMix HTTP emulator for development (`/api`, `PreviewInput`, `SelectTitlePreset`).
- [ ] Make emulator responses CORS-compatible so the production transport can be exercised.
- [ ] Add automated tests for parser, safety graph, CSV parsing, persistence and command sequencing.
- [ ] Add integration tests against the emulator.
- [ ] Test disconnect/reconnect, HTTP 500, delayed state propagation and stale GUIDs.

**Gate:** all automated tests pass and the real HTTP client works against the local emulator.

## Phase 6 — UI/quality pass

- [ ] Responsive layout verification at common desktop/tablet widths.
- [ ] Keyboard navigation and accessible status text (not color-only).
- [ ] Empty/loading/error states.
- [ ] Prevent accidental duplicate actions.
- [ ] Ensure no runtime CDN dependency is required.
- [ ] Ensure the page remains usable if `localStorage` fails.

**Gate:** no blocking usability defects in CONFIGURE or CONTROL under mock/emulator scenarios.

## Phase 7 — GitHub Pages readiness

- [ ] Keep production assets static and relative-path safe for `/PIBvMix/`.
- [ ] Add `.nojekyll`.
- [ ] Document GitHub Pages enablement from the `main` branch root.
- [ ] Document vMix settings and 30-minute venue validation checklist.

**Gate:** repository root can be served directly as a static site.

## Phase 8 — Real vMix venue validation (only step requiring real vMix)

Use the final 30-minute venue window in this order:

1. Enable/check vMix Web Controller on port 8088; keep LAN-only enabled; disable enhanced Web/TCP API security; blank password for v1.
2. Open PIBvMix in current Chrome/Edge and grant Local Network Access.
3. Connect using private LAN IP and confirm vMix version, production name and input count.
4. Send one harmless normal input to Preview and verify state.
5. Export/import one real Title Preset CSV; verify zero-based preset mapping with one off-air Lower.
6. Verify exact Title value matching and one-click Preview.
7. Verify an on-air/nested Lower is blocked.
8. Import/select the final production resources and order them.
9. Export a JSON backup of the finished PIBvMix configuration.

If direct GitHub Pages → vMix HTTP is blocked by the venue browser/network policy despite correct vMix settings, use the already-isolated transport layer to switch to the documented local-host fallback without redesigning the UI.

---

## Definition of done for this development pass

Everything through **Phase 7** is implemented and tested without real vMix. Phase 8 remains a short real-environment validation, not primary development.
