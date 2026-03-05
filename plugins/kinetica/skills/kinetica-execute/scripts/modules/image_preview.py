"""PNG-to-ANSI terminal preview module.

Renders a colored ASCII art approximation of a PNG image using the Unicode
half-block technique with 24-bit ANSI colors.  Each terminal cell encodes
2 vertical pixels (foreground = top, background = bottom) using U+2580 (▀).

Zero external dependencies — uses Python built-in zlib and struct.

Exported API:
    render_preview(png_bytes, *, max_width=0, stream=None)
"""

import math
import os
import struct
import sys
import zlib

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# PNG decoder (8-bit RGB / RGBA only)
# ---------------------------------------------------------------------------

def _paeth_predictor(a, b, c):
    """PNG Paeth predictor function."""
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _unfilter_row(filter_type, raw, prev, bpp):
    """Reverse PNG scanline filter for one row.

    Args:
        filter_type: 0-4 (None, Sub, Up, Average, Paeth)
        raw: Raw scanline bytes (without filter byte)
        prev: Previous (already-unfiltered) row, or None for first row
        bpp: Bytes per pixel (3 or 4)

    Returns:
        bytearray of unfiltered scanline
    """
    out = bytearray(raw)
    length = len(out)

    if filter_type == 0:
        return out

    for i in range(length):
        a = out[i - bpp] if i >= bpp else 0
        b = prev[i] if prev else 0

        if filter_type == 1:  # Sub
            out[i] = (out[i] + a) & 0xFF
        elif filter_type == 2:  # Up
            out[i] = (out[i] + b) & 0xFF
        elif filter_type == 3:  # Average
            out[i] = (out[i] + ((a + b) >> 1)) & 0xFF
        elif filter_type == 4:  # Paeth
            c = prev[i - bpp] if (prev and i >= bpp) else 0
            out[i] = (out[i] + _paeth_predictor(a, b, c)) & 0xFF

    return out


def decode_png(data):
    """Decode a PNG buffer into raw pixel data.

    Only supports 8-bit color types 2 (RGB) and 6 (RGBA).

    Args:
        data: Raw PNG file bytes

    Returns:
        dict with keys width, height, bpp, pixels (bytearray), or None
        on unsupported or corrupt input (never raises).
    """
    try:
        if not data or len(data) < 8:
            return None
        if data[:8] != _PNG_SIGNATURE:
            return None

        width = 0
        height = 0
        bit_depth = 0
        color_type = 0
        idat_chunks = []
        pos = 8

        while pos + 8 <= len(data):
            chunk_len = struct.unpack_from(">I", data, pos)[0]
            chunk_type = data[pos + 4:pos + 8]
            data_start = pos + 8

            if chunk_type == b"IHDR":
                width = struct.unpack_from(">I", data, data_start)[0]
                height = struct.unpack_from(">I", data, data_start + 4)[0]
                bit_depth = data[data_start + 8]
                color_type = data[data_start + 9]
            elif chunk_type == b"IDAT":
                idat_chunks.append(data[data_start:data_start + chunk_len])
            elif chunk_type == b"IEND":
                break

            pos = data_start + chunk_len + 4  # +4 for CRC

        if bit_depth != 8:
            return None
        if color_type not in (2, 6):
            return None
        if width == 0 or height == 0:
            return None

        bpp = 3 if color_type == 2 else 4
        compressed = b"".join(idat_chunks)
        raw = zlib.decompress(compressed)

        stride = width * bpp
        pixels = bytearray(height * stride)
        prev_row = None

        for y in range(height):
            row_start = y * (stride + 1)
            filter_type = raw[row_start]
            row_data = raw[row_start + 1:row_start + 1 + stride]
            unfiltered = _unfilter_row(filter_type, row_data, prev_row, bpp)
            pixels[y * stride:(y + 1) * stride] = unfiltered
            prev_row = unfiltered

        return {"width": width, "height": height, "bpp": bpp, "pixels": pixels}
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Scaling
# ---------------------------------------------------------------------------

def scale_to_fit(img_w, img_h, max_cols):
    """Compute output dimensions to fit an image within max_cols terminal columns.

    Does not upscale.  Accounts for 2:1 vertical pixel packing.

    Returns:
        dict with keys cols, rows, scale
    """
    if img_w <= max_cols:
        return {"cols": img_w, "rows": math.ceil(img_h / 2), "scale": 1}
    scale = img_w / max_cols
    cols = max_cols
    rows = math.ceil(img_h / (scale * 2))
    return {"cols": cols, "rows": rows, "scale": scale}


# ---------------------------------------------------------------------------
# Pixel sampling
# ---------------------------------------------------------------------------

def sample_pixel(pixels, img_w, bpp, x, y, img_h):
    """Nearest-neighbor sample a pixel, clamped to image bounds.

    Returns:
        tuple (r, g, b, a)
    """
    px = min(max(round(x), 0), img_w - 1)
    py = min(max(round(y), 0), img_h - 1)
    offset = (py * img_w + px) * bpp
    a = pixels[offset + 3] if bpp == 4 else 255
    return (pixels[offset], pixels[offset + 1], pixels[offset + 2], a)


