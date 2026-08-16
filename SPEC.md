# PIBvMix — v2 Product & Technical Specification

Status: **Reviewed implementation specification**  
Target: **v1 application**  
Specification version: **2**  
Repository: `Parau/PIBvMix`  
Review date: **2026-08-16**

## 1. Purpose

PIBvMix is a small, static browser application for vMix operators.

Its purpose is to remove the need to browse the vMix interface or use the Title/Lower right-click preset menu when preparing the next resource for Preview.

The defining live workflow is:

> **See what is on air → see what is in Preview → find the next resource → click once.**

PIBvMix is deliberately not a replacement for the full vMix Web Controller. It is a focused resource picker optimized for fast, low-risk live operation.

---

## 2. Feasibility conclusion

The project is **feasible** as a client-only application, with one environment constraint that must be tested early on real vMix hardware/software.

The vMix HTTP Web API provides everything needed for the core workflow:

- complete current state as XML through `GET /api`;
- stable input GUIDs through each input's `key` attribute;
- Program/Active and Preview state;
- active Overlay state;
- nested input/layer relationships;
- current Title text fields and, for GT titles, image/color fields where exposed;
- `PreviewInput`;
- `SelectTitlePreset`;
- HTTP 200 on API success and HTTP 500 on API error.

The main limitation is that **the public vMix API does not expose the full list/content of Title Presets**. The current XML exposes the current Title values, not every stored preset. This is still reported as a limitation in recent vMix ecosystem discussions.

PIBvMix therefore uses the officially supported **Title Preset CSV export** as the source of the preset list. This is not a workaround that depends on the undocumented `.vmix` production format.

The second constraint is browser security. GitHub Pages is HTTPS and vMix normally serves its Web API over HTTP on the local LAN. Current Chromium browsers implement Local Network Access (LNA): a secure public page may access a local HTTP address after the user grants local-network permission. A private IP literal such as `192.168.x.x` or a `.local` hostname is the preferred target form.

### v1 supported environment

The initial supported environment is:

- current vMix, with vMix 29 as the primary integration target;
- vMix Web Controller/API enabled;
- Web Controller **Restrict access to LAN only** kept enabled;
- **Enable enhanced security on Web and TCP API** disabled, because vMix documents that this setting can prevent browser scripts from accessing the APIs;
- Web Controller password blank for v1;
- current Chrome or Edge/Chromium with Local Network Access support;
- vMix address preferably supplied as a private IPv4 literal such as `192.168.1.50`;
- GitHub Pages as the primary deployment.

Firefox/Safari and password-protected cross-origin vMix access are not v1 compatibility targets until tested.

### Contingency if GitHub Pages → LAN is blocked

The application must keep the vMix transport behind a small client interface so the same UI can later use either:

1. the normal direct browser HTTP transport; or
2. an optional local static/bridge deployment if a target browser/network policy blocks direct GitHub Pages access.

A bridge is **not** required by the current design and must not be introduced before the direct path is tested on real vMix.

---

## 3. Evidence and implementation lessons from existing projects

The design was reviewed against current vMix documentation and established open-source vMix integrations.

### 3.1 Bitfocus Companion vMix module

Repository: `bitfocus/companion-module-studiocoast-vmix`

Relevant implementation lessons:

- treats input `key`/GUID and input number as different pieces of state;
- parses input types, titles, text values, GT image/color values, nested input layers, top-level overlays, Program and Preview;
- models each nested layer using the child input GUID;
- uses regular state polling alongside a persistent/native connection;
- exposes polling interval as a performance/responsiveness trade-off.

PIBvMix should follow the same normalized-state principle, but cannot use raw TCP from a GitHub Pages browser. HTTP polling is therefore the correct browser transport for v1.

### 3.2 vMixUTC

Repository: `elgarf/vMixUTC`

Relevant implementation lessons:

- avoids duplicate simultaneous state requests;
- reuses state responses for callers waiting on the same request;
- handles request cancellation and connection failures explicitly;
- adapts request frequency/cache behavior instead of allowing requests to accumulate.

PIBvMix should implement a **single-flight state poller**: never start another `/api` state fetch while the previous one is still pending.

### 3.3 vmix-js-utils

Repository: `jensstigaard/vmix-js-utils`

The project explicitly supports vMix XML API parsing from frontend/browser applications as well as Node applications. This supports PIBvMix's client-only XML parsing architecture.

PIBvMix does not need the full package for v1; native `DOMParser` is sufficient for the subset of XML state we use. The normalized model should remain isolated so a parser library can be adopted later if needed.

### 3.4 General conclusion from existing controllers

Mature vMix controllers consistently separate:

```text
transport → parser → normalized vMix state → actions/feedback → UI
```

PIBvMix should do the same rather than allowing UI components to parse XML or build API URLs directly.

---

## 4. Deployment and source architecture

PIBvMix runs as static files from GitHub Pages.

Recommended implementation:

- framework-free HTML/CSS/JavaScript ES modules;
- Vite only as build/development tooling if useful;
- no runtime backend;
- no cloud database;
- no user account;
- all operator configuration stored locally in the browser;
- robust CSV parser bundled with the application rather than loaded from a third-party CDN.

