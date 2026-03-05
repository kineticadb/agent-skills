'use strict';

/**
 * PNG-to-ANSI terminal preview module.
 *
 * Renders a colored ASCII art approximation of a PNG image using the Unicode
 * half-block technique with 24-bit ANSI colors.  Each terminal cell encodes
 * 2 vertical pixels (foreground = top, background = bottom) using U+2580 (▀).
 *
 * Zero external dependencies — uses Node.js built-in zlib for PNG inflate.
 *
 * Exported API:
 *   renderPreview(pngBuffer, opts)   — write ASCII art to a stream
 *   decodePng(buffer)                — parse PNG → pixel array (exported for testing)
 *   scaleToFit(imgW, imgH, maxCols) — compute scaled dimensions
 *   samplePixel(pixels, imgW, bpp, x, y, imgH) — nearest-neighbor sample → [r,g,b,a]
 *   areaAverage(pixels, imgW, bpp, x0, y0, x1, y1, imgH) — box-filter sample → [r,g,b,a]
 *   blendWithBg(rgba, bgColor)      — alpha-over composite onto background
 *   pixelToAnsi(topRgba, botRgba, bgColor) — ANSI escape for one half-block cell
 */

const zlib = require('zlib');

// ---------------------------------------------------------------------------
// PNG decoder (8-bit RGB / RGBA only)
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Reverse PNG scanline filter for one row.
 * @param {number} filterType  0-4 (None, Sub, Up, Average, Paeth)
 * @param {Buffer} raw         Raw scanline bytes (without filter byte)
 * @param {Buffer|null} prev   Previous (already-unfiltered) scanline, or null for first row
 * @param {number} bpp         Bytes per pixel (3 or 4)
 * @returns {Buffer} Unfiltered scanline
 */
