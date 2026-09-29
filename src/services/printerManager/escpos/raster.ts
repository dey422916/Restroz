/**
 * ESC/POS Monochrome Raster Pipeline & Bitmap Canvas
 * Pure TypeScript 1-bit bitmap buffer supporting 203 DPI thermal raster rendering.
 */

import { PrinterPaperWidth, PrinterCalibration } from '../../../types';
import { getGlyphBitmap, FONT_WIDTH, FONT_HEIGHT } from './font8x16';

export interface PrinterRasterProfile {
  dpi: number;
  printableWidthDots: number;
  paperWidthMm: number;
}

export const DEFAULT_80MM_PROFILE: PrinterRasterProfile = {
  dpi: 203,
  printableWidthDots: 576, // 72mm @ 203 DPI
  paperWidthMm: 80,
};

export const DEFAULT_58MM_PROFILE: PrinterRasterProfile = {
  dpi: 203,
  printableWidthDots: 384, // 48mm @ 203 DPI
  paperWidthMm: 58,
};

/**
 * Returns raster profile for paper width with optional overrides.
 */
export function getRasterProfile(
  paperWidth: PrinterPaperWidth = '80mm',
  override?: Partial<PrinterRasterProfile>
): PrinterRasterProfile {
  const base = paperWidth === '58mm' ? DEFAULT_58MM_PROFILE : DEFAULT_80MM_PROFILE;
  if (!override) return base;
  return {
    dpi: override.dpi || base.dpi,
    printableWidthDots: override.printableWidthDots || base.printableWidthDots,
    paperWidthMm: override.paperWidthMm || base.paperWidthMm,
  };
}

/**
 * Converts millimeters to dots at a given DPI.
 * Standard formula: dots = round(mm * dpi / 25.4)
 */
export function mmToDots(mm: number, dpi: number = 203): number {
  return Math.round((mm * dpi) / 25.4);
}

/**
 * Converts dots to millimeters at a given DPI.
 */
export function dotsToMm(dots: number, dpi: number = 203): number {
  return (dots * 25.4) / dpi;
}

export interface DrawTextOptions {
  bold?: boolean;
  scaleX?: number; // 1 = 8px wide, 2 = 16px wide
  scaleY?: number; // 1 = 16px tall, 2 = 32px tall
  invert?: boolean; // white text on black background
}

/**
 * High-performance 1-bit Monochrome Bitmap Canvas
 */
export class MonochromeBitmap {
  public readonly width: number;
  public readonly height: number;
  public readonly widthBytes: number;
  // Flat byte array: 1 = black pixel (print dot), 0 = white pixel (no dot)
  public readonly pixels: Uint8Array;

  constructor(width: number, height: number, initialPixels?: Uint8Array) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid bitmap dimensions: ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    // Row width in bytes when packed to 1-bit MSB (must be 8-bit aligned for ESC/POS GS v 0)
    this.widthBytes = Math.ceil(width / 8);