If Vite is used, its GitHub Pages base path must be `/PIBvMix/`.

Suggested module structure:

```text
index.html
src/
  app.js
  state/
    store.js
  vmix/
    client.js
    parser.js
    poller.js
    safety.js
    resolver.js
  config/
    storage.js
    csv.js
    backup.js
  ui/
    configure.js
    control.js
  styles/
    app.css
tests/
  fixtures/
    vmix-state-*.xml
    title-presets-*.csv
```

The exact file layout may change, but the module boundaries are normative.

---

## 5. Primary application modes

PIBvMix is one single-page application with two logical views:

```text
CONFIGURE  <->  CONTROL
```

Both views use one shared application state and one persisted configuration.

### 5.1 CONFIGURE

Used to:

- configure/connect to vMix;
- discover inputs from the currently loaded vMix production;
- select normal inputs;
- identify Title/Lower candidates;
- associate a Title/Lower with its exported Title Preset CSV;
- preview parsed CSV rows before accepting them;
- choose which preset rows should appear in CONTROL;
- generate or customize labels;
- reorder selected resources;
- remove resources;
- detect/repair stale GUIDs;
- import/export PIBvMix configuration.

### 5.2 CONTROL

Used during live operation.

CONTROL must contain only the information/actions needed to safely choose Preview:

- connection state;
- current Program/On-Air state;
- current Preview state;
- large ordered resource buttons;
- ON AIR/blocked indication for Title resources whose underlying Title cannot safely be changed;
- a compact Configure action.

No drag handles, delete actions, checkboxes, text editing, CSV controls, or per-row menus appear in CONTROL.

---

## 6. Connection implementation

### 6.1 Address input

Accept at least:

```text
192.168.1.50
192.168.1.50:8088
http://192.168.1.50:8088
studio-pc.local
studio-pc.local:8088
```

Normalization rules:

1. trim whitespace;
2. if scheme is absent, use `http://`;
3. if port is absent, use `8088`;
4. discard a trailing `/api` when storing the base target, then construct API paths centrally;
5. never concatenate unescaped query values manually;
6. use `URL` and `URLSearchParams` for commands.

Store the last successful target only after a valid vMix XML response.

### 6.2 Preferred host form

For GitHub Pages, prefer:

- RFC1918 private IPv4 literal; or
- `.local` hostname.

Current Chromium can recognize these as local targets before DNS resolution, which allows LNA-granted requests to receive the local mixed-content exemption.

For an arbitrary hostname that resolves to a private address, the transport may add `targetAddressSpace: "local"` where supported.

### 6.3 Fetch policy

State and command requests should use approximately:

```js
fetch(url, {
  method: 'GET',
  mode: 'cors',
  credentials: 'omit',
  cache: 'no-store',
  signal
})
```

`targetAddressSpace: "local"` may be added when required/supported.

Do not add unnecessary custom headers because they may cause additional CORS/preflight behavior.

### 6.4 Password policy

v1 assumes the vMix Web Controller password is blank.

Reason: cross-origin credentialed requests introduce additional browser/CORS requirements, while vMix explicitly documents that a blank password requires no login. Password authentication can be a later feature after real browser testing.

### 6.5 Connection states

Model at least:

```text
idle
connecting
permission-required/permission-denied (when detectable)
connected
degraded
disconnected
invalid-response
```

The browser Permissions API may be queried for `local-network` when supported, but connection logic must not depend on that experimental API. The actual fetch remains authoritative.

### 6.6 Connection diagnostics

When connection fails, CONFIGURE should provide concise troubleshooting:

1. verify vMix is running;
2. verify the address/port;
3. verify both computers are on the same LAN;
4. grant the browser Local Network Access permission;
5. verify vMix Web Controller is enabled;
6. disable vMix **enhanced Web/TCP API security**;
7. verify Windows Firewall permits vMix Web Controller port 8088;
8. keep `Restrict access to LAN only` enabled;
9. for v1, verify the Web Controller password is blank.

Provide an **Open vMix Web Controller** link to `http://<target>:8088/` as a diagnostic aid.

---

## 7. vMix transport interface

The UI must not call `fetch()` directly.

Define a small transport contract such as:

```text
VmixClient
  fetchState()
  command(functionName, params)
  testConnection()
```

Responsibilities of `VmixClient`:

- URL construction;
- timeouts using `AbortController`;
- `response.ok` checking;
- HTTP 200/500 handling;
- CORS/LNA/network error classification where possible;
- no application-state interpretation.

Suggested LAN timeout:

- state request: approximately 2 seconds;
- command request: approximately 2 seconds.

These values should be constants and tuned during real integration tests.

---

## 8. State polling

### 8.1 Why polling

Raw vMix TCP is not available to ordinary browser JavaScript. The public HTTP API exposes full state, so polling is the appropriate v1 mechanism.

### 8.2 Single-flight rule

Only one state request may be in flight at a time.

If multiple callers need fresh state while a request is pending, they await/reuse the same promise rather than starting another request.

This follows the proven anti-request-buildup pattern used by established vMix controllers.

### 8.3 Initial polling values

Recommended starting values:

