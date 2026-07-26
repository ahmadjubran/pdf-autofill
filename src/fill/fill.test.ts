import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { fillPdf, visibleBoxOf, UnsupportedPageError } from './fill';
import type { FieldMap } from '../fieldmap/types';

const OFFSET_Y = 7.9200063;
const PAGE_W = 612;
const PAGE_H = 791.9999937;

/** A synthetic stand-in that reproduces the real template's offset MediaBox. */
async function makeTemplate(pages = 2, rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage();
    page.setMediaBox(0, OFFSET_Y, PAGE_W, PAGE_H);
    if (rotation !== 0) page.setRotation(degrees(rotation));
  }
  return doc.save();
}

function mapWith(fields: FieldMap['fields'], pageCount = 2): FieldMap {
  return {
    templateId: 'test',
    pageCount,
    vars: [
      { id: 'orderNo', label: 'Order No.', group: 'Header', kind: 'text' },
      { id: 'agreed', label: 'Agreed', group: 'Header', kind: 'bool' },
    ],
    fields,
  };
}

/**
 * The drawn text strings on one page, for assertions that only care whether/what
 * text was drawn — not its exact device position (see readDevicePosition below
 * for that).
 */
async function textItemsOf(bytes: Uint8Array, pageNo = 1): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts/')}/`,
  }).promise;
  const page = await doc.getPage(pageNo);
  const items = (await page.getTextContent()).items as Array<{ str: string }>;
  return items.map((item) => item.str);
}

describe('visibleBoxOf', () => {
  test('reports the offset origin rather than a zero-based size', async () => {
    const doc = await PDFDocument.load(await makeTemplate(1));
    const box = visibleBoxOf(doc.getPages()[0]);
    expect(box.y).toBeCloseTo(OFFSET_Y, 6);
    expect(box.width).toBeCloseTo(PAGE_W, 6);
    expect(box.height).toBeCloseTo(PAGE_H, 6);
  });
});