function unfilterRow(filterType, raw, prev, bpp) {
  const out = Buffer.from(raw);
  const len = out.length;

  if (filterType === 0) return out; // None

  for (let i = 0; i < len; i++) {
    const a = i >= bpp ? out[i - bpp] : 0;
    const b = prev ? prev[i] : 0;

    if (filterType === 1) {
      // Sub
      out[i] = (out[i] + a) & 0xff;
    } else if (filterType === 2) {
      // Up
      out[i] = (out[i] + b) & 0xff;
    } else if (filterType === 3) {
      // Average
      out[i] = (out[i] + ((a + b) >>> 1)) & 0xff;
    } else if (filterType === 4) {
      // Paeth
      const c = (prev && i >= bpp) ? prev[i - bpp] : 0;
      out[i] = (out[i] + paethPredictor(a, b, c)) & 0xff;
    }
  }
  return out;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer into raw pixel data.
 * Only supports 8-bit color types 2 (RGB) and 6 (RGBA).
 *
 * @param {Buffer} buffer  Raw PNG file bytes
 * @returns {{ width: number, height: number, bpp: number, pixels: Buffer } | null}
 *   null on unsupported or corrupt input (never throws)
 */
function decodePng(buffer) {
  try {
    if (!buffer || buffer.length < 8) return null;
    if (buffer.compare(PNG_SIGNATURE, 0, 8, 0, 8) !== 0) return null;

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idatChunks = [];
    let pos = 8;

    while (pos + 8 <= buffer.length) {
      const chunkLen = buffer.readUInt32BE(pos);
      const chunkType = buffer.toString('ascii', pos + 4, pos + 8);
      const dataStart = pos + 8;

      if (chunkType === 'IHDR') {
        width = buffer.readUInt32BE(dataStart);
        height = buffer.readUInt32BE(dataStart + 4);
        bitDepth = buffer[dataStart + 8];
        colorType = buffer[dataStart + 9];
      } else if (chunkType === 'IDAT') {
        idatChunks.push(buffer.subarray(dataStart, dataStart + chunkLen));
      } else if (chunkType === 'IEND') {
        break;
      }

      pos = dataStart + chunkLen + 4; // +4 for CRC
    }

    if (bitDepth !== 8) return null;
    if (colorType !== 2 && colorType !== 6) return null;
    if (width === 0 || height === 0) return null;

    const bpp = colorType === 2 ? 3 : 4;
    const compressed = Buffer.concat(idatChunks);
    const raw = zlib.inflateSync(compressed);

    const stride = width * bpp;
    const pixels = Buffer.alloc(height * stride);
    let prevRow = null;

    for (let y = 0; y < height; y++) {
      const rowStart = y * (stride + 1); // +1 for filter byte
      const filterType = raw[rowStart];
      const rowData = raw.subarray(rowStart + 1, rowStart + 1 + stride);
      const unfiltered = unfilterRow(filterType, rowData, prevRow, bpp);
      unfiltered.copy(pixels, y * stride);
      prevRow = unfiltered;
    }

    return { width, height, bpp, pixels };
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

/**
 * Compute output dimensions to fit an image within maxCols terminal columns.
 * Does not upscale.  Accounts for 2:1 vertical pixel packing.
 *
 * @param {number} imgW  Source image width
 * @param {number} imgH  Source image height
 * @param {number} maxCols  Maximum terminal columns
 * @returns {{ cols: number, rows: number, scale: number }}
 */
function scaleToFit(imgW, imgH, maxCols) {
  if (imgW <= maxCols) {
    // No downscale needed — 1 pixel per column
    return { cols: imgW, rows: Math.ceil(imgH / 2), scale: 1 };
  }
  const scale = imgW / maxCols;
  const cols = maxCols;
  const rows = Math.ceil(imgH / (scale * 2));
  return { cols, rows, scale };
}

// ---------------------------------------------------------------------------
// Pixel sampling
// ---------------------------------------------------------------------------

/**
 * Nearest-neighbor sample a pixel, clamped to image bounds.
 *
 * @param {Buffer} pixels  Raw pixel buffer
 * @param {number} imgW    Image width
 * @param {number} bpp     Bytes per pixel (3 or 4)
 * @param {number} x       Pixel X coordinate (may be fractional)
 * @param {number} y       Pixel Y coordinate (may be fractional)
 * @param {number} imgH    Image height
 * @returns {number[]}     [r, g, b, a]
 */
function samplePixel(pixels, imgW, bpp, x, y, imgH) {
  const px = Math.min(Math.max(Math.round(x), 0), imgW - 1);
  const py = Math.min(Math.max(Math.round(y), 0), imgH - 1);
  const offset = (py * imgW + px) * bpp;
  const a = bpp === 4 ? pixels[offset + 3] : 255;
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2], a];
}

/**
 * Area-average (box filter) sample over a rectangle of source pixels.
 * Averages all pixels in the integer grid covering [x0, x1) × [y0, y1),
 * clamped to image bounds.  Falls back to samplePixel at midpoint when the
 * clamped rectangle is degenerate (zero area).
 *
 * @param {Buffer} pixels  Raw pixel buffer
 * @param {number} imgW    Image width
 * @param {number} bpp     Bytes per pixel (3 or 4)
 * @param {number} x0      Left edge (inclusive, may be fractional)
 * @param {number} y0      Top edge (inclusive, may be fractional)
 * @param {number} x1      Right edge (exclusive, may be fractional)
 * @param {number} y1      Bottom edge (exclusive, may be fractional)
 * @param {number} imgH    Image height
 * @returns {number[]}     [r, g, b, a]
 */
function areaAverage(pixels, imgW, bpp, x0, y0, x1, y1, imgH) {
  const pxStart = Math.max(Math.floor(x0), 0);
  const pyStart = Math.max(Math.floor(y0), 0);
  const pxEnd = Math.min(Math.ceil(x1), imgW);
  const pyEnd = Math.min(Math.ceil(y1), imgH);

  const count = (pxEnd - pxStart) * (pyEnd - pyStart);
  if (count <= 0) {
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    return samplePixel(pixels, imgW, bpp, midX, midY, imgH);
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  for (let py = pyStart; py < pyEnd; py++) {
    const rowBase = py * imgW * bpp;
    for (let px = pxStart; px < pxEnd; px++) {
      const offset = rowBase + px * bpp;
      const a = bpp === 4 ? pixels[offset + 3] : 255;
      sumR += pixels[offset] * a;
      sumG += pixels[offset + 1] * a;
      sumB += pixels[offset + 2] * a;
      sumA += a;
    }
  }

  if (sumA === 0) {
    return [0, 0, 0, 0];
  }

  return [
    Math.round(sumR / sumA),
    Math.round(sumG / sumA),
    Math.round(sumB / sumA),
    Math.round(sumA / count),
  ];
}

// ---------------------------------------------------------------------------
// Alpha blending
// ---------------------------------------------------------------------------

const ALPHA_THRESHOLD = 4;

/**
 * Alpha-over composite a pixel onto a background color.
 *
 * @param {number[]} rgba     [r, g, b, a]
 * @param {number[]} bgColor  [r, g, b] background
 * @returns {number[]}        [r, g, b] blended (fully opaque)
 */
function blendWithBg(rgba, bgColor) {
  const alpha = rgba[3] / 255;
  return [
    Math.round(rgba[0] * alpha + bgColor[0] * (1 - alpha)),
    Math.round(rgba[1] * alpha + bgColor[1] * (1 - alpha)),
    Math.round(rgba[2] * alpha + bgColor[2] * (1 - alpha)),
  ];
}

// ---------------------------------------------------------------------------
// ANSI rendering
// ---------------------------------------------------------------------------

/**
 * Produce an ANSI escape string for one half-block cell.
 * Handles transparency: fully transparent pixels yield the terminal's
 * native background (no color codes).
 *
 * @param {number[]} topRgba  [r, g, b, a] for top pixel
 * @param {number[]} botRgba  [r, g, b, a] for bottom pixel
 * @param {number[]} bgColor  [r, g, b] background for blending
 * @returns {string}
 */
function pixelToAnsi(topRgba, botRgba, bgColor) {
  const topTransparent = topRgba[3] <= ALPHA_THRESHOLD;
  const botTransparent = botRgba[3] <= ALPHA_THRESHOLD;

  if (topTransparent && botTransparent) {
    return ' ';
  }

  if (topTransparent) {
    // Only bottom pixel visible — lower half-block as foreground
    const [br, bg, bb] = blendWithBg(botRgba, bgColor);
    return `\x1b[38;2;${br};${bg};${bb}m\u2584\x1b[0m`;
  }

  if (botTransparent) {
    // Only top pixel visible — upper half-block as foreground
    const [tr, tg, tb] = blendWithBg(topRgba, bgColor);
    return `\x1b[38;2;${tr};${tg};${tb}m\u2580\x1b[0m`;
  }

  // Both opaque — upper half-block with fg=top, bg=bottom
  const [tr, tg, tb] = blendWithBg(topRgba, bgColor);
  const [br, bg, bb] = blendWithBg(botRgba, bgColor);
  return `\x1b[38;2;${tr};${tg};${tb}m\x1b[48;2;${br};${bg};${bb}m\u2580\x1b[0m`;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Render a PNG buffer as colored ASCII art to a writable stream.
 *
 * @param {Buffer} pngBuffer  Raw PNG file bytes
 * @param {object} [opts]     Options
 * @param {number} [opts.maxWidth=0]  Max columns (0 = auto-detect from stream)
 * @param {object} [opts.stream]      Writable stream (default: process.stderr)
 * @param {number[]} [opts.bgColor=[0,0,0]]  Background color for alpha blending
 */
function renderPreview(pngBuffer, opts = {}) {
  const stream = opts.stream || process.stderr;
  const bgColor = opts.bgColor || [0, 0, 0];

  // Skip when output is piped (not a terminal)
  if (!stream.isTTY) return;

  try {
    const img = decodePng(pngBuffer);
    if (!img) {
      stream.write('Warning: could not decode PNG for preview\n');
      return;
    }

    const maxCols = opts.maxWidth || stream.columns || 80;
    const { cols, rows, scale } = scaleToFit(img.width, img.height, maxCols);

    const lines = [];
    for (let row = 0; row < rows; row++) {
      let line = '';
      for (let col = 0; col < cols; col++) {
        const x0 = col * scale;
        const x1 = (col + 1) * scale;
        const topY0 = row * 2 * scale;
        const topY1 = (row * 2 + 1) * scale;
        const botY0 = topY1;
        const botY1 = (row * 2 + 2) * scale;

        const topRgba = scale > 1
          ? areaAverage(img.pixels, img.width, img.bpp, x0, topY0, x1, topY1, img.height)
          : samplePixel(img.pixels, img.width, img.bpp, x0, topY0, img.height);
        const botRgba = scale > 1
          ? areaAverage(img.pixels, img.width, img.bpp, x0, botY0, x1, botY1, img.height)
          : samplePixel(img.pixels, img.width, img.bpp, x0, botY0, img.height);
        line += pixelToAnsi(topRgba, botRgba, bgColor);
      }
      lines.push(line);
    }
    stream.write(lines.join('\n') + '\n');
  } catch (_err) {
    stream.write('Warning: preview rendering failed\n');
  }
}

module.exports = { renderPreview, decodePng, scaleToFit, samplePixel, areaAverage, blendWithBg, pixelToAnsi };
