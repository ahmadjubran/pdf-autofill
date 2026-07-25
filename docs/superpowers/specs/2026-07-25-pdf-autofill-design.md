# PDF Autofill — Design

**Date:** 2026-07-25
**Status:** Approved for planning
**Author:** brainstormed with Ahmad Jubran

---

## 1. Problem

An 11-page interstate moving contract (Bill of Lading + estimate + agreements + inventory)
is filled by hand on an Android phone with a stylus, for every job. Three costs:

1. **Handwriting is slow.** Every value is drawn with a pen instead of typed.
2. **Values repeat across pages.** Order No., pickup date and first-available-delivery date
   appear on 8 of the 11 pages. Origin and destination blocks appear on 3. Each is written
   out again by hand every time.
3. **The source data already exists.** The client sends a CRM email or a screenshot that
   already contains most of the values, and they get re-keyed by hand.

**Constraint that shapes everything:** the contract PDF is a flattened scan. It has no
AcroForm fields, and pages come from at least three different scanning sources (page 7 and
pages 10–11 are visibly different generations from pages 1–6). There is no "type in the
boxes" path. Values must be drawn at coordinates.

## 2. Goals

- Type contract values with a keyboard instead of a pen.
- Enter each repeated value **once**; it appears everywhere it belongs.
- Pre-fill from the client's document with AI, then correct by hand.
- Runs on Android. Phone-only — no PC is required at any point, including setup.
- Free to run. No paid API, no subscription.

## 3. Non-goals (v1)

| Excluded | Why |
|---|---|
| Signature / initial capture | Output is printed, emailed, or pen-signed in an existing PDF app. Mixed per job. |
| Any money math | Every dollar figure comes from the client estimate or is typed. The tool must not be able to put a wrong number on a signed contract. |
| Inventory rows on pages 10–11 | 160 numbered rows with condition codes, filled by hand at the truck during loading. Only the header box on those pages is mapped. |
| A second contract template | The data model allows it; there is no UI for it and no demand yet. |
| Offline OCR / regex parsing | Source documents vary in format and arrive as images. Deterministic parsing is not viable. |

## 4. Decisions and their rationale

| Decision | Alternatives rejected | Why |
|---|---|---|
| Static web app, all processing client-side | Native Android app; Termux + Python | Installs as a home-screen icon, no app store, no dev toolchain on the phone. Contract PII never leaves the device. |
| Coordinates stored as page fractions (0–1) | Absolute PDF points | Same map works for pdf.js screen rendering and pdf-lib PDF writing, at any zoom or device size. |
| Many fields bind to one variable | Copy values between fields after entry | The binding *is* the fill-once feature. It is the data model, not a behaviour layered on top. |
| Touch-first mapper, built into the app | Hand-authored coordinates by Claude; mouse-first mapper | User requirement: phone-only. Also future-proofs the contract changing — remapping needs no developer. |
| Pre-seeded starter map | Blank map | Estimated coordinates for repeating blocks turn the user's first pass from *placing* 50 fields into *nudging* fields that are roughly right. |
| Paste-JSON import always available; Gemini key optional | Gemini-only; Claude API | No single point of failure and no required account. Gemini AI Studio's free tier needs no credit card; the paste bridge works with any free chat AI. |
| No money math | Full estimate calculator | Legal liability of a wrong computed figure on a signed contract outweighs the keystrokes saved. Totals already arrive pre-computed in the client email. |

## 5. Architecture

```
┌──────────── static site (phone browser) ────────────┐
│                                                     │
│   template/contract.pdf  ──┬── pdf.js ──► page raster (mapper, preview)
│                            └── pdf-lib ─► filled PDF (output)
│                                                     │
│   ┌─────────┐   reads/writes   ┌─────────────┐      │
│   │ mapper  │ ───────────────► │  fieldmap   │      │
│   └─────────┘                  │  (the map)  │      │
│                                └─────┬───────┘      │
│   ┌─────────┐   reads               │              │
│   │  form   │ ◄─────────────────────┤              │
│   └────┬────┘                       │              │
│        │ values                     │ fields       │
│        ▼                            ▼              │
│   ┌─────────┐                  ┌─────────┐         │
│   │ import  │ ──► values ──►   │  fill   │ ──► PDF │
│   └─────────┘                  └─────────┘         │
│                                                     │
│   localStorage: field map, saved jobs, Gemini key   │
└─────────────────────────────────────────────────────┘
```

The mapper and the fill engine never call each other. Both only read and write the field
map. A rough mapper therefore cannot destabilise the filling path.

### Modules

| Module | Responsibility | Depends on | Testable without UI |
|---|---|---|---|
| `fieldmap` | Map types, serialise/deserialise, group stamping, variable list derivation | — | yes |
| `fill` | Draw values at mapped coordinates, produce a PDF Blob | fieldmap, pdf-lib | yes (byte assertions) |
| `import` | Normalise pasted JSON to the variable set; optional Gemini call | fieldmap | yes |
| `store` | Field map, jobs, key persistence in localStorage | fieldmap | yes |
| `mapper` | Touch placement UI: zoom, pan, tap, nudge, preview, stamp | fieldmap, pdf.js | no (manual) |
| `form` | Entry form generated from the variable list, grouped by section | fieldmap, store | no (manual) |

