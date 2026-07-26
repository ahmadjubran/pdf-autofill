import './style.css';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fillPdf } from './fill/fill';
import { buildProofMap, buildProofValues } from './proof/proofMap';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const TEMPLATE_URL = `${import.meta.env.BASE_URL}template/contract.pdf`;
const EXPECTED_PAGE_COUNT = 11;
const MAX_RENDER_SCALE = 2;
/** Reserves breathing room so the canvas never touches the viewport edge. */
const VIEWPORT_MARGIN_PX = 32;
/**
 * Mirrors style.css's `#status[data-tone='error']` color. Set inline
 * (rather than as a shared CSS custom property) because this fix round is
 * scoped to main.ts only — and the fallback it styles must still render
 * correctly in exactly the case where the scaffold style.css targets is
 * itself missing.
 */
const FALLBACK_ERROR_COLOR = '#f87171';

type StatusTone = 'ok' | 'error' | 'busy';

const app = document.querySelector<HTMLElement>('#app');
const status = document.querySelector<HTMLParagraphElement>('#status');

function setStatus(message: string, tone: StatusTone = 'busy'): void {
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

/**
 * The one place a failure becomes visible to the user. `main()`'s fail-fast
 * scaffold check means `status` should always exist by the time this runs —
 * but if `#status` itself is what's missing, `setStatus` has nowhere to
 * write, so this falls back to a plain element appended straight to
 * `<body>`. A failure must never be invisible, even in that degenerate case.
 */
function reportFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  if (status) {
    setStatus(`Failed: ${message}`, 'error');
    return;
  }
  const fallback = document.createElement('p');
  fallback.textContent = `Failed: ${message}`;
  fallback.dataset.tone = 'error';
  fallback.style.color = FALLBACK_ERROR_COLOR;
  document.body.prepend(fallback);
}

async function main(): Promise<void> {
  if (!app || !status) {
    throw new Error('Page scaffold is missing: expected #app and #status elements in the DOM.');
  }
  setStatus('Fetching the contract template…');
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`Could not fetch the template (HTTP ${response.status}) from ${TEMPLATE_URL}`);
  }
  const templateBytes = new Uint8Array(await response.arrayBuffer());

  setStatus('Drawing the coordinate probes…');
  const map = buildProofMap(EXPECTED_PAGE_COUNT);
  const { bytes, warnings } = await fillPdf(templateBytes, map, buildProofValues(EXPECTED_PAGE_COUNT));
  if (warnings.length > 0) {
    // Deliberate, not a debug leftover: a fill warning means a probe was
    // silently skipped, which the on-screen page-by-page check should also
    // catch. Logging it here makes the cause traceable without blocking.
    console.warn('fill warnings:', warnings);
  }

  addDownloadLink(app, bytes);

  setStatus('Rendering all 11 pages…');
  await renderAllPages(app, bytes);
  setStatus(
    `Rendered ${EXPECTED_PAGE_COUNT} pages. Each label should start exactly at the fraction it names.`,
    'ok',
  );
}

function addDownloadLink(root: HTMLElement, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'coordinate-proof.pdf';
  link.className = 'download';
  link.textContent = 'Download the proof PDF';
  root.append(link);
}

async function renderAllPages(root: HTMLElement, bytes: Uint8Array): Promise<void> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const unscaled = page.getViewport({ scale: 1 });
    const available = Math.min(root.clientWidth, window.innerWidth - VIEWPORT_MARGIN_PX);
    const scale = Math.min((available / unscaled.width) * (window.devicePixelRatio || 1), MAX_RENDER_SCALE);
    const viewport = page.getViewport({ scale });

    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = `Page ${pageNo} of ${doc.numPages}`;

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser did not provide a 2D canvas context.');

    figure.append(caption, canvas);
    root.append(figure);

    // pdfjs-dist v6 made `canvas` a required RenderParameters field
    // (`canvas: HTMLCanvasElement | null`); `canvasContext` still exists but is
    // documented as backwards-compat only, recommending `canvas` instead.
    // See node_modules/pdfjs-dist/types/src/display/api.d.ts:393-412.
    await page.render({ canvas, viewport }).promise;
  }
}

main().catch(reportFatalError);
