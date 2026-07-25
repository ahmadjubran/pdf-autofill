import type { FieldAlign } from '../fieldmap/types';

/**
 * A page's visible box, as lower-left origin plus dimensions.
 *
 * This is the CropBox (falling back to MediaBox), because that is the region
 * pdf.js actually rasterises — so it is the region the mapper's fractions refer to.
 *
 * `x` and `y` are NOT reliably zero. The real contract's box starts at y=7.9200063,
 * and dropping that origin places every field 7.92pt too low.
 */
export type PageBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPoint = { x: number; y: number };

/**
 * Convert a top-left-origin page fraction to a PDF user-space point.
 *
 * The returned point is the text BASELINE. For align 'left' it is also the left
 * edge of the text; for 'center' it is the horizontal centre (see alignedX).
 */
export function fractionToPdf(fx: number, fy: number, box: PageBox): PdfPoint {
  return {
    x: box.x + fx * box.width,
    y: box.y + (1 - fy) * box.height,
  };
}

/** Shift a baseline x so that text of the given width sits correctly for its alignment. */
export function alignedX(x: number, textWidth: number, align: FieldAlign): number {
  return align === 'center' ? x - textWidth / 2 : x;
}
