/**
 * ESC/POS Binary Document Encoder
 * Encodes MonochromeBitmap canvases into transport-independent ESC/POS byte streams.
 */

import { PrinterPaperWidth } from '../../../types';
import { ESC_POS_COMMANDS } from './commands';
import { MonochromeBitmap, PrinterRasterProfile, DEFAULT_80MM_PROFILE } from './raster';

export interface EscPosDocument {
  bytes: Uint8Array;
  paperWidth: PrinterPaperWidth;
  widthDots: number;
  estimatedHeightDots: number;
  profile: PrinterRasterProfile;
  textLines?: string[];
}

export interface EncodeOptions {
  cut?: boolean; // Send paper cut command (default: true)
  feedLines?: number; // Blank line feeds before cut (default: 4)
  chunkMaxHeight?: number; // Max vertical scanlines per GS v 0 command (default: 512)
  paperWidth?: PrinterPaperWidth;
  profile?: PrinterRasterProfile;
}

/**
 * Encodes a MonochromeBitmap into standard ESC/POS GS v 0 raster byte sequences.
 */
export function encodeRasterToEscPos(
  bitmap: MonochromeBitmap,
  options: EncodeOptions = {}
): EscPosDocument {
  const cut = options.cut !== false;
  const feedLines = options.feedLines ?? 4;
  const chunkMaxHeight = options.chunkMaxHeight || 512;
  const paperWidth: PrinterPaperWidth = options.paperWidth || (bitmap.width <= 384 ? '58mm' : '80mm');
  const profile = options.profile || DEFAULT_80MM_PROFILE;

  const chunks: Uint8Array[] = [];
  let totalByteCount = 0;

  // 1. ESC @ (Initialize printer hardware state)
  chunks.push(ESC_POS_COMMANDS.INITIALIZE);
  totalByteCount += ESC_POS_COMMANDS.INITIALIZE.length;

  // 2. Encode bitmap in vertical chunks to ensure buffer safety across all thermal printers
  const totalHeight = bitmap.height;
  const widthBytes = bitmap.widthBytes;

  let currentY = 0;
  while (currentY < totalHeight) {
    const chunkHeight = Math.min(chunkMaxHeight, totalHeight - currentY);
    const chunkHeader = ESC_POS_COMMANDS.RASTER_HEADER(widthBytes, chunkHeight, 0);
    chunks.push(chunkHeader);
    totalByteCount += chunkHeader.length;

    // Pack rows for this chunk
    const chunkPixelBytes = widthBytes * chunkHeight;
    const chunkData = new Uint8Array(chunkPixelBytes);

    for (let rowInChunk = 0; rowInChunk < chunkHeight; rowInChunk++) {
      const globalY = currentY + rowInChunk;
      const rowOffsetInPacked = rowInChunk * widthBytes;
      const rowOffsetInPixels = globalY * bitmap.width;

      for (let byteIdx = 0; byteIdx < widthBytes; byteIdx++) {
        let byteVal = 0;
        const bitStart = byteIdx * 8;

        for (let bit = 0; bit < 8; bit++) {
          const pixelX = bitStart + bit;
          if (pixelX < bitmap.width) {
            if (bitmap.pixels[rowOffsetInPixels + pixelX] === 1) {
              byteVal |= 0x80 >> bit; // MSB-first
            }
          }
        }

        chunkData[rowOffsetInPacked + byteIdx] = byteVal;
      }
    }

    chunks.push(chunkData);
    totalByteCount += chunkData.length;
    currentY += chunkHeight;
  }

  // 3. Line feeds before cutting
  if (feedLines > 0) {
    const feedCmd = ESC_POS_COMMANDS.FEED_LINES(feedLines);
    chunks.push(feedCmd);
    totalByteCount += feedCmd.length;
  }

  // 4. Paper Cut
  if (cut) {
    const cutCmd = ESC_POS_COMMANDS.PAPER_CUT_FEED_PARTIAL(feedLines > 0 ? 0 : 3);
    chunks.push(cutCmd);
    totalByteCount += cutCmd.length;
  }

  // 5. Concatenate all command buffers into a single contiguous Uint8Array
  const combinedBytes = new Uint8Array(totalByteCount);
  let offset = 0;
  for (const chunk of chunks) {
    combinedBytes.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    bytes: combinedBytes,
    paperWidth,
    widthDots: bitmap.width,
    estimatedHeightDots: bitmap.height,
    profile,
  };
}