- visible CONTROL: **500 ms**;
- CONFIGURE or hidden tab: **1000–1500 ms**;
- immediate `refreshNow()` before a safety-critical Title action when cached state is older than approximately 500–750 ms;
- retry/backoff after repeated network failures, capped around 5 seconds.

Bitfocus Companion supports considerably faster polling, but PIBvMix does not need 100–250 ms feedback for this workflow. The final interval must be measured on real vMix.

### 8.4 Failure handling

- one failed poll: retain last state but mark connection degraded;
- repeated failures: transition to disconnected;
- while disconnected, all executable CONTROL buttons are disabled;
- reconnection automatically refreshes state and reconciles saved GUIDs.

Never queue a backlog of missed polls.

---

## 9. XML parsing and normalized state

Use browser `DOMParser` to parse `GET /api` XML.

Reject the response as invalid if the expected `<vmix>` root or essential state elements are absent.

### 9.1 Important vMix identity rule

The API exposes:

- inputs with both `number` and stable `key`/GUID;
- top-level `active`, `preview`, and overlays primarily by **input number**.

Therefore every fresh state parse must build both maps:

```text
inputByKey
inputKeyByNumber
```

Then translate Program/Preview/Overlay input numbers to GUIDs in the normalized state.

Never persist input number as the canonical identity.

### 9.2 Normalized state shape

Conceptually:

```json
{
  "version": "29.x",
  "edition": "...",
  "presetName": "...",
  "inputs": [],
  "inputByKey": {},
  "inputKeyByNumber": {},
  "mainMix": {
    "programNumber": 2,
    "programKey": "guid-2",
    "previewNumber": 1,
    "previewKey": "guid-1"
  },
  "overlays": [],
  "additionalMixes": []
}
```

Each normalized input retains at least:

```text
key/GUID
number
type
title
shortTitle if available
state
text fields [{index,name,value}]
GT image fields where exposed
GT color fields where exposed
nested layers [{index,key}]
```

### 9.3 Do not misuse `selectedIndex`

The XML `selectedIndex` attribute must **not** be interpreted as the current Title Preset index.

vMix documents `SelectedIndex` as a generic input parameter and, for Titles, as selecting a Title text item. The public API does not document it as the selected Title Preset.

PIBvMix Title Preset identity must therefore be derived from imported CSV data + current Title field values where possible, never from `selectedIndex`.

---

## 10. Input discovery and classification

CONFIGURE displays all current inputs.

A Title/Lower candidate should be recognized using a combination of:

- vMix input type such as `GT` or `Xaml`;
- presence of editable Title fields (`text`, and where relevant GT image/color fields).

Do not rely on one hard-coded type string alone.

Search/filter options:

```text
All | Titles | Other Inputs | Selected | Unavailable
```

Search should match title/shortTitle and optionally input number for operator convenience.

---

## 11. Resource model

PIBvMix exposes two primary CONTROL resource types.

### 11.1 Normal input

Conceptual persisted form:

```json
{
  "id": "resource-uuid",
  "type": "input",
  "label": "Camera 1",
  "inputKey": "vmix-guid"
}
```

Execution:

```text
PreviewInput(Input=<GUID>, Mix=0)
```

### 11.2 Title preset resource

Conceptual persisted form:

```json
{
  "id": "resource-uuid",
  "type": "titlePreset",
  "label": "John Smith — CEO",
  "inputKey": "vmix-title-guid",
  "presetIndex": 4,
  "csvRow": ["John Smith", "CEO"],
  "csvRowHash": "...",
  "verification": {
    "mode": "positionalText",
    "fieldNames": ["Name.Text", "Role.Text"]
  }
}
```

Important change from spec v1: **do not assume the CSV contains named columns**. Preserve the row as ordered cells. Named field mapping is optional metadata established only when it can be validated.

Execution:

```text
SelectTitlePreset(Input=<GUID>, Value=<presetIndex>)
then
PreviewInput(Input=<GUID>, Mix=0)
```

---

## 12. Title Preset CSV import

### 12.1 Source of truth

vMix officially supports importing/exporting Title Presets in CSV format.

Because the public API does not enumerate all Title Presets, the exported CSV is PIBvMix's supported preset-list source for v1.

Do not parse `.vmix` production files and do not depend on undocumented Web Controller internal endpoints.

### 12.2 Client-only file handling

Use a standard browser file picker/drop target and `File.text()`.

The CSV never leaves the browser.

After import, store the parsed information in PIBvMix configuration so the source file no longer needs to remain available.

### 12.3 CSV parser requirement

Do **not** parse CSV using `split(',')` or line splitting.

Use a tested RFC4180-style parser, bundled into the application, that correctly handles at least:

- commas inside quoted values;
- escaped/doubled quotes;
- CRLF and LF line endings;
- UTF-8 BOM;
- empty cells;
- quoted multiline cells on PIBvMix's side.

vMix itself may normalize or have limitations with certain embedded line breaks; PIBvMix should preserve the imported value and warn only when a real incompatibility is observed.

A bundled dependency such as Papa Parse is acceptable; do not depend on a runtime CDN.

### 12.4 No implicit header row

Treat the first non-empty CSV row as preset data by default.

Do not silently discard a row as a header because vMix Title Preset exports are not documented as a header-based schema.

