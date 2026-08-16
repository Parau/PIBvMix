# PIBvMix — v1 Product & Technical Specification

Status: **Initial specification**  
Target: **v1**  
Repository: `Parau/PIBvMix`

## 1. Purpose

PIBvMix is a small, static browser application for vMix operators.

Its purpose is to remove the need to browse the vMix interface or use right-click title-preset menus when preparing a source for Preview.

The target live workflow is deliberately simple:

> **Find resource → click once → resource appears in vMix Preview.**

PIBvMix is not intended to replace the vMix Web Controller. It is a focused resource-picker optimized for fast live operation.

---

## 2. Deployment model

PIBvMix must run as a fully static web application hosted on GitHub Pages.

Required stack:

- HTML
- CSS
- JavaScript
- browser `localStorage`
- vMix HTTP Web API over the local network

No backend, database, login system, cloud service, or server-side component is required for v1.

CSV and JSON configuration files are read locally in the browser and are not uploaded anywhere.

Conceptual architecture:

```text
GitHub Pages (HTTPS)
        |
        | browser requests over LAN
        v
vMix Web Controller / HTTP API
http://<vmix-host>:8088/api
```

---

## 3. Primary application modes

PIBvMix is a single-page application with two logical views:

```text
CONFIGURE  <->  CONTROL
```

The views share one application state and one persisted configuration.

### 3.1 CONFIGURE

Used to:

- connect to vMix;
- discover inputs from the currently loaded vMix production;
- choose which resources PIBvMix exposes;
- associate vMix Title/Lower inputs with exported Title Preset CSV files;
- choose labels;
- remove items;
- reorder items;
- import/export PIBvMix configuration;
- repair unavailable/stale resources.

### 3.2 CONTROL

Used during live operation.

It must be intentionally minimal and optimized for visual scanning and one-click selection.

No drag handles, checkboxes, delete actions, inline editing, or configuration controls should appear next to resource buttons in CONTROL mode.

---

## 4. Connection workflow

### 4.1 Address entry

The connection field should accept forgiving forms such as:

```text
192.168.1.50
192.168.1.50:8088
http://192.168.1.50:8088
```

PIBvMix normalizes the value internally to the vMix API base URL.

The last successful address is persisted locally.

### 4.2 Connection test

CONFIGURE must provide a **Test Connection** / **Connect** action.

A successful connection reads:

```text
GET /api
```

and parses the returned vMix XML state.

The UI should distinguish at least:

- Connecting
- Connected
- Disconnected / unreachable
- Browser/local-network permission problem
- Invalid or unexpected vMix response

### 4.3 Required vMix configuration

First-run help should explain that vMix Web Controller/API access must be enabled.

For v1:

- LAN-only access is acceptable and preferred;
- browser/API access must not be blocked by vMix enhanced API security;
- Web Controller password authentication is out of scope unless required by real-world testing.

---

## 5. Input discovery

When connected, PIBvMix reads all inputs in the production currently loaded in vMix.

The application should retain at least:

- vMix input GUID/key;
- input number when available, for display/debugging only;
- input title/name;
- input type;
- current title fields where exposed;
- nested/layer relationships where exposed by `/api`;
- Active/Program state;
- Preview state;
- Overlay/on-air state.

The vMix GUID/key is the canonical identifier used by PIBvMix whenever possible.

Input number must not be used as the durable identity because input ordering can change.

---

## 6. Configurable resource types

PIBvMix exposes two logical resource types.

### 6.1 Normal input

Examples:

- Camera
- Video
- Image
- Logo
- Any regular vMix input selected by the operator

A normal resource maps to one vMix input GUID.

Click behavior:

```text
PreviewInput(input)
```

### 6.2 Title/Lower preset resource

A single vMix Title/Lower input can represent many PIBvMix resources.

Example:

```text
LowerThird.gtzip
  |- John Smith — CEO
  |- Maria Silva — CFO
  |- Breaking News
  |- Coming Up Next
```