def area_average(pixels, img_w, bpp, x0, y0, x1, y1, img_h):
    """Area-average (box filter) sample over a rectangle of source pixels.

    Averages all pixels in the integer grid covering [x0, x1) x [y0, y1),
    clamped to image bounds.  Falls back to sample_pixel at midpoint when the
    clamped rectangle is degenerate (zero area).

    Returns:
        tuple (r, g, b, a)
    """
    px_start = max(math.floor(x0), 0)
    py_start = max(math.floor(y0), 0)
    px_end = min(math.ceil(x1), img_w)
    py_end = min(math.ceil(y1), img_h)

    count = (px_end - px_start) * (py_end - py_start)
    if count <= 0:
        mid_x = (x0 + x1) / 2
        mid_y = (y0 + y1) / 2
        return sample_pixel(pixels, img_w, bpp, mid_x, mid_y, img_h)

    sum_r = 0
    sum_g = 0
    sum_b = 0
    sum_a = 0
    for py in range(py_start, py_end):
        row_base = py * img_w * bpp
        for px in range(px_start, px_end):
            offset = row_base + px * bpp
            a = pixels[offset + 3] if bpp == 4 else 255
            sum_r += pixels[offset] * a
            sum_g += pixels[offset + 1] * a
            sum_b += pixels[offset + 2] * a
            sum_a += a

    if sum_a == 0:
        return (0, 0, 0, 0)

    return (
        round(sum_r / sum_a),
        round(sum_g / sum_a),
        round(sum_b / sum_a),
        round(sum_a / count),
    )


# ---------------------------------------------------------------------------
# Alpha blending
# ---------------------------------------------------------------------------

_ALPHA_THRESHOLD = 4


def blend_with_bg(rgba, bg_color):
    """Alpha-over composite a pixel onto a background color.

    Args:
        rgba: (r, g, b, a) pixel
        bg_color: (r, g, b) background

    Returns:
        tuple (r, g, b) blended (fully opaque)
    """
    alpha = rgba[3] / 255
    return (
        round(rgba[0] * alpha + bg_color[0] * (1 - alpha)),
        round(rgba[1] * alpha + bg_color[1] * (1 - alpha)),
        round(rgba[2] * alpha + bg_color[2] * (1 - alpha)),
    )


# ---------------------------------------------------------------------------
# ANSI rendering
# ---------------------------------------------------------------------------

def pixel_to_ansi(top_rgba, bot_rgba, bg_color):
    """Produce an ANSI escape string for one half-block cell.

    Handles transparency: fully transparent pixels yield the terminal's
    native background (no color codes).
    """
    top_transparent = top_rgba[3] <= _ALPHA_THRESHOLD
    bot_transparent = bot_rgba[3] <= _ALPHA_THRESHOLD

    if top_transparent and bot_transparent:
        return " "

    if top_transparent:
        br, bg, bb = blend_with_bg(bot_rgba, bg_color)
        return f"\x1b[38;2;{br};{bg};{bb}m\u2584\x1b[0m"

    if bot_transparent:
        tr, tg, tb = blend_with_bg(top_rgba, bg_color)
        return f"\x1b[38;2;{tr};{tg};{tb}m\u2580\x1b[0m"

    tr, tg, tb = blend_with_bg(top_rgba, bg_color)
    br, bg, bb = blend_with_bg(bot_rgba, bg_color)
    return f"\x1b[38;2;{tr};{tg};{tb}m\x1b[48;2;{br};{bg};{bb}m\u2580\x1b[0m"


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def render_preview(png_bytes, *, max_width=0, stream=None, bg_color=None):
    """Render a PNG buffer as colored ASCII art to a writable stream.

    Args:
        png_bytes: Raw PNG file bytes
        max_width: Max columns (0 = auto-detect from terminal)
        stream: Writable file object (default: sys.stderr)
        bg_color: (r, g, b) background for alpha blending (default: (0, 0, 0))
    """
    if bg_color is None:
        bg_color = (0, 0, 0)
    if stream is None:
        stream = sys.stderr

    # Skip when output is piped (not a terminal)
    if not hasattr(stream, "isatty") or not stream.isatty():
        return

    try:
        img = decode_png(png_bytes)
        if not img:
            stream.write("Warning: could not decode PNG for preview\n")
            return

        if max_width <= 0:
            try:
                max_width = os.get_terminal_size().columns
            except (OSError, ValueError):
                max_width = 80

        dims = scale_to_fit(img["width"], img["height"], max_width)
        cols = dims["cols"]
        rows = dims["rows"]
        scale = dims["scale"]

        lines = []
        for row in range(rows):
            line_parts = []
            for col in range(cols):
                x0 = col * scale
                x1 = (col + 1) * scale
                top_y0 = row * 2 * scale
                top_y1 = (row * 2 + 1) * scale
                bot_y0 = top_y1
                bot_y1 = (row * 2 + 2) * scale

                if scale > 1:
                    top_rgba = area_average(
                        img["pixels"], img["width"], img["bpp"],
                        x0, top_y0, x1, top_y1, img["height"],
                    )
                    bot_rgba = area_average(
                        img["pixels"], img["width"], img["bpp"],
                        x0, bot_y0, x1, bot_y1, img["height"],
                    )
                else:
                    top_rgba = sample_pixel(
                        img["pixels"], img["width"], img["bpp"],
                        x0, top_y0, img["height"],
                    )
                    bot_rgba = sample_pixel(
                        img["pixels"], img["width"], img["bpp"],
                        x0, bot_y0, img["height"],
                    )
                line_parts.append(pixel_to_ansi(top_rgba, bot_rgba, bg_color))
            lines.append("".join(line_parts))
        stream.write("\n".join(lines) + "\n")
    except Exception:
        stream.write("Warning: preview rendering failed\n")
