import { describe, expect, test } from 'vitest';
import { fractionToPdf, alignedX, type PageBox } from './coords';

/** Measured from public/template/contract.pdf on 2026-07-26. Identical on all 11 pages. */
const CONTRACT_BOX: PageBox = { x: 0, y: 7.9200063, width: 612, height: 791.9999937 };
const TOLERANCE = 1e-6;

describe('fractionToPdf', () => {
  test('maps the top edge (fy=0) to the top of the visible box', () => {
    const point = fractionToPdf(0, 0, CONTRACT_BOX);
    expect(point.y).toBeCloseTo(799.92, 4);
  });

  test('maps the bottom edge (fy=1) to the box origin, NOT to zero', () => {
    const point = fractionToPdf(0, 1, CONTRACT_BOX);
    expect(point.y).toBeCloseTo(7.9200063, 6);
  });

  test('maps the left edge to the box origin x', () => {
    expect(fractionToPdf(0, 0.5, CONTRACT_BOX).x).toBeCloseTo(0, 6);
  });

  test('maps the right edge to the full box width', () => {
    expect(fractionToPdf(1, 0.5, CONTRACT_BOX).x).toBeCloseTo(612, 6);
  });

  test('maps the centre to the middle of the visible box', () => {
    const point = fractionToPdf(0.5, 0.5, CONTRACT_BOX);
    expect(point.x).toBeCloseTo(306, 6);
    expect(point.y).toBeCloseTo(403.92, 4);
  });

  test('honours a box whose origin is at zero, so the maths is not hardcoded to this template', () => {
    const a4: PageBox = { x: 0, y: 0, width: 595.28, height: 841.89 };
    expect(fractionToPdf(0, 1, a4).y).toBeCloseTo(0, 6);
    expect(fractionToPdf(0, 0, a4).y).toBeCloseTo(841.89, 6);
  });

  test('honours a non-zero x origin as well as y', () => {
    const shifted: PageBox = { x: 20, y: 10, width: 100, height: 200 };
    expect(fractionToPdf(0, 1, shifted)).toEqual({ x: 20, y: 10 });
    expect(fractionToPdf(1, 0, shifted)).toEqual({ x: 120, y: 210 });
  });

  test('REGRESSION: never reproduces the naive (1-fy)*height formula', () => {
    // Spec section 5 shorthand would put the bottom edge at y=0, which on this
    // template is 7.92pt below the page and gets silently clipped away.
    const naiveBottom = (1 - 1) * CONTRACT_BOX.height;
    const actualBottom = fractionToPdf(0, 1, CONTRACT_BOX).y;
    expect(actualBottom - naiveBottom).toBeGreaterThan(7.9 - TOLERANCE);
  });
});

describe('alignedX', () => {
  test('leaves left-aligned text at the anchor', () => {
    expect(alignedX(100, 40, 'left')).toBe(100);
  });

  test('centres centre-aligned text on the anchor', () => {
    expect(alignedX(100, 40, 'center')).toBe(80);
  });

  test('is a no-op for centre alignment when the text is empty', () => {
    expect(alignedX(100, 0, 'center')).toBe(100);
  });
});
