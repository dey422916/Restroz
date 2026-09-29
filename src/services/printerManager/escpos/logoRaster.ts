/**
 * ESC/POS Thermal Brand Logo Rasterizer
 * Converts restaurant logo URLs/DataURIs into centered 1-bit monochrome GS v 0 raster sequences.
 * Strictly formatted for 58mm (160–200 dots max) and 80mm (220–300 dots max) thermal printers.
 */

export async function generateEscPosLogoRaster(
  logoUrl?: string | null,
  paperWidth: '58mm' | '80mm' = '58mm'
): Promise<Uint8Array | null> {
  if (!logoUrl || typeof logoUrl !== 'string' || !logoUrl.trim()) {
    return null;
  }

  const trimmedUrl = logoUrl.trim();
  const maxDots = paperWidth === '58mm' ? 180 : 260;

  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return null;
    }

    // Wrap image loading in a promise with 2-second timeout
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => {
        reject(new Error('Logo load timeout'));
      }, 2000);

      image.onload = () => {
        clearTimeout(timeout);
        resolve(image);
      };
      image.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
      image.src = trimmedUrl;
    });

    if (!img.width || !img.height) {
      return null;
    }

    // Calculate dimensions preserving aspect ratio
    let targetWidth = img.width;
    let targetHeight = img.height;

    if (targetWidth > maxDots) {
      const scale = maxDots / targetWidth;
      targetWidth = maxDots;
      targetHeight = Math.round(img.height * scale);
    }

    // Limit maximum height to avoid excessive paper feed (max 140 dots for 58mm, 180 for 80mm)
    const maxHeight = paperWidth === '58mm' ? 140 : 180;
    if (targetHeight > maxHeight) {
      const scale = maxHeight / targetHeight;
      targetHeight = maxHeight;
      targetWidth = Math.round(targetWidth * scale);
    }

    // ESC/POS GS v 0 requires width to be byte-aligned (widthBytes = Math.ceil(targetWidth / 8))
    const widthBytes = Math.ceil(targetWidth / 8);
    const canvasWidth = widthBytes * 8;
    const canvasHeight = Math.max(1, targetHeight);

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fill entire canvas with white (so transparent backgrounds flatten to white)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Draw image centered horizontally in canvas buffer
    const drawX = Math.max(0, Math.round((canvasWidth - targetWidth) / 2));
    ctx.drawImage(img, drawX, 0, targetWidth, targetHeight);

    const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imgData.data; // RGBA Uint8ClampedArray

    // 3. Convert to 2D grayscale array
    const gray: number[][] = [];
    for (let y = 0; y < canvasHeight; y++) {
      gray[y] = new Array(canvasWidth);
      for (let x = 0; x < canvasWidth; x++) {
        const idx = (y * canvasWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (a < 128) {
          // Transparent pixel -> white (255)
          gray[y][x] = 255;
        } else {
          // Standard luminance formula
          gray[y][x] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }
    }

    // 4. Floyd-Steinberg Error Diffusion Dithering for crisp 1-bit thermal output
    const mono: number[][] = [];
    for (let y = 0; y < canvasHeight; y++) {
      mono[y] = new Array(canvasWidth);
      for (let x = 0; x < canvasWidth; x++) {
        const oldPixel = gray[y][x];
        const newPixel = oldPixel < 140 ? 0 : 255; // 0 = black (dot), 255 = white (no dot)
        mono[y][x] = newPixel === 0 ? 1 : 0;
        const quantError = oldPixel - newPixel;

        if (x + 1 < canvasWidth) {
          gray[y][x + 1] += quantError * (7 / 16);
        }
        if (y + 1 < canvasHeight) {
          if (x - 1 >= 0) {
            gray[y + 1][x - 1] += quantError * (3 / 16);
          }
          gray[y + 1][x] += quantError * (5 / 16);
          if (x + 1 < canvasWidth) {
            gray[y + 1][x + 1] += quantError * (1 / 16);
          }
        }
      }
    }

    // 5. Pack into ESC/POS GS v 0 raster command bytes
    // Sequence:
    // ESC a 1 (Align Center)
    // GS v 0 0 xL xH yL yH (Raster header)
    // <raw bit data>
    // LF (Line feed)
    // ESC a 1 (Align Center)
    const rasterDataSize = widthBytes * canvasHeight;
    const header = [
      0x1B, 0x61, 0x01, // ESC a 1 (Center)
      0x1D, 0x76, 0x30, 0x00, // GS v 0 0 (Normal mode)
      widthBytes & 0xFF, (widthBytes >> 8) & 0xFF, // xL, xH (bytes per scanline)
      canvasHeight & 0xFF, (canvasHeight >> 8) & 0xFF, // yL, yH (number of scanlines)
    ];
    const footer = [
      0x0A, // LF
      0x1B, 0x61, 0x01, // ESC a 1 (Keep center alignment for restaurant name)
    ];

    const result = new Uint8Array(header.length + rasterDataSize + footer.length);
    result.set(header, 0);

    let offset = header.length;
    for (let y = 0; y < canvasHeight; y++) {
      for (let b = 0; b < widthBytes; b++) {
        let byteVal = 0;
        const bitStart = b * 8;
        for (let bit = 0; bit < 8; bit++) {
          const px = bitStart + bit;
          if (px < canvasWidth && mono[y][px] === 1) {
            byteVal |= 0x80 >> bit; // MSB first
          }
        }
        result[offset++] = byteVal;
      }
    }

    result.set(footer, offset);

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        `[ESC_POS_LOGO]\n` +
        `Logo processed: ${canvasWidth}x${canvasHeight} dots\n` +
        `Bytes per row: ${widthBytes}\n` +
        `Total bytes: ${result.length}\n` +
        `Centered: YES`
      );
    }

    return result;
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ESC_POS_LOGO] Logo rasterization failed, falling back to text header:', err);
    }
    return null;
  }
}
