# Kickoff prompt — Session A

Copy everything below into a fresh session.

---

Read `docs/superpowers/specs/2026-07-25-pdf-autofill-design.md` first — it is an approved
design I brainstormed with you and it answers most questions you would otherwise ask. Do not
re-litigate the decisions in section 4; they were made deliberately with the trade-offs
understood.

We are building **Session A only** (see section 9 of the spec). Do not build the mapper, the
entry form, or the import — those are later sessions.

**Before writing any code, verify the prerequisites in section 11:**

1. Confirm `template/contract.pdf` exists and is the real 11-page scanned contract. If it is
   missing, stop and tell me — there is no session without it.
2. Ask me for the hosting decision (GitHub Pages public repo vs Cloudflare Pages private) if
   I have not already told you. `gh` is authenticated as `ahmadjubran`.

**Session A is done when all of these are true:**

- A Vite + TypeScript static site is scaffolded and deployed to a live URL I can open on my
  Android phone and add to the home screen.
- The `fieldmap` module exists with the types from section 5 of the spec, covered by tests
  written first (TDD — red, green, refactor).
- **The go/no-go proof passes:** the `fill` module draws known text at known fractional
  coordinates on **all 11 pages** of the real contract, and I can open the resulting PDF and
  confirm every page landed in the right place. Pages 7, 10 and 11 came from different
  scanners than pages 1–6, so check each page's MediaBox offset and `/Rotate` rather than
  assuming they match. Section 5 "Coordinate contract" defines the conversion.

If the go/no-go proof fails, **stop and tell me** rather than working around it. Section 10
lists that as the highest-severity risk in the project and it invalidates every coordinate in
every later session.

Use the writing-plans skill to produce the Session A implementation plan, show it to me for
approval, then execute it.