Automated tests cover `fieldmap`, `fill`, `import`, `store`. The two UI modules are
verified manually on the device. Coverage targets apply to the pure modules only; claiming
80% across a canvas-driven touch UI would be theatre.

### Data model

```ts
type Var = {
  id: string;              // "orderNo"
  label: string;           // "Order No."
  group: string;           // "Header" | "Origin" | "Destination" | "Charges" | …
  kind: 'text' | 'date' | 'money' | 'bool' | 'longtext';
};

type Field = {
  id: string;
  page: number;            // 0-based
  x: number; y: number;    // fraction of page width/height, origin top-left
  size: number;            // font size in PDF points
  align: 'left' | 'center';
  type: 'text' | 'check';
  bind: string;            // Var.id  — many fields, one var
};

type FieldMap = { templateId: string; pageCount: number; vars: Var[]; fields: Field[] };

type Job = { id: string; name: string; values: Record<string, string | boolean>;
             provenance: Record<string, 'ai' | 'manual'>; updatedAt: number };
```

`provenance` drives the visual marking of AI-filled values so they get double-checked
before the contract is signed.

### Coordinate contract

Fractions have origin **top-left**, matching how the mapper sees the page. `fill` converts
per page:

```
pdfX = x * pageWidth
pdfY = (1 - y) * pageHeight
```

and must account for each page's `MediaBox` offset and `/Rotate`. Pages in this document
came from different scanners; this conversion is verified against all 11 pages in Session A
rather than assumed.

## 6. User flows

**Setup (once, ~20 min, on the phone):** open Mapper → pick a page → pinch-zoom to a box →
tap where text goes → nudge with the arrow pad until the live preview sits correctly → name
or pick the variable → for repeating blocks, stamp the group onto the other pages and nudge
each. Export the map as a backup file.

**Daily:** home-screen icon → New Job → Import (paste JSON from a free chat AI, or one tap
if a Gemini key is set) → review the form, correct AI-marked values, type the rest →
Generate → filled PDF in Downloads → print, send, or open in a pen app to sign.

## 7. Error handling

| Failure | Behaviour |
|---|---|
| No field map yet | Home screen shows "Set up your contract" and routes to the mapper. Filling is disabled, not broken. |
| Pasted text is not valid JSON | Show the parse error and the offending line; keep the paste box populated so it can be fixed in place. |
| JSON has keys that match no variable | Import the ones that match, list the ignored keys explicitly. Never silently drop data. |
| Gemini key missing, rate-limited, or errors | Fall back to the paste bridge with a message naming the actual cause. Never fail silently to an empty form. |
| Value too wide for its box | Live preview in the mapper shows true size so overflow is visible during setup. At fill time, text is drawn as-is and not truncated — a visibly overflowing value is safer than a silently cut one. |
| localStorage cleared / map lost | Map export file can be re-imported. The app prompts to export after the first mapping pass. |
| PDF generation fails | Surface the error; the job data stays saved and is never lost to a failed render. |

## 8. Delivery

Deployed as a static site. **Open decision:** GitHub Pages (free, one command via the
already-authenticated `gh` CLI, but requires a public repo, so the blank contract template
sits at an unlisted public URL) versus Cloudflare Pages (free, private source, ~10 min more
setup). To be confirmed before Session A. Either way a `noindex` header/meta is set.

Offline: service worker caches the app shell and the template PDF, so the tool works with
no signal at a pickup.

## 9. Session plan

| Session | Delivers | Done when |
|---|---|---|
| **A — Foundation** | Repo, scaffold, deploy pipeline, `fieldmap` model + tests, fill engine proven on all 11 pages | The URL opens on the phone's home screen and shows the contract with test values drawn in verified-correct positions on every page |
| **B — Mapper** | Touch mapper (zoom, pan, tap, nudge, preview, stamp, export) + pre-seeded starter map | The whole contract can be mapped on the phone in one sitting |
| **C — Filling** | Generated entry form, checkbox fields, job save/reopen, generate & share, offline cache | A complete contract is filled by keyboard and produced as a PDF |
| **D — Import** | Paste-JSON bridge with prompt-copy, optional Gemini one-tap, AI provenance marking | A client screenshot becomes a mostly-filled contract |

Later sessions are driven by real use, not guessed now.

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| pdf.js and pdf-lib disagree on page origin, rotation or MediaBox — mixed scanner sources make this likely | **High** — invalidates every coordinate | Proven in Session A against all 11 pages with a throwaway test, before any mapper work is built on top |
| Touch mapping small boxes is too fiddly in practice | Medium | Zoom, nudge pad with 1px/10px steps, live true-size preview, group stamping. If it still fails in use, the same page works with a mouse as a fallback |
| Free-tier AI sends client PII (names, addresses, phones) to a third party that may train on it | Medium — accepted knowingly by the user | Documented; import is optional and the tool is fully usable without it |
| Session A's proof fails and coordinates are unworkable | High | Stop and rethink rather than build on a broken foundation. This is why it is step 3 of session A, not step 30 |

## 11. Prerequisites before Session A

1. **The real blank contract PDF** at `template/contract.pdf` — the actual file, not a
   screenshot or an export of one. Nothing can start without it.
2. **Hosting decision:** GitHub Pages (public repo) or Cloudflare Pages (private source).
3. *(Optional, needed only by Session D)* a free Gemini API key from aistudio.google.com.
