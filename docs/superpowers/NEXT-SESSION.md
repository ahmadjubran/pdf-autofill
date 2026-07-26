# Kickoff prompt — Session B (the mapper)

Copy everything below into a fresh session.

---

Read these two first, in order:

1. `docs/superpowers/specs/2026-07-25-pdf-autofill-design.md` — the approved design. Do not
   re-litigate section 4; those decisions were made deliberately with the trade-offs
   understood. Section 5's "Coordinate contract" was corrected at the end of Session A and
   is now accurate — trust it.
2. The **Global Constraints** section of `docs/superpowers/plans/2026-07-26-session-a-foundation.md`.
   They still bind. Everything built in Session A follows them.

We are building **Session B only** (spec section 9): the touch mapper. Do not build the entry
form, job persistence, PDF generation UI, the import bridge, or the service worker.

## Before writing any code

**Confirm Session A's two human checks passed.** Ask me directly if I have not already said so:

- Did the 11 pages of `proof-output/session-a-coordinate-proof.pdf` look right by eye?
- Does `https://ahmadjubran.github.io/pdf-autofill/` work on the phone?

**If the artifact inspection found anything wrong, stop.** Session B captures coordinates
against that contract. If the conversion is off, every coordinate I record is wrong and the
session is void. Re-run `npm run proof` and report before touching anything else.

Then verify the foundation is still where Session A left it:

- `npm test` → 53 passing, 5 files
- `npm run test:coverage` → passes the 80% gate on `src/fieldmap/**` and `src/fill/**`
- `npm run build` → clean
- `git status` → clean, on `master` (working directly on master is intentional and I have
  consented; do not create a branch or worktree)

## Facts you must not re-derive — they were measured, not assumed

All 11 pages of `public/template/contract.pdf`: MediaBox `x:0 y:7.9200063 w:612 h:791.9999937`,
CropBox identical, `/Rotate 0`. The three scanner generations left no fingerprint on page
geometry.

The coordinate contract, proven end to end on all 11 pages (worst error 1.7e-13pt):

```
pdfX = box.x + fx * box.width
pdfY = box.y + (1 - fy) * box.height
```

`box` is the page's **visible box** — CropBox, falling back to MediaBox. The origin is *not*
reliably zero, and pdf-lib's `drawText` does not compensate for it. **Never use
`page.getSize()`** — it discards the origin, which is exactly the 7.92pt bug this project
already found and fixed. `src/fill/coords.ts` carries a regression test that fails if `box.y`
is dropped.

**The fraction point is the text baseline** — the left edge for `align: 'left'`, the horizontal
centre for `align: 'center'`. Your live preview must anchor to the same point, or what the user
nudges into place will not be where the value lands.

**Read installed type definitions, not docs or this prompt.** The installed majors are ahead of
what any document here names: Vite 8, TypeScript 7, Vitest 4, pdfjs-dist 6, pdf-lib 1.17.
pdf.js broke this project twice in Session A (`isEvalSupported` removed in v6; `page.render()`
now requires `canvas`, not `canvasContext`). Check `node_modules/pdfjs-dist/types/src/display/api.d.ts`
before writing render code.

## What already exists — use it, don't reinvent it

| Module | Exports |
|---|---|
| `fieldmap/types.ts` | `Var`, `Field`, `FieldMap`, `Job`, `FieldValues`, `VarKind`, `FieldType`, `FieldAlign`, `Provenance` |
| `fieldmap/parse.ts` | `parseFieldMap`, `serialiseFieldMap`, `validateFieldMap`, `FieldMapError` |
| `fieldmap/derive.ts` | `deriveVars`, `countFieldsPerVar`, `stampGroup` |
| `fill/coords.ts` | `fractionToPdf`, `alignedX`, `PageBox`, `PdfPoint` |
| `fill/fill.ts` | `fillPdf`, `visibleBoxOf`, `UnsupportedPageError` |
| `proof/proofMap.ts` | `PROOF_PROBES`, `buildProofMap`, `buildProofValues`, `probeLabel` |

`stampGroup` returns a **new** map and never mutates its input. Every map-mutating function you
add must match that shape — the immutability guarantee must not erode into the UI layer.

## Do these three first, before any mapper code exists

They each get materially more expensive once there is UI to migrate:

1. **Split `tsconfig.json`** into `tsconfig.app.json` (DOM libs, no `"node"`, scoped to `src`) and
   `tsconfig.node.json` (`"node"`, scoped to `tests`/`tools`/`vite.config.ts`), unified by project
   references — the standard Vite pattern this repo skipped. Right now `@types/node` sits in a
   single project-wide `types` array, so `process.env` in browser code compiles clean and throws
   on the phone. I ruled this deferred from Session A specifically so it would be done here first.
2. **Make `stampGroup`'s id collisions impossible rather than handled.** Its uniqueness is
   per-call: it derives used ids solely from the map passed in, so two stamps computed from one
   state snapshot collide. Session B's headline feature is "stamp the header block onto the 8
   pages that need it" — the exact scenario. Either add a batch API that threads internally, or
   generate ids from a counter or `crypto.randomUUID()`. A doc comment is not a fix.
3. **Extract `fractionToDevice(fx, fy, viewport)` into `coords.ts`.** The device-space half of the
   coordinate contract currently lives only inside `tests/coordinate-proof.test.ts`. The mapper
   needs the same relation to turn a tap into a fraction, and will otherwise re-derive it by hand
   and drift from the gate that proves it.

## Session B's own highest risk — prove it early, like Session A did

Spec section 10 rates "touch mapping small boxes is too fiddly in practice" as the medium risk.
Do not discover this at the end.

**Once zoom, pan, tap, nudge and live preview work — and before you build stamping, the
starter map, or export — stop and have me map 4 or 5 real fields on the real contract on my
actual phone.** If it is unusable, say so and stop rather than building the rest on top. The
spec's fallback is that the same page works with a mouse.

## Session B is done when

- I can map the whole contract on the phone in one sitting: pick a page, pinch-zoom to a box,
  tap where the text goes, nudge with an arrow pad (1pt and 10pt steps) until the live true-size
  preview sits right, then name or pick the variable it binds to.
- Repeating blocks can be stamped onto other pages and nudged individually.
- The map survives a reload, and exports to a file that re-imports cleanly. Spec section 7
  requires that a lost `localStorage` is recoverable from that file, and that the app prompts to
  export after the first mapping pass.
- A pre-seeded starter map exists, so my first pass is nudging roughly-right fields rather than
  placing 50 from scratch.
- **Round-trip check:** fields I place in the mapper, run through the existing `fillPdf`, land
  where the mapper showed them. Reuse the proof machinery rather than eyeballing it — this is
  what closes the loop between the two halves of the coordinate contract.

## Scope note to resolve with me early

Spec section 5 lists `store` as its own module and section 9 puts job save/reopen in Session C.
But the mapper cannot deliver "map in one sitting" without persisting the **map**. Assume the
map-persistence half of `store` belongs to Session B and the job-persistence half to Session C,
and tell me if you disagree.

## Testing expectations

New pure functions in `fieldmap` and `fill` are covered by the 80% gate and should be TDD'd —
test first, run it red, then implement. The mapper's canvas and touch UI are deliberately
excluded from coverage (spec section 5: measuring it "would be theatre") and are verified by
hand on the device. Do not add tests that assert nothing in order to move a number.

`tests/coordinate-proof.test.ts` is the project's regression gate and CI runs it before every
deploy. If you change anything in `src/fill/`, that proof must still pass.

## Carried-over items — for the plan's follow-up list, not for building now

- `parse.ts` returns raw cast arrays, so excess keys on individual entries survive validation.
  Fix before **Session D**, which is the untrusted-JSON boundary.
- `fillPdf` warns but does not otherwise act on a `map.pageCount` mismatch, and `templateId` is
  still never read anywhere.
- The pdf.js bundle is ~850KB and triggers Vite's chunk-size warning; Session C should
  dynamic-`import()` it so the entry form is not gated on it.
- `src/proof/` ships in the production bundle. Once `main.ts` becomes the real app, decide
  whether it lives behind a diagnostics route or gets deleted.
- No service worker yet, so every load refetches 6.2MB. Spec section 8 wants offline; it is the
  most user-visible Session C item.
- Consider pinning `pdfjs-dist` exactly — it has broken this project twice.

## How to run the session

Use the **writing-plans** skill to produce the Session B implementation plan, show it to me for
approval, then execute it with **subagent-driven-development** as we did in Session A. That
worked well: it caught five real defects in my own plan text that I would otherwise have
shipped. Ask me to rule on anything the review flags as plan-mandated rather than deciding it
yourself.