### 12.5 Preset index mapping

Preserve CSV row order exactly.

Working mapping:

```text
CSV row 1 → preset index 0
CSV row 2 → preset index 1
CSV row N → preset index N-1
```

The vMix Shortcut reference says `SelectTitlePreset` takes a Preset Index. Community testing confirms zero-based indexing. This must still be covered by a real vMix integration test before release.

### 12.6 Import preview UI

Before accepting an import, display:

```text
Title: LowerThird.gtzip
File: speakers.csv
27 preset rows found

0  John Smith       CEO
1  Maria Silva      CFO
2  Breaking News
...
```

The operator must explicitly confirm that the CSV belongs to that Title input.

### 12.7 Select which presets become resources

Importing a CSV does not force every row into CONTROL.

Provide:

- Select all / none;
- search rows;
- per-row inclusion toggle;
- generated label preview.

### 12.8 Label generation

Default label strategy:

1. take the first useful non-empty text-like cell;
2. optionally combine it with the next useful cell using ` — `;
3. trim whitespace;
4. if the result is empty, fall back to `Preset N`.

CONFIGURE should allow choosing which CSV columns form labels and allow each final label to be manually renamed.

Custom labels do not alter preset mapping.

### 12.9 CSV metadata and drift detection

Store metadata such as:

```text
fileName
importedAt
rowCount
SHA-256 of source text where available
```

The browser can calculate SHA-256 through Web Crypto.

The hash does not prove that vMix still has the same preset list; it identifies exactly which CSV version PIBvMix imported.

If the operator changes/reorders presets in vMix later, PIBvMix cannot discover the complete changed list from `/api`. CONFIGURE must therefore clearly offer **Re-import CSV / Resync presets**.

---

## 13. Title field mapping and preset verification

This is a safety improvement over v1.

### 13.1 Why verification matters

`SelectTitlePreset` selects by numeric index. If the vMix preset list has been reordered after PIBvMix imported its CSV, an old `presetIndex` could select the wrong person/title.

HTTP 200 confirms that vMix accepted the command; it does not by itself prove the selected preset still contains the expected values.

### 13.2 Verification modes

Each imported Title source has one of these modes:

```text
verifiedFields
indexOnly
```

#### verifiedFields

Use when PIBvMix has a trustworthy mapping between CSV cells and Title fields exposed by `/api`.

Initial mapping can be attempted by position against the ordered vMix Title text fields, but it becomes trusted only when actual vMix state successfully matches the expected row.

#### indexOnly

Use when the CSV cannot be reliably mapped to exposed Title fields.

The preset can still be selected by index, but PIBvMix cannot independently prove the content or uniquely identify the current preset. The UI must not claim otherwise.

### 13.3 Post-selection verification

For `verifiedFields` resources:

1. call `SelectTitlePreset`;
2. require HTTP success;
3. refresh `/api`;
4. compare relevant current Title fields to expected CSV values;
5. allow a few short retries because state propagation may not be visible in the immediately following poll;
6. only then call `PreviewInput`.

If the values do not match within the verification window:

- **do not send the Title to Preview**;
- show `Preset mismatch — re-import CSV`;
- keep the underlying Title unlocked after the command flow exits;
- mark that imported source as needing resynchronization.

For `indexOnly`, command success + preset index is the available contract; the UI should show a small configuration warning that content verification is unavailable.

---

## 14. Determining the currently displayed Title preset

Several PIBvMix resources may share one Title input GUID.

Therefore:

```text
Preview GUID == Lower GUID
```

is not enough to identify which preset button should be highlighted.

Resolve exact Title resource identity only when current vMix Title fields uniquely match one imported resource row using a validated mapping.

Outcomes:

- exactly one match → show that resource label;
- no match → show `<Lower name> — custom/unknown preset`;
- multiple matches → show `<Lower name> — preset ambiguous`.

`lastCommandedResourceId` may be kept as transient UX information but must never override current vMix state, because an operator can change Titles directly in vMix outside PIBvMix.

---

## 15. Program, Preview and Overlay display

CONTROL must make three concepts visually clear:

1. **PROGRAM** — main vMix Active input;
2. **PREVIEW** — main vMix Preview input;
3. **ON AIR Titles/Overlays** relevant to configured resources.

Example:

```text
● Connected
PROGRAM  Camera 1
PREVIEW  John Smith — CEO
ON AIR   Event Logo
                                      Configure
```

If a configured Title is on-air only because it is nested inside the Program input, its resource buttons still show `ON AIR` even if the compact header names the root Program input.

State styling must use text/icon/border as well as color; do not rely on color alone.

---

## 16. ON AIR safety graph

Changing a Title preset modifies the underlying Title input. That Title may be visible even when it is not itself the root Program input.

### 16.1 Dependency graph

Build a directed graph from normalized input layers:

```text
parent input GUID → child layer input GUID
```

### 16.2 On-air roots

For the v1 main-mix workflow, roots are at least:

- main Program/Active input;
- every active top-level Overlay input reported by `/api`.

### 16.3 Transitive traversal

From every on-air root, recursively traverse child layers.

Use a `visited` set to avoid loops/cycles.

The result is:

```text
onAirInputKeys = root inputs + all nested descendants
```