describe('fillPdf', () => {
  test('produces a loadable PDF with the same page count as the template', async () => {
    const result = await fillPdf(await makeTemplate(2), mapWith([]), {});
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  test('writes more bytes when a value is drawn than when nothing is', async () => {
    const template = await makeTemplate(1);
    const field = { id: 'f1', page: 0, x: 0.5, y: 0.5, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    const empty = await fillPdf(template, mapWith([field], 1), {});
    const drawn = await fillPdf(template, mapWith([field], 1), { orderNo: 'ORD-12345' });
    expect(drawn.bytes.length).toBeGreaterThan(empty.bytes.length);
  });

  test('skips a field whose bound variable has no value, without warning', async () => {
    const field = { id: 'f1', page: 0, x: 0.5, y: 0.5, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    const result = await fillPdf(await makeTemplate(1), mapWith([field], 1), { orderNo: '' });
    expect(result.warnings).toEqual([]);
  });

  test('warns instead of throwing when a field points past the last page', async () => {
    const field = { id: 'stray', page: 5, x: 0.5, y: 0.5, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    // pageCount matches the template (2) so this test isolates the stray-field
    // warning from the separate pageCount cross-check warning (see below).
    const result = await fillPdf(await makeTemplate(2), mapWith([field], 2), { orderNo: 'X' });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/stray/);
    expect(result.warnings[0]).toMatch(/page 5/);
  });

  test('draws a check field only when its value is true', async () => {
    const template = await makeTemplate(1);
    const field = { id: 'c1', page: 0, x: 0.2, y: 0.2, size: 12, align: 'left', type: 'check', bind: 'agreed' } as const;
    const off = await fillPdf(template, mapWith([field], 1), { agreed: false });
    const on = await fillPdf(template, mapWith([field], 1), { agreed: true });
    expect(on.bytes.length).toBeGreaterThan(off.bytes.length);
  });

  test('leaves the template bytes untouched', async () => {
    const template = await makeTemplate(1);
    const before = template.slice();
    const field = { id: 'f1', page: 0, x: 0.5, y: 0.5, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    await fillPdf(template, mapWith([field], 1), { orderNo: 'ORD-1' });
    expect(template).toEqual(before);
  });

  test('throws a named error on a rotated page rather than misplacing every field', async () => {
    const field = { id: 'f1', page: 0, x: 0.5, y: 0.5, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    await expect(fillPdf(await makeTemplate(1, 90), mapWith([field], 1), { orderNo: 'X' }))
      .rejects.toThrow(UnsupportedPageError);
  });
});

describe('fillPdf pageCount cross-check', () => {
  test('warns naming both numbers when the map pageCount does not match the template', async () => {
    const result = await fillPdf(await makeTemplate(2), mapWith([], 5), {});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/5/);
    expect(result.warnings[0]).toMatch(/2/);
  });

  test('does not warn when pageCount matches the template', async () => {
    const result = await fillPdf(await makeTemplate(3), mapWith([], 3), {});
    expect(result.warnings).toEqual([]);
  });
});

describe('fillPdf field-level draw failures', () => {
  test('draws a left-aligned value containing a newline instead of warning, because drawText handles multi-line text', async () => {
    const field = { id: 'notes', page: 0, x: 0.2, y: 0.2, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    const result = await fillPdf(await makeTemplate(1), mapWith([field], 1), { orderNo: 'line one\nline two' });
    expect(result.warnings).toEqual([]);
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(1);
    const items = await textItemsOf(result.bytes);
    expect(items.some((str) => str.includes('line one'))).toBe(true);
    expect(items.some((str) => str.includes('line two'))).toBe(true);
  });

  test('warns and skips only the offending field when a value has a character the font cannot encode, without losing the other fields or the save', async () => {
    const bad = { id: 'bad', page: 0, x: 0.2, y: 0.2, size: 10, align: 'left', type: 'text', bind: 'orderNo' } as const;
    const good = { id: 'good', page: 0, x: 0.2, y: 0.6, size: 10, align: 'left', type: 'text', bind: 'agreed' } as const;

    const result = await fillPdf(
      await makeTemplate(1),
      mapWith([bad, good], 1),
      { orderNo: 'bad \u{1F600} value', agreed: 'still drawn' },
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/bad/);

    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(1);
    const items = await textItemsOf(result.bytes);
    expect(items.some((str) => str.includes('still drawn'))).toBe(true);
  });
});

describe('fillPdf value lookup safety', () => {
  test('does not draw an inherited Object.prototype member when a field binds to "constructor"', async () => {
    const field = { id: 'f1', page: 0, x: 0.2, y: 0.2, size: 10, align: 'left', type: 'text', bind: 'constructor' } as const;
    const result = await fillPdf(await makeTemplate(1), mapWith([field], 1), {});
    expect(result.warnings).toEqual([]);
    const items = await textItemsOf(result.bytes);
    expect(items.some((str) => str.includes('native code'))).toBe(false);
  });
});

const OFFSET_X = 15;
const PROBE_TEXT = 'ORD-12345';
const PROBE_SIZE = 10;
/** Neither 0, 0.5 nor 1 on either axis, and fx !== fy, so a transposed argument cannot hide. */
const PROBE_FX = 0.25;
const PROBE_FY = 0.75;
/** A synthetic page has no scanner noise, so the conversion should be exact to rounding. */
const EXACT_DIGITS = 6;

/**
 * Both origin components non-zero. The real contract has MediaBox.x = 0, so the
 * 11-page proof can never catch a dropped `box.x` term — this page is what covers
 * that axis.
 */
async function makeOffsetOriginTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage().setMediaBox(OFFSET_X, OFFSET_Y, PAGE_W, PAGE_H);
  return doc.save();
}

/** Where pdf.js actually renders a drawn string, in device space. Same technique as the 11-page proof. */
async function readDevicePosition(bytes: Uint8Array, text: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    // Positions are correct without this, but omitting it makes pdf.js warn on stderr.
    standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts/')}/`,
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const items = (await page.getTextContent()).items as Array<{ str: string; transform: number[] }>;
  const matches = items.filter((item) => item.str.trim() === text);
  expect(matches, `expected exactly one "${text}" in the output`).toHaveLength(1);
  const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, matches[0].transform);
  return { x, y, width: viewport.width, height: viewport.height };
}

/**
 * coords.test.ts pins `fractionToPdf` in isolation, but nothing pinned the WIRING
 * inside drawField. A regression passing a zero-origin size there — the exact
 * 7.92pt bug this project exists to prevent — used to pass every test in this file,
 * because the only coordinate check was "more bytes were written".
 */
describe('fillPdf coordinate wiring', () => {
  test('draws a left-aligned field at exactly the mapped fraction of the rendered page', async () => {
    const field = { id: 'f1', page: 0, x: PROBE_FX, y: PROBE_FY, size: PROBE_SIZE, align: 'left', type: 'text', bind: 'orderNo' } as const;

    const result = await fillPdf(await makeOffsetOriginTemplate(), mapWith([field], 1), { orderNo: PROBE_TEXT });
    const drawn = await readDevicePosition(result.bytes, PROBE_TEXT);

    expect(drawn.x).toBeCloseTo(PROBE_FX * drawn.width, EXACT_DIGITS);
    expect(drawn.y).toBeCloseTo(PROBE_FY * drawn.height, EXACT_DIGITS);
  });

  test('shifts a centre-aligned field left by half its text width', async () => {
    const field = { id: 'f1', page: 0, x: PROBE_FX, y: PROBE_FY, size: PROBE_SIZE, align: 'center', type: 'text', bind: 'orderNo' } as const;

    const result = await fillPdf(await makeOffsetOriginTemplate(), mapWith([field], 1), { orderNo: PROBE_TEXT });
    const drawn = await readDevicePosition(result.bytes, PROBE_TEXT);

    // The proof exempts its centred probe from the X assertion, so this is the only
    // automated coverage of centre alignment anywhere in the project.
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const textWidth = font.widthOfTextAtSize(PROBE_TEXT, PROBE_SIZE);
    expect(textWidth).toBeGreaterThan(0);

    expect(drawn.x).toBeCloseTo(PROBE_FX * drawn.width - textWidth / 2, EXACT_DIGITS);
    expect(drawn.y).toBeCloseTo(PROBE_FY * drawn.height, EXACT_DIGITS);
  });
});
