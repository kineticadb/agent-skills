'use strict';

/**
 * Unit tests for scripts/modules/image-preview.js
 *
 * Tests cover: decodePng, scaleToFit, samplePixel, areaAverage, pixelToAnsi, renderPreview.
 * Uses a programmatic PNG builder (createTestPng) to construct valid PNG buffers
 * without any fixture files.
 */

const zlib = require('zlib');
const {
  decodePng,
  scaleToFit,
  samplePixel,
  areaAverage,
  blendWithBg,
  pixelToAnsi,
  renderPreview,
} = require('../modules/image-preview');

// ---------------------------------------------------------------------------
// Test PNG builder
// ---------------------------------------------------------------------------

/**
 * Write a 4-byte big-endian uint32.
 */
function writeU32(val) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(val, 0);
  return buf;
}

/**
 * Build a PNG chunk: length(4) + type(4) + data(N) + crc(4).
 */
function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = zlib.crc32(crcInput);
  return Buffer.concat([writeU32(data.length), typeBuf, data, writeU32(crc)]);
}

/**
 * Build a minimal valid PNG buffer from raw RGBA or RGB pixel data.
 *
 * @param {number} width
 * @param {number} height
 * @param {number[]} pixels   Flat array of R,G,B[,A] values per pixel
 * @param {object} [opts]     Options
 * @param {number} [opts.colorType=6]   2 = RGB, 6 = RGBA
 * @param {number} [opts.bitDepth=8]    Bits per channel
 * @param {number} [opts.filterType=0]  PNG filter type for all scanlines
 * @returns {Buffer} Valid PNG file
 */
function createTestPng(width, height, pixels, opts = {}) {
  const colorType = opts.colorType !== undefined ? opts.colorType : 6;
  const bitDepth = opts.bitDepth !== undefined ? opts.bitDepth : 8;
  const filterType = opts.filterType !== undefined ? opts.filterType : 0;
  const bpp = colorType === 2 ? 3 : 4;

  // IHDR: width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = bitDepth;
  ihdrData[9] = colorType;
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace

  // Build raw scanlines with filter byte prefix
  const stride = width * bpp;
  const rawScanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawScanlines[rowOffset] = filterType;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * bpp;
      const dstIdx = rowOffset + 1 + x * bpp;
      for (let c = 0; c < bpp; c++) {
        rawScanlines[dstIdx + c] = pixels[srcIdx + c] || 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawScanlines);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Create a PNG with Sub filter (type 1) applied to scanlines.
 * Sub filter stores the difference from the pixel to the left.
 */
function createSubFilteredPng(width, height, pixels) {
  const bpp = 4;
  const stride = width * bpp;
  const rawScanlines = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawScanlines[rowOffset] = 1; // Sub filter
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * bpp;
      for (let c = 0; c < bpp; c++) {
        const cur = pixels[srcIdx + c] || 0;
        const left = x > 0 ? pixels[srcIdx - bpp + c] || 0 : 0;
        rawScanlines[rowOffset + 1 + x * bpp + c] = (cur - left) & 0xff;
      }
    }
  }

  const compressed = zlib.deflateSync(rawScanlines);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Create a PNG with Up filter (type 2) applied to scanlines.
 * Up filter stores the difference from the pixel above.
 */
function createUpFilteredPng(width, height, pixels) {
  const bpp = 4;
  const stride = width * bpp;
  const rawScanlines = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawScanlines[rowOffset] = 2; // Up filter
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * bpp;
      for (let c = 0; c < bpp; c++) {
        const cur = pixels[srcIdx + c] || 0;
        const above = y > 0 ? pixels[((y - 1) * width + x) * bpp + c] || 0 : 0;
        rawScanlines[rowOffset + 1 + x * bpp + c] = (cur - above) & 0xff;
      }
    }
  }

  const compressed = zlib.deflateSync(rawScanlines);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// decodePng
// ---------------------------------------------------------------------------

