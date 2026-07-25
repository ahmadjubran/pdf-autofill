import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Field, FieldMap } from '../fieldmap/types';
import { alignedX, fractionToPdf, type PageBox } from './coords';

export type FillValues = Record<string, string | boolean>;

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
    drawField(page, font, field, text);
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
  const raw = values[field.bind];
  if (raw === undefined || raw === null || raw === '') return null;
  if (field.type === 'check') return raw === true || raw === 'true' ? CHECK_GLYPH : null;
  return String(raw);
}

function drawField(page: PDFPage, font: PDFFont, field: Field, text: string): void {
  const anchor = fractionToPdf(field.x, field.y, visibleBoxOf(page));
  // Values are drawn as-is and never truncated: a visibly overflowing value is
  // safer on a signed contract than a silently cut one (spec section 7).
  const textWidth = font.widthOfTextAtSize(text, field.size);
  page.drawText(text, {
    x: alignedX(anchor.x, textWidth, field.align),
    y: anchor.y,
    size: field.size,
    font,
    color: INK,
  });
}