    if (initialPixels && initialPixels.length === width * height) {
      this.pixels = new Uint8Array(initialPixels);
    } else {
      this.pixels = new Uint8Array(width * height);
    }
  }

  /**
   * Sets a pixel at (x, y) to 1 (black) or 0 (white).
   */
  public setPixel(x: number, y: number, value: number = 1): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.pixels[y * this.width + x] = value ? 1 : 0;
  }

  /**
   * Gets pixel value at (x, y). Returns 0 if out of bounds.
   */
  public getPixel(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.pixels[y * this.width + x];
  }

  /**
   * Fills a rectangular region with 1 (black) or 0 (white).
   */
  public fillRect(x: number, y: number, w: number, h: number, value: number = 1): void {
    const startX = Math.max(0, x);
    const startY = Math.max(0, y);
    const endX = Math.min(this.width, x + w);
    const endY = Math.min(this.height, y + h);
    const val = value ? 1 : 0;

    for (let currY = startY; currY < endY; currY++) {
      const rowOffset = currY * this.width;
      for (let currX = startX; currX < endX; currX++) {
        this.pixels[rowOffset + currX] = val;
      }
    }
  }

  /**
   * Draws a horizontal line with selectable style and thickness.
   */
  public drawHorizontalLine(
    x: number,
    y: number,
    width: number,
    thickness: number = 1,
    style: 'solid' | 'dashed' | 'dotted' | 'double' = 'solid'
  ): void {
    if (style === 'double') {
      this.drawHorizontalLine(x, y, width, 1, 'solid');
      this.drawHorizontalLine(x, y + 2, width, 1, 'solid');
      return;
    }

    const endX = Math.min(this.width, x + width);
    for (let currX = Math.max(0, x); currX < endX; currX++) {
      let draw = true;
      if (style === 'dashed') {
        // 6px dash, 4px gap
        draw = (currX - x) % 10 < 6;
      } else if (style === 'dotted') {
        // 2px dot, 2px gap
        draw = (currX - x) % 4 < 2;
      }

      if (draw) {
        for (let t = 0; t < thickness; t++) {
          this.setPixel(currX, y + t, 1);
        }
      }
    }
  }

  /**
   * Draws a single character glyph at (x, y) with optional scaling and bolding.
   */
  public drawChar(
    char: string,
    x: number,
    y: number,
    options: DrawTextOptions = {}
  ): number {
    const codePoint = char.codePointAt(0) || 32;
    const glyphBytes = getGlyphBitmap(codePoint);
    const scaleX = Math.max(1, options.scaleX || 1);
    const scaleY = Math.max(1, options.scaleY || 1);
    const bold = Boolean(options.bold);
    const invert = Boolean(options.invert);

    const charWidth = FONT_WIDTH * scaleX;
    const charHeight = FONT_HEIGHT * scaleY;

    if (invert) {
      this.fillRect(x, y, charWidth, charHeight, 1);
    }

    for (let row = 0; row < FONT_HEIGHT; row++) {
      const rowByte = glyphBytes[row];
      for (let col = 0; col < FONT_WIDTH; col++) {
        // MSB is leftmost pixel in glyph byte
        const isBitSet = (rowByte & (0x80 >> col)) !== 0;
        if (isBitSet) {
          const pixelVal = invert ? 0 : 1;
          for (let sy = 0; sy < scaleY; sy++) {
            const py = y + row * scaleY + sy;
            for (let sx = 0; sx < scaleX; sx++) {
              const px = x + col * scaleX + sx;
              this.setPixel(px, py, pixelVal);
              if (bold) {
                // Thicken horizontally by 1 dot
                this.setPixel(px + 1, py, pixelVal);
              }
            }
          }
        }
      }
    }

    return charWidth + (bold ? 1 : 0);
  }

  /**
   * Draws a string of text at (x, y) with automatic character spacing.
   */
  public drawText(
    text: string,
    x: number,
    y: number,
    options: DrawTextOptions = {}
  ): number {
    let cursorX = x;
    for (const char of text) {
      if (char === '\n') {
        // Line breaks handled by higher-level renderer
        continue;
      }
      const advancedWidth = this.drawChar(char, cursorX, y, options);
      cursorX += advancedWidth;
    }
    return cursorX - x;
  }

  /**
   * Draws a source bitmap into this canvas at (destX, destY).
   */
  public drawBitmap(
    destX: number,
    destY: number,
    src: MonochromeBitmap,
    options?: { invert?: boolean }
  ): void {
    const invert = Boolean(options?.invert);
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const val = src.getPixel(x, y);
        if (val) {
          this.setPixel(destX + x, destY + y, invert ? 0 : 1);
        } else if (invert) {
          this.setPixel(destX + x, destY + y, 1);
        }
      }
    }
  }

  /**
   * Packs the monochrome canvas into MSB-first 1-bit bytes ready for ESC/POS GS v 0.
   * Total bytes = widthBytes * height.
   */
  public packTo1BitMsb(): Uint8Array {
    const totalBytes = this.widthBytes * this.height;
    const packed = new Uint8Array(totalBytes);

    for (let y = 0; y < this.height; y++) {
      const rowOffsetInPacked = y * this.widthBytes;
      const rowOffsetInPixels = y * this.width;

      for (let byteIdx = 0; byteIdx < this.widthBytes; byteIdx++) {
        let byteVal = 0;
        const bitStart = byteIdx * 8;

        for (let bit = 0; bit < 8; bit++) {
          const pixelX = bitStart + bit;
          if (pixelX < this.width) {
            const pixel = this.pixels[rowOffsetInPixels + pixelX];
            if (pixel === 1) {
              byteVal |= 0x80 >> bit; // MSB-first
            }
          }
        }

        packed[rowOffsetInPacked + byteIdx] = byteVal;
      }
    }

    return packed;
  }

  /**
   * Generates ASCII art representation of the bitmap for test debugging.
   */
  public toAsciiArt(maxWidth: number = 72): string {
    const stepX = Math.max(1, Math.round(this.width / maxWidth));
    const stepY = stepX * 2; // Aspect ratio adjustment for terminal fonts
    const lines: string[] = [];

    for (let y = 0; y < this.height; y += stepY) {
      let line = '';
      for (let x = 0; x < this.width; x += stepX) {
        let isBlack = false;
        // Sample block
        for (let sy = 0; sy < stepY && y + sy < this.height; sy++) {
          for (let sx = 0; sx < stepX && x + sx < this.width; sx++) {
            if (this.getPixel(x + sx, y + sy) === 1) {
              isBlack = true;
              break;
            }
          }
          if (isBlack) break;
        }
        line += isBlack ? '#' : ' ';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  /**
   * Converts bitmap to 1-bit uncompressed BMP byte array for debug preview/rendering.
   */
  public toBmpBytes(): Uint8Array {
    const rowSize = Math.floor((this.width + 31) / 32) * 4; // 4-byte padded row
    const pixelArraySize = rowSize * this.height;
    const fileSize = 14 + 40 + 8 + pixelArraySize; // FileHeader + InfoHeader + ColorTable(2) + Pixels

    const buffer = new Uint8Array(fileSize);
    const view = new DataView(buffer.buffer);

    // --- BITMAP FILE HEADER (14 bytes) ---
    buffer[0] = 0x42; // 'B'
    buffer[1] = 0x4D; // 'M'
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true); // Reserved
    view.setUint32(10, 14 + 40 + 8, true); // Offset to pixel data (62)

    // --- BITMAP INFO HEADER (40 bytes) ---
    view.setUint32(14, 40, true); // Header size
    view.setInt32(18, this.width, true); // Width
    view.setInt32(22, this.height, true); // Bottom-up height
    view.setUint16(26, 1, true); // Color planes
    view.setUint16(28, 1, true); // Bits per pixel (1-bit monochrome)
    view.setUint32(30, 0, true); // BI_RGB (no compression)
    view.setUint32(34, pixelArraySize, true);
    view.setInt32(38, 8000, true); // Horizontal resolution
    view.setInt32(42, 8000, true); // Vertical resolution
    view.setUint32(46, 2, true); // Colors in palette
    view.setUint32(50, 2, true); // Important colors

    // --- COLOR TABLE (2 colors: 0=White, 1=Black) ---
    // Color 0: White (RGB: 255, 255, 255, 0)
    buffer[54] = 0xFF;
    buffer[55] = 0xFF;
    buffer[56] = 0xFF;
    buffer[57] = 0x00;
    // Color 1: Black (RGB: 0, 0, 0, 0)
    buffer[58] = 0x00;
    buffer[59] = 0x00;
    buffer[60] = 0x00;
    buffer[61] = 0x00;

    // --- PIXEL DATA (Bottom-up scanlines) ---
    const dataOffset = 62;
    for (let y = 0; y < this.height; y++) {
      const srcY = this.height - 1 - y; // Bottom-up
      const rowStart = dataOffset + y * rowSize;

      for (let byteX = 0; byteX < rowSize; byteX++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = byteX * 8 + bit;
          if (pixelX < this.width) {
            const pixel = this.pixels[srcY * this.width + pixelX];
            if (pixel === 1) {
              byteVal |= 0x80 >> bit; // 1 = Color index 1 (Black)
            }
          }
        }
        buffer[rowStart + byteX] = byteVal;
      }
    }

    return buffer;
  }
}
