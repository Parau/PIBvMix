# PIBvMix

Fast, browser-based vMix Preview resource picker.

**Event-ready audited build: v0.2.0 (2026-08-16)**  
Published app: <https://criatividade.digital/PIBvMix/>

PIBvMix is a static HTML/CSS/JavaScript application designed around one live-production task: **find the next resource fast and send it to vMix Preview with one click**.

## Current implementation

- CONFIGURE and CONTROL modes
- Direct vMix HTTP Web API client
- Built-in Demo/Mock mode (`?demo=1` or button in CONFIGURE)
- Program / Preview / ON AIR state shown directly on resource cards
- Recursive ON AIR protection for Title/Lower inputs nested in live compositions
- Correct distinction between active overlays and preview-only overlays
- vMix Title Preset CSV import and one resource per preset
- Post-preset field verification when mapping is available
- Ambiguity-safe Title preset resolution (never guesses between identical presets)
- Per-Title command locking
- Search/filter and ordered resource palette
- localStorage persistence
- JSON configuration import/export
- Standalone local vMix HTTP emulator
- Automated core + emulator tests
- Chromium/Playwright navigation and polling stress tests
- Static GitHub Pages-ready deployment

Read [`SPEC.md`](./SPEC.md) and [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md) for the complete design and validation plan.

## Try without vMix

Open the deployed page and click **Use Demo mode**, or add `?demo=1` to the URL. Demo mode uses the exact same UI/state/safety pipeline as the real client.

For local development:

```bash
npm test
npm run emulator
```

The emulator listens on `http://127.0.0.1:8088/api` and implements the v1 subset:

- `GET /api`
- `PreviewInput`
- `SelectTitlePreset`

Serve the page separately with:

```bash
npm run serve
```

## GitHub Pages

Repository settings → **Pages** → deploy from branch → `main` / `/ (root)`.

The project contains `.nojekyll` and uses relative URLs, so no build step is required.

## Real vMix requirements for v1

- vMix Web Controller/API enabled (normally port 8088)
- `Restrict access to LAN only`: keep enabled
- `Enable enhanced security on Web and TCP API`: disabled for browser-script access
- Web Controller password: blank for v1
- current Chrome/Edge with Local Network Access permission granted

Prefer a private IPv4 address such as `192.168.1.50:8088`.

## Venue validation checklist

1. Connect and verify production/input count.
2. Send one harmless normal input to Preview.
3. Export one real Title Preset CSV and import it into PIBvMix.
4. Test one off-air Title preset and verify it reaches Preview correctly.
5. Verify an ON AIR/nested Lower is blocked.
6. Select/order final resources.
7. Export PIBvMix configuration JSON as backup.

The only unvalidated part before access to a real vMix is the exact browser/LAN/vMix integration behavior of the venue environment.
