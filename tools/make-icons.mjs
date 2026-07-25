// Dependency-free PNG icon generator. Run: npm run icons
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BACKGROUND = [17, 24, 39];
const PAPER = [248, 250, 252];
const INK = [100, 116, 139];
const ACCENT = [249, 115, 22];
const ICON_SIZES = [192, 512];
const OUT_DIR = new URL('../public/', import.meta.url);

// Icon layout geometry, expressed in units of a square design grid so it
// scales cleanly across every size in ICON_SIZES (unit = size / GRID_UNITS).
const GRID_UNITS = 16;

// Paper rectangle centered inside the icon canvas.
const PAPER_X_UNITS = 4;
const PAPER_Y_UNITS = 3;
const PAPER_WIDTH_UNITS = 8;
const PAPER_HEIGHT_UNITS = 10;

// Left margin shared by the text lines and the accent bar beneath them.
const CONTENT_X_UNITS = 5;

// Horizontal ink strokes standing in for lines of text on the page.
const TEXT_LINE_COUNT = 4;
const TEXT_LINE_WIDTH_UNITS = 6;
const TEXT_LINE_START_Y_UNITS = 4.8;
const TEXT_LINE_SPACING_UNITS = 1.6;
const TEXT_LINE_HEIGHT_UNITS = 0.5;

// Accent bar beneath the text lines (the orange "signature" stroke).
const ACCENT_BAR_Y_UNITS = 11.2;
const ACCENT_BAR_WIDTH_UNITS = 4;
const ACCENT_BAR_HEIGHT_UNITS = 0.8;

// Floor so thin strokes don't round away to 0px at the smallest icon size.
const MIN_STROKE_PX = 1;

function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 3);
  const unit = size / GRID_UNITS;

  const fillRect = (x0, y0, w, h, colour) => {
    const xs = Math.round(x0);
    const ys = Math.round(y0);
    const xe = Math.round(x0 + w);
    const ye = Math.round(y0 + h);
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = (y * size + x) * 3;
        pixels[i] = colour[0];
        pixels[i + 1] = colour[1];
        pixels[i + 2] = colour[2];
      }
    }
  };

  fillRect(0, 0, size, size, BACKGROUND);
  fillRect(unit * PAPER_X_UNITS, unit * PAPER_Y_UNITS, unit * PAPER_WIDTH_UNITS, unit * PAPER_HEIGHT_UNITS, PAPER);
  const lineHeight = Math.max(MIN_STROKE_PX, unit * TEXT_LINE_HEIGHT_UNITS);
  for (let i = 0; i < TEXT_LINE_COUNT; i++) {
    fillRect(
      unit * CONTENT_X_UNITS,
      unit * (TEXT_LINE_START_Y_UNITS + i * TEXT_LINE_SPACING_UNITS),
      unit * TEXT_LINE_WIDTH_UNITS,
      lineHeight,
      INK,
    );
  }
  fillRect(
    unit * CONTENT_X_UNITS,
    unit * ACCENT_BAR_Y_UNITS,
    unit * ACCENT_BAR_WIDTH_UNITS,
    Math.max(MIN_STROKE_PX, unit * ACCENT_BAR_HEIGHT_UNITS),
    ACCENT,
  );
  return encodePng(size, size, pixels);
}

function encodePng(width, height, rgb) {
  const stride = 1 + width * 3;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter type: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * stride + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, checksum]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of ICON_SIZES) {
  const file = new URL(`icon-${size}.png`, OUT_DIR);
  writeFileSync(file, renderIcon(size));
  console.log(`wrote icon-${size}.png`);
}
