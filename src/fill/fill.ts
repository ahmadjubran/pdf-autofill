import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Field, FieldMap, FieldValues } from '../fieldmap/types';
import { alignedX, fractionToPdf, type PageBox } from './coords';

/**
 * Alias kept so existing imports of `FillValues` from this module keep
 * working. The type itself lives in fieldmap/types.ts, alongside `Job['values']`,
 * since it belongs to the data model rather than to PDF geometry.
 */
export type FillValues = FieldValues;

export type FillResult = {
  bytes: Uint8Array;
  /** Non-fatal problems worth surfacing. Never swallowed, never silently dropped. */
  warnings: string[];
};

const CHECK_GLYPH = 'X';
const INK = rgb(0, 0, 0);
const SUPPORTED_ROTATION = 0;

export class UnsupportedPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedPageError';
  }
}

/**
 * The page region the mapper's fractions refer to: the CropBox, which pdf-lib
 * returns as the MediaBox when no CropBox is present.
 */
export function visibleBoxOf(page: PDFPage): PageBox {
  const box = page.getCropBox();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

export async function fillPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  map: FieldMap,
  values: FillValues,
): Promise<FillResult> {
  const warnings: string[] = [];
  const doc = await PDFDocument.load(templateBytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  if (map.pageCount !== pages.length) {
    // Not thrown: the map can still legitimately place every field it has on a
    // page that exists (e.g. pageCount only padded past the last mapped
    // field), and a hard failure here would block a fill that might be
    // entirely correct. Named loudly instead, because a stale map paired with
    // a re-scanned or re-paginated template otherwise puts fields at
    // plausible-looking wrong positions on every page that still exists, with
    // no other signal — only fields past the end warn on their own.
    warnings.push(
      `Field map expects ${map.pageCount} page(s), but the template has ${pages.length}. ` +
        `Positions may be wrong if pages were added, removed, or reordered.`,
    );
  }

  for (const field of map.fields) {
    const page = pages[field.page];
    if (!page) {
      warnings.push(
        `Field "${field.id}" targets page ${field.page}, but the template has ${pages.length} pages. Skipped.`,
      );
      continue;
    }
    assertSupported(page, field);
    const text = resolveText(field, values);
    if (text === null) continue;
    try {
      drawField(page, font, field, text);
    } catch (cause) {
      // One unencodable character (an emoji, non-Latin1 text, etc.) must cost
      // this field, not the whole contract: uncaught, pdf-lib's font width/draw
      // calls throw past this loop and doc.save() below is never reached, so
      // no PDF comes out at all.
      warnings.push(`Field "${field.id}" could not be drawn: ${describeError(cause)}. Skipped.`);
    }
  }

  return { bytes: await doc.save(), warnings };
}

function assertSupported(page: PDFPage, field: Field): void {
  const rotation = page.getRotation().angle % 360;
  if (rotation !== SUPPORTED_ROTATION) {
    throw new UnsupportedPageError(
      `Page ${field.page} has /Rotate ${rotation}. Coordinate conversion is only verified for unrotated pages, ` +
        `so filling was stopped rather than placing fields in the wrong position.`,
    );
  }
}

/** Returns the string to draw, or null when this field should be left blank. */
function resolveText(field: Field, values: FillValues): string | null {
  // Object.hasOwn (not `values[field.bind] === undefined`) because field.bind
  // is a caller-supplied string: a var id of "constructor" or "toString"
  // would otherwise resolve to an inherited Object.prototype member, which is
  // never undefined, so the blank check below would not catch it.
  if (!Object.hasOwn(values, field.bind)) return null;
  const raw = values[field.bind];
  if (raw === undefined || raw === null || raw === '') return null;
  if (field.type === 'check') return raw === true || raw === 'true' ? CHECK_GLYPH : null;
  return String(raw);
}

function drawField(page: PDFPage, font: PDFFont, field: Field, text: string): void {
  const anchor = fractionToPdf(field.x, field.y, visibleBoxOf(page));
  // Values are drawn as-is and never truncated: a visibly overflowing value is
  // safer on a signed contract than a silently cut one (spec section 7).
  //
  // widthOfTextAtSize is only computed for centre alignment, the only case
  // that needs it (alignedX ignores textWidth for 'left'). It throws for any
  // character the font's WinAnsi encoding cannot represent — including a
  // plain newline — so calling it unconditionally broke left-aligned fields
  // that drawText itself handles fine (drawText splits on "\n" internally).
  const textWidth = field.align === 'center' ? font.widthOfTextAtSize(text, field.size) : 0;
  page.drawText(text, {
    x: alignedX(anchor.x, textWidth, field.align),
    y: anchor.y,
    size: field.size,
    font,
    color: INK,
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