Every visible PIBvMix item maps to:

```text
Title input GUID + Title preset index + imported preset data
```

Click behavior:

```text
SelectTitlePreset(lower, presetIndex)
        then
PreviewInput(lower)
```

The two operations must be sequential, never intentionally fired in parallel.

---

## 7. Title Preset CSV import

### 7.1 Purpose

vMix allows Title Presets to be exported/imported as CSV. PIBvMix uses this CSV as the authoritative configuration source for exposing each preset as an independent resource button.

This avoids reproducing the vMix right-click preset menu.

### 7.2 Import flow

For a selected Title/Lower input:

1. Operator chooses **Import Presets CSV**.
2. Browser reads the file locally.
3. PIBvMix parses all rows and fields.
4. PIBvMix shows a confirmation preview before adding resources.
5. Operator confirms association with that Title input.
6. Each CSV row becomes one independently selectable PIBvMix resource.

The confirmation preview should show:

- selected vMix Title input;
- number of presets found;
- first few generated labels;
- enough information to catch selection of the wrong CSV.

### 7.3 Preset index

The CSV row order must be preserved because `SelectTitlePreset` operates by preset index.

PIBvMix stores the calculated preset index together with the imported row data.

Current working assumption for v1: preset indices are zero-based.

This assumption must be verified against a real vMix installation during integration testing.

### 7.4 Labels

A CSV row may contain multiple fields.

PIBvMix should generate a useful default display label from non-empty human-readable values, for example:

```text
John Smith — CEO
```

The operator may rename any resource label without changing the underlying CSV/preset mapping.

### 7.5 Independence from source file

Once imported, all information required to operate the preset must be persisted in PIBvMix configuration.

The original CSV file does not need to remain accessible on disk.

---

## 8. Resource selection and ordering

CONFIGURE should provide:

- search;
- filters such as `All`, `Titles`, `Other Inputs`, and `Selected`;
- select/deselect controls;
- imported Title preset expansion;
- rename action;
- remove action;
- drag-and-drop ordering.

The final order is persisted immediately in local storage.

Drag-and-drop is only available in CONFIGURE mode.

CONTROL mode uses the saved order and is locked against accidental rearrangement.

---

## 9. CONTROL mode UI

The operator's dominant task is visual search followed by a single click.

The CONTROL screen therefore contains:

- a compact status/header area;
- large full-row resource buttons;
- clear Program and Preview state;
- an unobtrusive Configure action.

Illustrative layout:

```text
● Connected
PROGRAM: Company Logo
PREVIEW: John Smith — CEO                  Configure

[ John Smith — CEO ]
[ Maria Silva — CFO ]
[ Breaking News ]
[ Company Logo ]
[ Camera 1 ]
[ Camera 3 ]
```

Exact visual styling is not prescribed by this specification, but the interface must prioritize speed, legibility, and live-operation safety over decoration.

---

## 10. Live state monitoring

CONTROL continuously refreshes vMix state by polling `/api` at a reasonable interval.

The polling interval should balance responsive state indication with minimal load. It should be configurable in code and chosen empirically during real vMix testing.

The state model must track at least:

- connection health;
- current Active/Program input;
- current Preview input;
- active Overlays;
- nested input relationships relevant to on-air safety;
- title field values where useful to identify a selected preset.

Buttons remain disabled until the first valid state has been obtained after startup/reconnection.

---

## 11. Program and Preview indication

CONTROL should clearly show both:

- what is currently **PROGRAM / ON AIR**;
- what is currently in **PREVIEW**.

### 11.1 Normal inputs

A normal configured resource can be matched directly through its vMix input GUID.

### 11.2 Title presets sharing one input

Several PIBvMix resources may share the same Title input GUID.

Therefore PIBvMix must not assume that `Preview GUID == Title input GUID` uniquely identifies a particular preset button.

Where possible, PIBvMix should compare the current Title field values returned by vMix with the imported CSV row values to identify the exact preset.