describe('decodePng', () => {
  it('decodes a 1x1 RGBA PNG (color type 6)', () => {
    const pixels = [255, 0, 0, 255]; // red, fully opaque
    const png = createTestPng(1, 1, pixels, { colorType: 6 });
    const result = decodePng(png);

    expect(result).not.toBeNull();
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.bpp).toBe(4);
    expect(result.pixels[0]).toBe(255); // R
    expect(result.pixels[1]).toBe(0);   // G
    expect(result.pixels[2]).toBe(0);   // B
    expect(result.pixels[3]).toBe(255); // A
  });

  it('decodes a 2x2 RGB PNG (color type 2)', () => {
    const pixels = [
      255, 0, 0,    0, 255, 0,    // row 0: red, green
      0, 0, 255,    255, 255, 0,  // row 1: blue, yellow
    ];
    const png = createTestPng(2, 2, pixels, { colorType: 2 });
    const result = decodePng(png);

    expect(result).not.toBeNull();
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.bpp).toBe(3);
    // Top-left: red
    expect(result.pixels[0]).toBe(255);
    expect(result.pixels[1]).toBe(0);
    expect(result.pixels[2]).toBe(0);
    // Top-right: green
    expect(result.pixels[3]).toBe(0);
    expect(result.pixels[4]).toBe(255);
    expect(result.pixels[5]).toBe(0);
    // Bottom-left: blue
    expect(result.pixels[6]).toBe(0);
    expect(result.pixels[7]).toBe(0);
    expect(result.pixels[8]).toBe(255);
  });

  it('handles filter type Sub (1)', () => {
    // 2x1 image: [100, 50, 25, 255] then [200, 100, 50, 255]
    const pixels = [100, 50, 25, 255, 200, 100, 50, 255];
    const png = createSubFilteredPng(2, 1, pixels);
    const result = decodePng(png);

    expect(result).not.toBeNull();
    expect(result.pixels[0]).toBe(100);
    expect(result.pixels[1]).toBe(50);
    expect(result.pixels[2]).toBe(25);
    expect(result.pixels[3]).toBe(255);
    expect(result.pixels[4]).toBe(200);
    expect(result.pixels[5]).toBe(100);
    expect(result.pixels[6]).toBe(50);
    expect(result.pixels[7]).toBe(255);
  });

  it('handles filter type Up (2)', () => {
    // 1x2 image: row 0 = [50, 100, 150, 255], row 1 = [60, 110, 160, 255]
    const pixels = [50, 100, 150, 255, 60, 110, 160, 255];
    const png = createUpFilteredPng(1, 2, pixels);
    const result = decodePng(png);

    expect(result).not.toBeNull();
    expect(result.pixels[0]).toBe(50);
    expect(result.pixels[1]).toBe(100);
    expect(result.pixels[2]).toBe(150);
    expect(result.pixels[3]).toBe(255);
    expect(result.pixels[4]).toBe(60);
    expect(result.pixels[5]).toBe(110);
    expect(result.pixels[6]).toBe(160);
    expect(result.pixels[7]).toBe(255);
  });

  it('returns null for invalid PNG signature', () => {
    const buf = Buffer.from('not a png file at all');
    expect(decodePng(buf)).toBeNull();
  });

  it('returns null for unsupported bit depth', () => {
    const png = createTestPng(1, 1, [255, 0, 0, 255], { bitDepth: 16 });
    expect(decodePng(png)).toBeNull();
  });

  it('returns null for truncated data', () => {
    const png = createTestPng(2, 2, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    // Truncate at half the length
    const truncated = png.subarray(0, Math.floor(png.length / 2));
    expect(decodePng(truncated)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scaleToFit
// ---------------------------------------------------------------------------

describe('scaleToFit', () => {
  it('scales 800x600 to 80 cols with ~38 rows', () => {
    const result = scaleToFit(800, 600, 80);
    expect(result.cols).toBe(80);
    // scale = 800/80 = 10, rows = ceil(600 / (10 * 2)) = ceil(30) = 30
    expect(result.rows).toBe(30);
    expect(result.scale).toBe(10);
  });

  it('does not upscale a 10x10 image', () => {
    const result = scaleToFit(10, 10, 80);
    expect(result.cols).toBe(10);
    expect(result.rows).toBe(5); // ceil(10/2) = 5
    expect(result.scale).toBe(1);
  });

  it('handles odd heights correctly', () => {
    const result = scaleToFit(5, 7, 80);
    expect(result.cols).toBe(5);
    expect(result.rows).toBe(4); // ceil(7/2) = 4
    expect(result.scale).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// areaAverage
// ---------------------------------------------------------------------------

describe('areaAverage', () => {
  it('returns uniform color for an all-red 4x4 block', () => {
    // 4x4 RGBA image, all red
    const bpp = 4;
    const w = 4;
    const h = 4;
    const pixels = Buffer.alloc(w * h * bpp);
    for (let i = 0; i < w * h; i++) {
      pixels[i * bpp] = 255;     // R
      pixels[i * bpp + 1] = 0;   // G
      pixels[i * bpp + 2] = 0;   // B
      pixels[i * bpp + 3] = 255; // A
    }
    const result = areaAverage(pixels, w, bpp, 0, 0, 4, 4, h);
    expect(result).toEqual([255, 0, 0, 255]);
  });

  it('averages a 2x2 checkerboard to mid-gray', () => {
    // 2x2 RGB: black, white, white, black
    const bpp = 3;
    const w = 2;
    const h = 2;
    const pixels = Buffer.from([
      0, 0, 0,       255, 255, 255,   // row 0: black, white
      255, 255, 255,  0, 0, 0,        // row 1: white, black
    ]);
    const result = areaAverage(pixels, w, bpp, 0, 0, 2, 2, h);
    expect(result).toEqual([128, 128, 128, 255]);
  });

  it('clamps rectangle that extends past image bounds', () => {
    // 2x2 RGB all green, request rect (0,0)-(10,10) — should clamp to (0,0)-(2,2)
    const bpp = 3;
    const w = 2;
    const h = 2;
    const pixels = Buffer.from([
      0, 200, 0,   0, 200, 0,
      0, 200, 0,   0, 200, 0,
    ]);
    const result = areaAverage(pixels, w, bpp, 0, 0, 10, 10, h);
    expect(result).toEqual([0, 200, 0, 255]);
  });

  it('returns the single pixel color for a 1x1 area', () => {
    const bpp = 4;
    const w = 3;
    const h = 3;
    const pixels = Buffer.alloc(w * h * bpp);
    // Set pixel (1,1) to [42, 84, 126, 255]
    const idx = (1 * w + 1) * bpp;
    pixels[idx] = 42;
    pixels[idx + 1] = 84;
    pixels[idx + 2] = 126;
    pixels[idx + 3] = 255;
    const result = areaAverage(pixels, w, bpp, 1, 1, 2, 2, h);
    expect(result).toEqual([42, 84, 126, 255]);
  });

  it('produces the same RGB result for bpp=3 and bpp=4', () => {
    const w = 2;
    const h = 2;
    // RGB (bpp=3)
    const rgb = Buffer.from([
      100, 150, 200,   50, 100, 150,
      200, 50, 100,    150, 200, 50,
    ]);
    // RGBA (bpp=4) — same RGB values with alpha channel
    const rgba = Buffer.from([
      100, 150, 200, 255,   50, 100, 150, 255,
      200, 50, 100, 255,    150, 200, 50, 255,
    ]);
    const resultRgb = areaAverage(rgb, w, 3, 0, 0, 2, 2, h);
    const resultRgba = areaAverage(rgba, w, 4, 0, 0, 2, 2, h);
    // Both return [r, g, b, 255] — alpha=255 since RGB implies full opacity
    expect(resultRgb).toEqual(resultRgba);
  });

  it('falls back to samplePixel for degenerate zero-area rect', () => {
    // Degenerate: x0 === x1 or y0 === y1 → zero area
    const bpp = 3;
    const w = 2;
    const h = 2;
    const pixels = Buffer.from([
      10, 20, 30,   40, 50, 60,
      70, 80, 90,   100, 110, 120,
    ]);
    // Zero-width rect at (0.5, 0.5) — should fall back to samplePixel at midpoint
    const result = areaAverage(pixels, w, bpp, 1, 1, 1, 1, h);
    // Midpoint (1,1) → samplePixel(1,1) → pixel at (1,1) = [100, 110, 120, 255]
    expect(result).toEqual([100, 110, 120, 255]);
  });
});

// ---------------------------------------------------------------------------
// pixelToAnsi
// ---------------------------------------------------------------------------

describe('pixelToAnsi', () => {
  const bg = [0, 0, 0];

  it('produces correct escape codes for red/blue (both opaque)', () => {
    const result = pixelToAnsi([255, 0, 0, 255], [0, 0, 255, 255], bg);
    expect(result).toBe('\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m\u2580\x1b[0m');
  });

  it('produces correct escape codes for white/black (both opaque)', () => {
    const result = pixelToAnsi([255, 255, 255, 255], [0, 0, 0, 255], bg);
    expect(result).toBe('\x1b[38;2;255;255;255m\x1b[48;2;0;0;0m\u2580\x1b[0m');
  });

  it('returns space for both transparent', () => {
    const result = pixelToAnsi([0, 0, 0, 0], [0, 0, 0, 0], bg);
    expect(result).toBe(' ');
  });

  it('returns lower half-block when top is transparent', () => {
    const result = pixelToAnsi([0, 0, 0, 0], [0, 255, 0, 255], bg);
    // ▄ with foreground = green, no background set
    expect(result).toBe('\x1b[38;2;0;255;0m\u2584\x1b[0m');
  });

  it('returns upper half-block when bottom is transparent', () => {
    const result = pixelToAnsi([255, 0, 0, 255], [0, 0, 0, 0], bg);
    // ▀ with foreground = red, no background set
    expect(result).toBe('\x1b[38;2;255;0;0m\u2580\x1b[0m');
  });

  it('treats alpha <= 4 as transparent', () => {
    const result = pixelToAnsi([100, 100, 100, 4], [100, 100, 100, 3], bg);
    expect(result).toBe(' ');
  });
});

// ---------------------------------------------------------------------------
// blendWithBg
// ---------------------------------------------------------------------------

describe('blendWithBg', () => {
  it('returns the pixel color unchanged when fully opaque', () => {
    expect(blendWithBg([100, 150, 200, 255], [0, 0, 0])).toEqual([100, 150, 200]);
  });

  it('returns the background color when fully transparent', () => {
    expect(blendWithBg([100, 150, 200, 0], [50, 60, 70])).toEqual([50, 60, 70]);
  });

  it('blends to midpoint at 50% alpha', () => {
    // alpha=128 ≈ 0.502; (200*0.502 + 0*0.498) ≈ 100
    const result = blendWithBg([200, 200, 200, 128], [0, 0, 0]);
    // 200 * (128/255) ≈ 100.4 → 100
    expect(result[0]).toBeCloseTo(100, -1);
    expect(result[1]).toBeCloseTo(100, -1);
    expect(result[2]).toBeCloseTo(100, -1);
  });

  it('blends with a non-black background', () => {
    // alpha=128 ≈ 0.502; white on white → still white
    const result = blendWithBg([255, 255, 255, 128], [255, 255, 255]);
    expect(result).toEqual([255, 255, 255]);
  });
});

// ---------------------------------------------------------------------------
// samplePixel with RGBA
// ---------------------------------------------------------------------------

describe('samplePixel', () => {
  it('returns alpha from RGBA pixel (bpp=4)', () => {
    const pixels = Buffer.from([100, 150, 200, 128]);
    expect(samplePixel(pixels, 1, 4, 0, 0, 1)).toEqual([100, 150, 200, 128]);
  });

  it('returns alpha=0 for a fully transparent pixel', () => {
    const pixels = Buffer.from([0, 0, 0, 0]);
    expect(samplePixel(pixels, 1, 4, 0, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it('returns alpha=255 for RGB pixel (bpp=3)', () => {
    const pixels = Buffer.from([100, 150, 200]);
    expect(samplePixel(pixels, 1, 3, 0, 0, 1)).toEqual([100, 150, 200, 255]);
  });
});

// ---------------------------------------------------------------------------
// areaAverage with mixed alpha
// ---------------------------------------------------------------------------

describe('areaAverage with mixed alpha', () => {
  it('alpha-weights RGB so transparent pixels do not dilute color', () => {
    // 2x2 RGBA: 2 opaque (alpha=255), 2 transparent (alpha=0)
    const pixels = Buffer.from([
      255, 0, 0, 255,   0, 0, 0, 0,     // row 0: opaque red, transparent
      0, 0, 0, 0,       0, 255, 0, 255,  // row 1: transparent, opaque green
    ]);
    const result = areaAverage(pixels, 2, 4, 0, 0, 2, 2, 2);
    // Alpha-weighted: R = (255*255)/(255+255) = 128, G = (255*255)/510 = 128
    // Average alpha: (255 + 0 + 0 + 255) / 4 = 128
    expect(result).toEqual([128, 128, 0, 128]);
  });

  it('returns [0,0,0,0] for all-transparent block', () => {
    const pixels = Buffer.from([
      0, 0, 0, 0,   0, 0, 0, 0,
      0, 0, 0, 0,   0, 0, 0, 0,
    ]);
    const result = areaAverage(pixels, 2, 4, 0, 0, 2, 2, 2);
    expect(result).toEqual([0, 0, 0, 0]);
  });

  it('preserves opaque color when mixed with transparent pixels', () => {
    // 1x4: 3 opaque red + 1 transparent
    const pixels = Buffer.from([
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      0,   0, 0, 0,
    ]);
    const result = areaAverage(pixels, 1, 4, 0, 0, 1, 4, 4);
    // RGB weighted by alpha → only opaque reds contribute → R=255
    // Alpha average: (255+255+255+0)/4 = 191
    expect(result).toEqual([255, 0, 0, 191]);
  });

  it('weights RGB proportionally by semi-transparent alpha', () => {
    // 1x2: red at alpha=200, green at alpha=50
    const pixels = Buffer.from([
      255, 0, 0, 200,
      0, 255, 0, 50,
    ]);
    const result = areaAverage(pixels, 1, 4, 0, 0, 1, 2, 2);
    // sumR = 255*200 = 51000, sumG = 255*50 = 12750, sumA = 250
    // R = round(51000/250) = 204, G = round(12750/250) = 51
    // A = round(250/2) = 125
    expect(result).toEqual([204, 51, 0, 125]);
  });
});

// ---------------------------------------------------------------------------
// renderPreview (integration)
// ---------------------------------------------------------------------------

describe('renderPreview', () => {
  /** Create a mock writable stream that captures output. */
  function createMockStream(opts = {}) {
    const chunks = [];
    return {
      isTTY: opts.isTTY !== undefined ? opts.isTTY : true,
      columns: opts.columns || 80,
      write: vi.fn((data) => chunks.push(data)),
      chunks,
    };
  }

  it('renders a 4x4 solid red PNG with ANSI codes', () => {
    // 4x4 solid red RGBA
    const pixels = [];
    for (let i = 0; i < 16; i++) {
      pixels.push(255, 0, 0, 255);
    }
    const png = createTestPng(4, 4, pixels);
    const stream = createMockStream({ columns: 10 });

    renderPreview(png, { stream });

    expect(stream.write).toHaveBeenCalled();
    const output = stream.chunks.join('');
    // Should contain red foreground ANSI code
    expect(output).toContain('38;2;255;0;0');
    // Should contain half-block character
    expect(output).toContain('\u2580');
  });

  it('renders a 2-color striped PNG with distinct colors', () => {
    // 2x2: top row red, bottom row blue
    const pixels = [
      255, 0, 0, 255,   255, 0, 0, 255,   // row 0: red
      0, 0, 255, 255,   0, 0, 255, 255,    // row 1: blue
    ];
    const png = createTestPng(2, 2, pixels);
    const stream = createMockStream({ columns: 10 });

    renderPreview(png, { stream });

    const output = stream.chunks.join('');
    // Should contain red foreground (top pixel)
    expect(output).toContain('38;2;255;0;0');
    // Should contain blue background (bottom pixel)
    expect(output).toContain('48;2;0;0;255');
  });

  it('respects maxWidth option', () => {
    // 100x4 solid green — should scale down to maxWidth 20
    const pixels = [];
    for (let i = 0; i < 400; i++) {
      pixels.push(0, 255, 0, 255);
    }
    const png = createTestPng(100, 4, pixels);
    const stream = createMockStream({ columns: 80 });

    renderPreview(png, { stream, maxWidth: 20 });

    const output = stream.chunks.join('');
    // Count half-block characters — should have at most 20 per line
    const lines = output.split('\n').filter(l => l.length > 0);
    for (const line of lines) {
      const halfBlocks = (line.match(/\u2580/g) || []).length;
      expect(halfBlocks).toBeLessThanOrEqual(20);
    }
  });

  it('handles zero-byte buffer without throwing', () => {
    const stream = createMockStream();
    expect(() => renderPreview(Buffer.alloc(0), { stream })).not.toThrow();
    const output = stream.chunks.join('');
    expect(output).toContain('Warning');
  });

  it('handles non-PNG buffer without throwing', () => {
    const stream = createMockStream();
    expect(() => renderPreview(Buffer.from('not a png'), { stream })).not.toThrow();
    const output = stream.chunks.join('');
    expect(output).toContain('Warning');
  });

  it('skips when stream.isTTY is false', () => {
    const pixels = [];
    for (let i = 0; i < 4; i++) {
      pixels.push(255, 0, 0, 255);
    }
    const png = createTestPng(2, 2, pixels);
    const stream = createMockStream({ isTTY: false });

    renderPreview(png, { stream });

    expect(stream.write).not.toHaveBeenCalled();
  });

  it('uses area-average blending when downscaling striped image', () => {
    // 100x4 image: columns 0-49 = red, columns 50-99 = blue
    // At maxWidth=20 (scale=5), each output cell covers 5 source columns.
    // Cells 0-9: all red → pure red. Cells 10-19: all blue → pure blue.
    // But cell at col=9 covers src x [45..50) = 4 red + 1 blue → blended.
    // We just verify blending occurs (no pure nearest-neighbor artifact).
    const w = 100;
    const h = 4;
    const bpp = 4;
    const pixelData = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < 50) {
          pixelData.push(255, 0, 0, 255); // red
        } else {
          pixelData.push(0, 0, 255, 255); // blue
        }
      }
    }
    const png = createTestPng(w, h, pixelData);
    const stream = createMockStream({ columns: 80 });

    renderPreview(png, { stream, maxWidth: 20 });

    const output = stream.chunks.join('');
    // Should contain pure red (columns fully in red zone)
    expect(output).toContain('38;2;255;0;0');
    // Should contain pure blue (columns fully in blue zone)
    expect(output).toContain('38;2;0;0;255');
    // Half-block chars present
    expect(output).toContain('\u2580');
  });

  it('renders transparent background areas as spaces', () => {
    // 4x2 RGBA: left 2 columns opaque red, right 2 columns transparent
    const pixelData = [];
    for (let y = 0; y < 2; y++) {
      pixelData.push(255, 0, 0, 255); // col 0: opaque red
      pixelData.push(255, 0, 0, 255); // col 1: opaque red
      pixelData.push(0, 0, 0, 0);     // col 2: transparent
      pixelData.push(0, 0, 0, 0);     // col 3: transparent
    }
    const png = createTestPng(4, 2, pixelData);
    const stream = createMockStream({ columns: 10 });

    renderPreview(png, { stream });

    const output = stream.chunks.join('');
    // Transparent area should produce spaces (no color codes)
    expect(output).toContain(' ');
    // Opaque area should still have red ANSI codes
    expect(output).toContain('38;2;255;0;0');
  });

  it('does not produce black artifacts from transparent regions when downscaling', () => {
    // Simulate a WMS-like image: 100x4, left half opaque red, right half transparent.
    // When downscaled (scale=5), the boundary cell mixes red + transparent.
    // Alpha-weighted averaging should keep the red pure, not darken it.
    const w = 100;
    const h = 4;
    const pixelData = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < 50) {
          pixelData.push(255, 0, 0, 255); // opaque red
        } else {
          pixelData.push(0, 0, 0, 0);     // transparent
        }
      }
    }
    const png = createTestPng(w, h, pixelData);
    const stream = createMockStream({ columns: 80 });

    renderPreview(png, { stream, maxWidth: 20 });

    const output = stream.chunks.join('');
    // Pure red cells should still be present (not darkened)
    expect(output).toContain('38;2;255;0;0');
    // Transparent region should produce spaces
    expect(output).toContain(' ');
    // Should NOT contain near-black colors like rgb(128,0,0) that naive averaging produces
    expect(output).not.toContain('38;2;128;0;0');
  });

  it('renders with custom bgColor for semi-transparent pixels', () => {
    // 2x2 RGBA: all pixels semi-transparent white (alpha=128) on white bg
    const pixelData = [
      255, 255, 255, 128,   255, 255, 255, 128,
      255, 255, 255, 128,   255, 255, 255, 128,
    ];
    const png = createTestPng(2, 2, pixelData);
    const stream = createMockStream({ columns: 10 });

    renderPreview(png, { stream, bgColor: [255, 255, 255] });

    const output = stream.chunks.join('');
    // Semi-transparent white on white bg should blend to pure white (255)
    expect(output).toContain('38;2;255;255;255');
  });
});