### 16.4 Blocking rule

If a Title resource's `inputKey` is in `onAirInputKeys`:

- block all preset resources sharing that Title input;
- display `ON AIR` on those buttons;
- do not call `SelectTitlePreset`;
- do not show a confirmation modal because the operation is simply unavailable.

### 16.5 Additional Mix limitation

The API can represent additional Mix inputs. PIBvMix v1 primarily controls `Mix=0` (main mix).

During implementation, parse additional mix state when present. The safety engine should be written so additional Program roots can be included later or enabled by default after real-world validation.

The initial release documentation must not claim protection against every possible custom external-output routing that vMix can be configured to produce. The guaranteed v1 safety scope is the main mix plus the active overlay/layer dependency data visible in `/api`.

---

## 17. Command execution

### 17.1 Generic command builder

Construct commands through `URL` + `URLSearchParams`.

Example conceptual request:

```text
/api/?Function=PreviewInput&Input=<GUID>&Mix=0
```

Always URL-encode parameters.

### 17.2 Normal input click

```text
click
  → require connected state
  → acquire lock for resource/input if needed
  → PreviewInput(Input=<GUID>, Mix=0)
  → require HTTP 200
  → refresh/wait for state where main Preview GUID == target GUID
  → show Preview success
  → release lock
```

A normal input may be on Program and still be selectable for Preview because the action does not mutate its content. It may be visually marked `PROGRAM` but does not require Title-style blocking.

### 17.3 Title preset click

```text
click
  → require connected state
  → refresh state if safety snapshot is stale
  → test target Title against on-air dependency graph
  → if ON AIR: block and exit
  → acquire per-Title-input lock
  → SelectTitlePreset(Input=<GUID>, Value=<presetIndex>)
  → require HTTP 200
  → if verifiedFields: refresh and verify selected field values
       → mismatch: stop; DO NOT Preview
  → recheck on-air state if the sequence has taken long enough for state to change
  → PreviewInput(Input=<GUID>, Mix=0)
  → require HTTP 200
  → poll/refresh until main Preview GUID == target GUID or timeout
  → show Preview state
  → release lock in finally
```

### 17.4 Why the second on-air check is allowed

The state can change between the first safety check and the Preview command. For a short LAN flow this window is tiny, but after preset verification/retries PIBvMix may optionally refresh/recheck before Preview. The target preset has already been changed at that point, so the most important protection remains the first check before `SelectTitlePreset`.

### 17.5 Per-input serialization

All preset buttons sharing one Title GUID use the same command mutex/queue.

While locked:

- sibling preset buttons become temporarily non-interactive;
- rapid double-clicks do not interleave preset selection and Preview commands.

Do not use one global lock for unrelated normal inputs unless testing shows vMix requires it.

---

## 18. Command feedback

Button/runtime states include:

```text
Ready
Sending…
Preview
Program
On Air / blocked
Unavailable
Preset mismatch
Error
```

Rules:

- use lightweight inline feedback, not modal confirmation;
- a click may immediately show `Sending…`;
- do not show `Preview` as success until confirmed by subsequent state;
- network/API errors must restore the button to a safe state;
- errors should be visible near the header and/or affected button, then remain discoverable without covering the list.

---

## 19. CONTROL UI requirements

The live page is designed for fast scanning and reliable clicking.

### 19.1 Header

Compact persistent header:

```text
● Connected
PROGRAM: Camera 1
PREVIEW: John Smith — CEO                Configure
```

If useful, active configured overlay/title information can appear as compact chips or a second line without dominating the page.

### 19.2 Resource buttons

- full-row click target;
- minimum touch/click height around 48–56 px;
- readable at normal desktop distance;
- preserve configured order;
- clearly show Preview / Program / ON AIR state;
- disabled state must still keep the label readable;
- no tiny action icons inside the row.

### 19.3 Startup

On CONTROL startup/reload:

```text
Loading vMix state…
```

All resource actions remain disabled until the first valid `/api` snapshot has been parsed and safety state computed.

### 19.4 Disconnected state

Show a prominent but non-modal connection banner and disable all commands.

Never allow stale state to be used indefinitely for a Title mutation.

---

## 20. CONFIGURE UI requirements

Suggested flow:

```text
1. Connection
2. Available vMix inputs
3. Title CSV association / preset selection
4. Selected resources
5. CONTROL
```

### 20.1 Connection card

Contains:

- vMix address;
- Connect/Test;
- connection result;
- compact first-run setup/help;
- Open vMix Web Controller diagnostic link.

Once configured, help can collapse to reduce clutter.

### 20.2 Input browser

Contains:

- search;
- filters;
- input name;
- input number as secondary information;
- input type;
- selected/unavailable status;
- `Import Presets CSV` for Title candidates.

### 20.3 Selected resources panel

Contains only selected resources and configuration actions:

- drag handle;
- label;
- underlying input name/type;
- rename;
- remove;
- unavailable/resync warning where applicable.

### 20.4 Reordering

Reordering happens only in CONFIGURE.

Use either:

- a tested pointer/touch-friendly sortable library bundled with the app (for example SortableJS), or
- a tested Pointer Events implementation.