If an exact match cannot be determined confidently, the UI should indicate the underlying Title/Lower input as Preview rather than falsely highlighting a specific preset.

---

## 12. ON AIR safety for Titles/Lowers

Changing a Title preset modifies the underlying Title input and could alter graphics already visible on Program.

Therefore Title preset actions require additional protection.

Before `SelectTitlePreset`, PIBvMix must determine whether the target Title input is currently on-air:

1. directly as Active/Program;
2. directly as an active Overlay;
3. indirectly as a layer/nested input contained in another input that is currently on-air.

Dependency checks should traverse nested/layer relationships recursively where necessary.

If the Title is on-air through any of these paths:

- preset selection is blocked;
- associated Title resource buttons are disabled;
- the UI clearly indicates `ON AIR` or equivalent;
- no confirmation dialog is required because the action is simply unavailable.

Normal inputs do not need this preset-change protection because sending them to Preview does not alter their internal content.

---

## 13. Command execution and race protection

### 13.1 Normal input

```text
click
  -> PreviewInput
  -> verify resulting Preview state
```

### 13.2 Title preset

```text
click
  -> obtain/check current state
  -> verify target Title is not ON AIR
  -> acquire per-input command lock
  -> SelectTitlePreset
  -> wait for request completion
  -> PreviewInput
  -> verify resulting Preview state
  -> release lock
```

### 13.3 Per-input serialization

All Title preset resources that share one vMix input share the same command lock.

While a command is being executed for that Title input, its sibling preset buttons are temporarily unavailable.

This prevents rapid clicks from interleaving preset changes and Preview commands.

---

## 14. Command feedback

Commands should provide immediate, lightweight visual feedback.

Possible states:

- Ready
- Sending
- Preview
- On Air / blocked
- Unavailable
- Error

Routine Preview commands must not use modal confirmation dialogs.

Errors should be visible but unobtrusive and should not permanently obscure the resource list.

PIBvMix must never display a successful Preview state solely because a button was clicked; success should be verified from subsequent vMix state whenever possible.

---

## 15. Stale-resource handling

A saved PIBvMix configuration may outlive the vMix production from which it was created.

When reconnecting or refreshing:

- each saved GUID is checked against the current production;
- missing inputs are marked `Unavailable`;
- stale resources remain visible in CONFIGURE so the user can repair or remove them;
- unavailable resources are not executable in CONTROL;
- the application must not silently remap a missing GUID to another input solely because the input number or name matches.

---

## 16. Local persistence

PIBvMix stores configuration in browser `localStorage`.

Keys must be namespaced and versioned, for example:

```text
pibvmix:v1:config
```

The persisted object includes a `schemaVersion` so future releases can migrate or reject incompatible configurations safely.

Suggested conceptual structure:

```json
{
  "schemaVersion": 1,
  "vmix": {
    "address": "192.168.1.50:8088"
  },
  "resources": [
    {
      "id": "resource-1",
      "label": "Camera 1",
      "inputKey": "vmix-guid",
      "type": "input"
    },
    {
      "id": "resource-2",
      "label": "John Smith — CEO",
      "inputKey": "vmix-title-guid",
      "type": "titlePreset",
      "presetIndex": 4,
      "presetData": {
        "Name.Text": "John Smith",
        "Role.Text": "CEO"
      }
    }
  ]
}
```

The exact persisted schema may evolve during implementation, but the principles above are required.

---

## 17. Configuration backup

v1 includes:

- **Export PIBvMix Configuration** to a local JSON file;
- **Import PIBvMix Configuration** from a local JSON file.

The exported configuration must contain everything needed to reproduce PIBvMix configuration, including:

- vMix address;
- resource ordering;
- labels;
- input GUID mappings;
- Title preset indices;
- imported CSV preset data;
- schema version.

No backend is involved.

---

## 18. Browser and LAN constraints

The main integration risk is browser communication from:

```text
https://parau.github.io/PIBvMix/
```

to a local HTTP vMix endpoint such as:

```text
http://192.168.1.50:8088/api
```

Modern browsers may require Local Network Access permission and may enforce mixed/private-network security rules.

The application should:

- request/access the LAN only when needed;
- present a useful error when browser permission appears to be the cause;
- provide first-run troubleshooting guidance;
- avoid requiring a backend unless real-world browser testing proves it unavoidable.

This must be validated early against a real vMix installation.

---

## 19. Out of scope for v1

The following are intentionally excluded:

- sending sources directly to Program;
- transition control beyond preparing Preview;
- editing title text manually from PIBvMix;
- parsing undocumented `.vmix` production files;
- reproducing the complete vMix Web Controller;
- backend services;
- user accounts;
- database storage;
- cloud synchronization;
- automatic access to arbitrary local CSV files without user selection;
- Web Controller authentication unless required by integration testing.

---

## 20. Functional acceptance criteria

v1 is functionally successful when all of the following are true:

1. PIBvMix runs from GitHub Pages with no application backend.
2. A user can enter a vMix LAN address and connect to the current vMix production.
3. PIBvMix lists current vMix inputs and identifies Titles/Lowers sufficiently for configuration.
4. The user can select normal inputs for CONTROL.
5. The user can associate a Title input with a vMix Title Preset CSV.
6. Each imported Title preset can appear as its own independently labeled CONTROL item.
7. The user can rename and reorder resources in CONFIGURE.
8. Ordering and configuration survive browser reload through `localStorage`.
9. Configuration can be exported/imported as JSON.
10. A normal resource can be sent to Preview with one click.
11. A Title preset can be selected and then sent to Preview with one click.
12. PIBvMix displays current Program and Preview state.
13. Title resources that would modify an on-air Title, including nested dependencies, are blocked.
14. Rapid clicks on presets sharing one Title input cannot interleave commands.
15. Missing/stale vMix inputs are detected and cannot be executed silently.
16. Command success/failure is reflected from actual vMix state rather than optimistic UI alone.

---

## 21. Implementation priorities

Recommended implementation order:

### Phase 1 — Browser/vMix feasibility spike

- minimal static page;
- normalize address;
- `GET /api`;
- parse XML;
- display inputs;
- execute `PreviewInput`;
- validate GitHub Pages → LAN vMix access in the target browser.

This phase should happen as soon as a real vMix Trial/install is available because it validates the largest external technical risk.

### Phase 2 — Core configuration

- CONFIGURE/CONTROL views;
- localStorage schema;
- resource selection;
- ordering;
- stale GUID handling.

### Phase 3 — Title Presets

- CSV parsing;
- label generation;
- `SelectTitlePreset`;
- per-input serialization;
- preset/Preview matching.

### Phase 4 — Live safety

- Program/Preview monitoring;
- active Overlay detection;
- recursive nested/layer dependency detection;
- ON AIR blocking;
- state verification/error feedback.

### Phase 5 — Polish

- import/export JSON;
- search/filter;
- first-run help;
- responsive layout;
- operational UX refinement.

---

## 22. Technical questions to validate with real vMix

The following are not blockers for initial implementation but require empirical validation:

1. Exact browser behavior for GitHub Pages HTTPS → vMix HTTP LAN API in the intended Chrome/Edge versions.
2. Exact vMix Web Controller/security settings needed for cross-origin browser access.
3. Whether vMix returns a response that allows reliable command-level success detection or whether state polling is the authoritative verification mechanism.
4. Exact Title Preset indexing behavior for exported CSV rows.
5. How reliably current Title field values can identify the active/Preview preset.
6. Completeness of nested input/layer relationship information in `/api` for recursive on-air safety checks.
7. Appropriate polling interval for responsive UI without unnecessary API load.

---

## 23. Design principle

Whenever a design decision conflicts with the primary live-operation goal, prefer the option that makes CONTROL safer and simpler.

The defining PIBvMix interaction remains:

> **See what is live, see what is in Preview, find the next resource, click once.**
