import { describe, expect, test } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import { fillPdf, visibleBoxOf } from '../src/fill/fill';
import { fractionToPdf } from '../src/fill/coords';
import { PROOF_PROBES, buildProofMap, buildProofValues, probeLabel } from '../src/proof/proofMap';

const TEMPLATE_PATH = resolve('public/template/contract.pdf');
const OUTPUT_DIR = resolve('proof-output');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'session-a-coordinate-proof.pdf');
const STANDARD_FONT_DIR = resolve('node_modules/pdfjs-dist/standard_fonts/');

const EXPECTED_PAGE_COUNT = 11;
/** Sub-tenth-of-a-point. Anything looser would not have caught the 7.92pt origin bug. */
const POSITION_TOLERANCE_PT = 0.05;
const CROSSHAIR_ARM_PT = 9;

describe('GO/NO-GO: fractional coordinates land correctly on all 11 real pages', () => {
  test('the real template still has the geometry this project was built against', async () => {
    const doc = await PDFDocument.load(readFileSync(TEMPLATE_PATH), { updateMetadata: false });
    const pages = doc.getPages();
    expect(pages).toHaveLength(EXPECTED_PAGE_COUNT);

    for (const [i, page] of pages.entries()) {
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      expect(page.getRotation().angle % 360, `page ${i + 1} /Rotate`).toBe(0);
      expect(crop, `page ${i + 1} CropBox differs from MediaBox`).toEqual(media);
    }
  });

  test('every probe on every page renders at exactly the fraction it was mapped to', async () => {
    const templateBytes = readFileSync(TEMPLATE_PATH);
    const map = buildProofMap(EXPECTED_PAGE_COUNT);
    const values = buildProofValues(EXPECTED_PAGE_COUNT);

    const filled = await fillPdf(templateBytes, map, values);
    expect(filled.warnings).toEqual([]);

    const annotated = await addCrosshairs(filled.bytes);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_PATH, annotated);

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(annotated),
      standardFontDataUrl: `${STANDARD_FONT_DIR}/`,
    }).promise;

    expect(doc.numPages).toBe(EXPECTED_PAGE_COUNT);

    const failures: string[] = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items as Array<{ str: string; transform: number[] }>;

      for (const probe of PROOF_PROBES) {
        const label = probeLabel(probe.tag, pageNo - 1);
        const matches = items.filter((item) => item.str.trim() === label);
        if (matches.length !== 1) {
          failures.push(`page ${pageNo} ${probe.tag}: expected exactly 1 match for "${label}", found ${matches.length}`);
          continue;
        }
        const device = pdfjs.Util.transform(viewport.transform, matches[0].transform);
        const [, , , , deviceX, deviceY] = device;

        // The coordinate contract, stated end to end: a fraction of the rendered
        // page must come back as that same fraction of the rendered page.
        const expectedY = probe.fy * viewport.height;
        if (Math.abs(deviceY - expectedY) > POSITION_TOLERANCE_PT) {
          failures.push(
            `page ${pageNo} ${probe.tag}: y ${deviceY.toFixed(3)} != expected ${expectedY.toFixed(3)} ` +
              `(off by ${(deviceY - expectedY).toFixed(3)}pt)`,
          );
        }
        if (probe.align === 'left') {
          const expectedX = probe.fx * viewport.width;
          if (Math.abs(deviceX - expectedX) > POSITION_TOLERANCE_PT) {
            failures.push(
              `page ${pageNo} ${probe.tag}: x ${deviceX.toFixed(3)} != expected ${expectedX.toFixed(3)} ` +
                `(off by ${(deviceX - expectedX).toFixed(3)}pt)`,
            );
          }
        }
      }
    }

    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    console.log(`\nProof artifact for visual inspection: ${OUTPUT_PATH}\n`);
  }, 60_000);
});

/**
 * Draws a crosshair centred on each probe's exact mapped point, so the artifact can
 * be checked by eye rather than trusted. Vector lines only — invisible to getTextContent,
 * so the assertions above still run against these exact bytes.
 */
async function addCrosshairs(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const marker = rgb(0.9, 0.2, 0.2);
  for (const page of doc.getPages()) {
    const box = visibleBoxOf(page);
    for (const probe of PROOF_PROBES) {
      const point = fractionToPdf(probe.fx, probe.fy, box);
      page.drawLine({
        start: { x: point.x - CROSSHAIR_ARM_PT, y: point.y },
        end: { x: point.x + CROSSHAIR_ARM_PT, y: point.y },
        thickness: 0.6,
        color: marker,
      });
      page.drawLine({
        start: { x: point.x, y: point.y - CROSSHAIR_ARM_PT },
        end: { x: point.x, y: point.y + CROSSHAIR_ARM_PT },
        thickness: 0.6,
        color: marker,
      });
    }
  }
  return doc.save();
}