Do not rely solely on the legacy HTML5 desktop drag API if tablet/touch use is expected.

Provide keyboard-accessible Move Up / Move Down actions in CONFIGURE even if drag-and-drop is the primary UI.

Persist the new order after drop, not continuously on every pointer movement.

---

## 21. Stale-resource and production-change handling

Saved configuration can outlive the vMix production from which it was created.

On each valid connection/reconnect:

- reconcile saved GUIDs against current `inputByKey`;
- never silently substitute another input based only on name or number;
- mark missing GUID resources `Unavailable`;
- keep them in CONFIGURE so they can be repaired or removed;
- disable them in CONTROL.

Store the current vMix preset/production name from `/api` when available.

If the production name changes or many saved GUIDs disappear, show a non-blocking message:

```text
vMix production changed — review unavailable resources
```

Do not invalidate resources whose GUIDs still exist.

---

## 22. Local persistence

### 22.1 Key namespace

`localStorage` is scoped to the whole GitHub Pages origin, not the `/PIBvMix/` path.

Use a namespaced/versioned key such as:

```text
pibvmix:v2:config
```

### 22.2 Schema

Conceptual schema:

```json
{
  "schemaVersion": 2,
  "vmix": {
    "target": "http://192.168.1.50:8088",
    "lastPresetName": "Studio Production"
  },
  "titleSources": [
    {
      "inputKey": "title-guid",
      "inputLabelAtImport": "LowerThird.gtzip",
      "csv": {
        "fileName": "speakers.csv",
        "importedAt": "2026-08-16T00:00:00.000Z",
        "rowCount": 27,
        "sha256": "..."
      },
      "verificationMode": "verifiedFields"
    }
  ],
  "resources": [
    {
      "id": "...",
      "type": "input",
      "label": "Camera 1",
      "inputKey": "..."
    },
    {
      "id": "...",
      "type": "titlePreset",
      "label": "John Smith — CEO",
      "inputKey": "...",
      "presetIndex": 4,
      "csvRow": ["John Smith", "CEO"],
      "csvRowHash": "..."
    }
  ]
}
```

Exact fields may evolve during implementation, but `schemaVersion`, stable resource `id`, GUID identity, ordered resource array, and CSV row/index preservation are required.

### 22.3 Storage errors

Every localStorage load/write must be wrapped for exceptions.

If persistence is unavailable or quota is exceeded:

- keep the current in-memory session usable;
- show a persistent warning that configuration will not survive reload;
- offer JSON export immediately.

### 22.4 Save strategy

Save after discrete configuration changes and debounce rapid text/ordering edits briefly. `localStorage` is synchronous, so avoid unnecessary writes during pointer movement.

---

## 23. Configuration backup

v1 includes:

- **Export PIBvMix Configuration** → JSON;
- **Import PIBvMix Configuration** ← JSON.

Export includes:

- schema version;
- vMix target;
- resource order;
- labels;
- input GUID mappings;
- Title preset indices;
- imported CSV rows/metadata needed by the selected resources;
- verification metadata.

Do not export passwords or browser permission state.

Import must:

1. parse JSON safely;
2. validate `schemaVersion`;
3. validate expected field types;
4. reject clearly malformed/oversized data;
5. preview what will be replaced before committing;
6. reconcile GUIDs on the next vMix connection.

---

## 24. Resource limits and defensive bounds

PIBvMix is not intended for unbounded data ingestion.

Initial defensive limits can be generous, for example:

- CSV file size around 1 MB;
- up to about 1,000 preset rows per imported Title;
- graceful warning before storing very large configurations.

These are implementation safeguards, not product limits, and may be raised after testing.

---

## 25. Browser/LAN security behavior

### 25.1 Current Chromium model

GitHub Pages is a secure public origin. Current Chromium gates public-site access to local/loopback targets behind Local Network Access permission.

After permission is granted, Chromium relaxes mixed-content blocking for recognized local targets. A private IP literal and `.local` name are recognized without DNS ambiguity; `targetAddressSpace: "local"` can annotate other hostnames where supported.

### 25.2 vMix-side browser security

vMix documents that **Enable enhanced security on Web and TCP API** can prevent a browser from running scripts that access those APIs. PIBvMix first-run instructions must explicitly call this out.

Keep **Restrict access to LAN only** enabled. PIBvMix does not require vMix to be exposed to the internet.

### 25.3 CORS validation gate

Historical vMix Web Controller releases added permissive cross-origin support for custom web controllers, and custom browser controllers exist in the vMix ecosystem. Nevertheless, current vMix 29 response headers must be verified during Phase 0/1.

The feasibility spike is successful only when the actual target browser can:

1. fetch `/api` from the GitHub Pages origin;
2. read the XML response;
3. send a harmless API command;
4. observe the resulting state.

If current vMix/browser policy prevents this despite correct settings, switch only the transport/deployment layer; do not redesign the resource/configuration UI.

---

## 26. Mock development without vMix

Most development can proceed without a live vMix instance if the transport is abstracted.

Implement `MockVmixClient` with fixture states covering:

- normal inputs;
- GT/XAML Title;
- multiple preset resources sharing a Title GUID;
- main Program and Preview;
- active top-level Overlay;
- Title nested one level under Program;
- Title nested multiple levels deep;
- cyclic/invalid layer graph for defensive testing;
- stale GUID;
- delayed API state update;
- HTTP 500 command;
- connection timeout;
- CSV/preset mismatch.

Mock commands should mutate mock state in the same conceptual sequence as vMix:

```text
SelectTitlePreset → Title fields change
PreviewInput → Preview number changes
```

This allows UI and safety logic to be tested before Trial access is available.

---

## 27. Automated tests

At minimum unit-test:

### XML parser

- GUID/number maps;
- Program/Preview translation;
- empty inputs;
- top-level overlays;
- nested layer keys;
- Title text fields;
- GT image/color fields when present;
- additional mix elements when present.

### Safety graph

- direct Program Title;
- direct overlay Title;
- nested Title;
- deeply nested Title;
- unrelated Title;
- cycles;
- missing child GUID.

### CSV parser

- commas in quoted fields;
- escaped quotes;
- CRLF/LF;
- BOM;
- empty cells;
- multiline fields;
- empty trailing rows;
- row order preserved.

### Preset verification

- unique match;
- no match;
- duplicate/ambiguous rows;
- delayed state update;
- stale CSV mismatch prevents Preview.

### Command scheduler

- same-Title rapid clicks serialize;
- lock released after failure;
- unrelated input commands are not permanently blocked.

### Storage

- schema v2 round trip;
- corrupted JSON;
- missing fields;
- import validation;
- unavailable localStorage.

---

## 28. Real vMix integration test matrix

Before declaring v1 complete, test on a real current vMix installation from the deployed GitHub Pages URL.

### Connection

- private LAN IPv4;
- default port 8088;
- Chromium LNA prompt accepted;
- LNA denied then re-enabled;
- enhanced security on → useful diagnostic;
- enhanced security off → success;
- vMix stopped/restarted;
- wrong IP/port;
- firewall block.

### State

- normal input list;
- input reorder/renumber;
- loaded production changed;
- Preview and Program updates from outside PIBvMix;
- Overlay toggled from outside PIBvMix;
- nested layers.

### Commands

- Preview normal input;
- HTTP failure;
- rapid click behavior;
- external operator changes Preview between PIBvMix polls.

### Titles

- GT Title;
- XAML Title if relevant to production;
- exported preset CSV;
- verify zero-based index;
- several presets with same Lower;
- duplicate text values;
- CSV reordered after PIBvMix import;
- Title changed manually in vMix;
- Title already in Preview;
- Title directly on Program;
- Title active as Overlay;
- Title nested inside an on-air input.

---

## 29. Recommended implementation phases

### Phase 0 — Test harness

- create module skeleton;
- `VmixClient` interface;
- `MockVmixClient`;
- official/sample XML fixtures;
- parser tests.

### Phase 1 — Browser/vMix feasibility spike

Build the smallest deployable GitHub Pages page that:

1. accepts the vMix address;
2. fetches `/api`;
3. parses version + input list + Program/Preview;
4. displays inputs;
5. sends one normal input using `PreviewInput(..., Mix=0)`;
6. confirms Preview changed by reading `/api` again.

This phase validates the only major external architecture risk.

**Do this against real vMix before investing heavily in final UI polish.**

### Phase 2 — Core CONFIGURE/CONTROL

- normalized store;
- connection diagnostics;
- polling/reconnect;
- normal resource selection;
- localStorage v2;
- reorder;
- Program/Preview display;
- stale GUID handling.

### Phase 3 — Title CSV workflow

- robust CSV parsing;
- import preview;
- row selection;
- label generation;
- persistent CSV metadata;
- `SelectTitlePreset`;
- per-input command lock.

### Phase 4 — Verification and live safety

- field matching;
- post-SelectTitlePreset verification;
- dependency graph;
- recursive ON AIR protection;
- exact/ambiguous Title display;
- mismatch blocking.

### Phase 5 — Backup and UX polish

- JSON import/export;
- first-run help;
- responsive/touch-friendly layout;
- keyboard reordering support;
- accessibility states;
- error/reconnect polish.

---

## 30. Functional acceptance criteria

v1 is complete when all of the following are true.

### Deployment and connection

1. PIBvMix is served from GitHub Pages with no application backend.
2. A supported Chromium browser can connect from that page to a real vMix LAN API after required permission/settings.
3. Connection errors provide actionable diagnostics.
4. No overlapping `/api` polling requests accumulate.

### Discovery/configuration

5. Current vMix inputs are listed from XML.
6. GUID is the canonical persisted input identity.
7. Input renumbering does not break a resource whose GUID still exists.
8. Missing GUIDs become unavailable rather than being silently remapped.
9. Normal inputs can be selected/deselected.
10. Title candidates can receive an exported vMix Title Preset CSV.
11. CSV import correctly handles quoted commas/quotes and preserves row order.
12. Individual presets can be selected as independent CONTROL resources.
13. Labels can be generated, customized and persisted.
14. Selected resources can be reordered in CONFIGURE.
15. Order survives reload.
16. Configuration can be exported/imported as JSON.

### Live operation

