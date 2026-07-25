import { describe, expect, test } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
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
    const result = await fillPdf(await makeTemplate(2), mapWith([field], 6), { orderNo: 'X' });
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
