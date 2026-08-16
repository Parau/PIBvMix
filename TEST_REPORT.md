# PIBvMix — Test Report

Date: **2026-08-16**

## Automated core/emulator suite

Command:

```bash
npm test
```

Result: **10/10 passing**.

Covered:

- vMix address normalization;
- CSV parsing with quotes, commas, BOM and multiline values;
- recursive ON AIR dependency graph and cycle handling;
- mock `SelectTitlePreset` and `PreviewInput` state mutation;
- preset field verification and stale-preset detection;
- representative mock production structure;
- localStorage failure handling;
- explicit connection failure;
- production `VmixClient` against the HTTP emulator;
- emulator HTTP 200/500 behavior.

## Playwright UI stress test

Result: **12/12 scenarios passing, zero browser/page errors**.

Scenarios exercised in Chromium:

1. Demo mode boots and produces a valid vMix-like production.
2. Preset manager displays the field mapping detected from vMix (`Name.Text`, `Instagram.Text`).
3. CSV values are shown beside the corresponding vMix field names.
4. The CONTROL button label can be renamed independently from the Lower data.
5. CONFIGURE → CONTROL navigation works.
6. `← Edit resources` is visible in CONTROL and returns to the same configuration.
7. A nested ON AIR Lower is disabled.
8. A Title preset changes the Title state and reaches Preview with verification.
9. CONTROL search filters resources correctly.
10. CONTROL → CONFIGURE preserves palette edits.
11. **25 consecutive CONFIGURE/CONTROL round trips** preserve resource count and edited labels.
12. Rapid clicks on resources sharing the same Lower do not leave the UI locked; reopening Presets after the stress cycle preserves the field mapping and edited label.

## Compatibility finding fixed during stress testing

The test Chromium lacked `crypto.randomUUID()`. PIBvMix now has an ID-generation fallback instead of depending rigidly on that browser API.

## Demo Title model

The people Lower now mirrors the common production structure discussed for PIBvMix:

```text
Name.Text       ← CSV column 1
Instagram.Text  ← CSV column 2
```

Example preset:

```text
Name.Text       = John Smith
Instagram.Text  = @johnsmith
Control label   = John Smith   # independently editable
```

## Still requires real vMix

The remaining integration gate cannot be fully emulated:

```text
GitHub Pages HTTPS
      ↓
Chrome / Edge Local Network Access
      ↓
venue LAN
      ↓
real vMix Web API :8088
```

This is reserved for the venue validation checklist in `DEVELOPMENT_PLAN.md`.