17. CONTROL starts disabled until a valid live state is known.
18. CONTROL clearly shows connection state.
19. CONTROL clearly shows main Program and Preview.
20. Normal input click sends exactly that GUID to main Preview and verifies the resulting state.
21. A Title preset click selects the correct zero-based preset and then sends the Title to Preview.
22. Same-Title rapid clicks cannot interleave commands.
23. A Title directly on Program is blocked from preset mutation.
24. A Title active as a vMix Overlay is blocked.
25. A Title nested inside an on-air input is blocked recursively.
26. Blocked resources visibly indicate `ON AIR`.
27. If current Title values uniquely match one imported preset, PIBvMix displays that exact resource label.
28. If a Title preset cannot be identified uniquely, PIBvMix reports unknown/ambiguous rather than highlighting the wrong resource.
29. When field verification is available, stale/reordered CSV data is detected after `SelectTitlePreset` and PIBvMix refuses to send the mismatched Title to Preview.
30. Successful UI state is based on vMix state verification, not optimistic click state alone.

---

## 31. Explicit v1 non-goals

Keep out of v1 unless a feasibility test forces a change:

- sending sources directly to Program;
- performing transitions/cuts/fades;
- full vMix Web Controller replacement;
- arbitrary title text editing from PIBvMix;
- creating/deleting vMix Title Presets through undocumented interfaces;
- parsing `.vmix` files;
- database/backend;
- user accounts;
- cloud sync;
- exposing vMix outside the LAN;
- raw TCP/WebSocket vMix control from the GitHub Pages app;
- password-authenticated cross-origin Web Controller support;
- authoritative safety analysis of every custom External Output routing configuration;
- automatic reading of arbitrary local files without a user file selection.

---

## 32. Known limitations and their v1 solution

| Limitation | Effect | v1 solution |
| --- | --- | --- |
| `/api` does not enumerate every Title Preset | Cannot build preset list directly from vMix state | Import official vMix Title Preset CSV |
| `SelectTitlePreset` addresses presets by index | Reordered presets can make old config wrong | Preserve row order; store index; verify fields when possible; resync warning |
| XML `selectedIndex` is not a documented preset ID | Cannot use it to highlight a preset | Match current exposed Title values against imported rows |
| Several PIBvMix items share one Title GUID | GUID alone cannot identify exact preset | Field-value resolver; unknown/ambiguous fallback |
| Title can be nested in an on-air composition | Direct Active/Overlay check is insufficient | Build recursive input dependency graph |
| Browser has no raw TCP access | Cannot copy Companion's TCP activator approach | HTTP `/api` polling + API GET commands |
| GitHub Pages HTTPS targets vMix HTTP on LAN | Browser security permission required | Current Chromium LNA + private IP/.local; Phase 1 real test |
| vMix enhanced Web/TCP security may block browser scripts | Direct API calls fail | First-run instructions require disabling that setting while retaining LAN-only restriction |
| Passworded vMix cross-origin auth complicates CORS | Direct browser mode may fail | Blank password is v1 supported configuration |
| localStorage can be cleared | Configuration can be lost | JSON backup/restore |
| Input numbers can change | Numeric mappings become stale | Persist GUID; regenerate number map from each `/api` state |

---

## 33. Research references

### Official vMix documentation

- HTTP Web API: https://www.vmix.com/help29/DeveloperAPI.html
- Shortcut Function Reference: https://www.vmix.com/help29/ShortcutFunctionReference.html
- Web Controller / Security: https://www.vmix.com/help28/WebController.html
- Web Controller Title Editor: https://www.vmix.com/help29/WebControllerTitleEditor.html
- Right-click Title Presets: https://www.vmix.com/help29/RightClickMenus.html
- vMix preset/production files: https://www.vmix.com/help29/PresetsMenu.html
- vMix User Guide (Title Preset CSV import/export): https://www.vmix.com/help29/vMixUserGuide.pdf

### Browser platform

- Chrome Local Network Access: https://developer.chrome.com/blog/local-network-access
- MDN Local Network Access: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access

### Open-source vMix ecosystem reviewed

- Bitfocus Companion vMix module: https://github.com/bitfocus/companion-module-studiocoast-vmix
- vMixUTC: https://github.com/elgarf/vMixUTC
- vmix-js-utils: https://github.com/jensstigaard/vmix-js-utils

### vMix ecosystem limitations used to guide the design

- Title presets not exposed in API discussion: https://forums.vmix.com/posts/m120195findunread-vMix-API--Make-GT-Title-items-presets-visible-in-the-API
- Panel Builder discussion confirming Title preset list is not in XML API: https://forums.vmix.com/posts/t14529-vMix--Panel-Builder--Controller/page33
- SelectTitlePreset zero-based behavior: https://forums.vmix.com/posts/t21968-Bug-or-Feature---SelectTitlePreset

---

## 34. Final design principle

Whenever implementation convenience conflicts with live-operation safety or clarity, choose the behavior that makes CONTROL safer and more deterministic.

The product should never require the operator to remember which Title preset number corresponds to a person, browse a vMix right-click list, or guess whether a Lower is safe to alter.

The PIBvMix v1 experience remains:

> **See what is live. See what is in Preview. Unsafe Lowers are visibly blocked. Find the next item. Click once.**
