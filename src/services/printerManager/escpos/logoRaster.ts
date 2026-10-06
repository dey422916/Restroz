/**
 * ESC/POS Thermal Brand Logo Rasterizer
 * Converts restaurant logo URLs/DataURIs into universally compatible 24-dot double-density ESC * sequences.
 * Strictly formatted for 58mm (384 dots) and 80mm (576 dots) thermal printers.
 * Works on 100% of ESC/POS printers (including BLE portable printers that lack GS v 0 support).
 */

const logoRasterCache = new Map<string, Uint8Array>();

export async function generateEscPosLogoRaster(
  logoUrl?: string | null,
  paperWidth: '58mm' | '80mm' = '58mm'
): Promise<Uint8Array | null> {
  if (!logoUrl || typeof logoUrl !== 'string' || !logoUrl.trim()) {
    return null;
  }

  // Handle potential JSON string or array
  let trimmedUrl = logoUrl.trim();
  if (trimmedUrl.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmedUrl);
      if (Array.isArray(parsed) && parsed[0]) {
        trimmedUrl = String(parsed[0]).trim();
      }
    } catch {}
  }

  if (!trimmedUrl || (!trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('data:image/'))) {
    return null;
  }

  const cacheKey = `${trimmedUrl}_${paperWidth}`;
  const cached = logoRasterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return null;
    }

    // Wrap image loading in a promise with 3-second timeout
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => {
        reject(new Error('Logo load timeout'));
      }, 3000);

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

    // Full printable width dots (384 for 58mm, 576 for 80mm)
    const fullWidthDots = paperWidth === '58mm' ? 384 : 576;

    // Target logo max dimensions (centered within fullWidthDots)
    const maxLogoWidth = paperWidth === '58mm' ? 240 : 340;
    const maxLogoHeight = paperWidth === '58mm' ? 160 : 200;

    let scaledWidth = img.width;
    let scaledHeight = img.height;

    // Scale down maintaining aspect ratio
    if (scaledWidth > maxLogoWidth) {
      const scale = maxLogoWidth / scaledWidth;
      scaledWidth = maxLogoWidth;
      scaledHeight = Math.round(img.height * scale);
    }

    if (scaledHeight > maxLogoHeight) {
      const scale = maxLogoHeight / scaledHeight;
      scaledHeight = maxLogoHeight;
      scaledWidth = Math.round(scaledWidth * scale);
    }

    scaledWidth = Math.max(8, scaledWidth);
    scaledHeight = Math.max(8, scaledHeight);

    const canvasWidth = fullWidthDots;
    const canvasHeight = scaledHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Fill entire full-width canvas with solid white (flatten transparency to white)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Draw image in the exact horizontal center of the full-width canvas
    const drawX = Math.max(0, Math.round((canvasWidth - scaledWidth) / 2));
    ctx.drawImage(img, drawX, 0, scaledWidth, scaledHeight);

    const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imgData.data; // RGBA Uint8ClampedArray

    // 3. Convert to 2D grayscale array with transparency handling
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
          // Standard ITU-R BT.601 luminance
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

    // 5. Pack into universal 24-dot double-density ESC * 33 command sequence
    // This splits the bitmap into horizontal bands of 24 scanlines each.
    // Each band is: ESC * 33 nL nH [3 * canvasWidth bytes] 0x0A
    const numBands = Math.ceil(canvasHeight / 24);
    const nL = canvasWidth & 0xFF;
    const nH = (canvasWidth >> 8) & 0xFF;
    const bytesPerBand = 3 * canvasWidth;

    const chunks: Uint8Array[] = [];
    // Set 24-dot line spacing (ESC 3 24 = 0x1B 0x33 0x18)
    chunks.push(new Uint8Array([0x1B, 0x33, 24]));

    for (let b = 0; b < numBands; b++) {
      const bandStartY = b * 24;
      const bandHeader = [0x1B, 0x2A, 33, nL, nH];
      const bandData = new Uint8Array(bandHeader.length + bytesPerBand + 1);
      bandData.set(bandHeader, 0);

      let offset = bandHeader.length;
      for (let x = 0; x < canvasWidth; x++) {
        let byte0 = 0;
        let byte1 = 0;
        let byte2 = 0;

        for (let dot = 0; dot < 8; dot++) {
          const y = bandStartY + dot;
          if (y < canvasHeight && mono[y][x] === 1) {
            byte0 |= 0x80 >> dot;
          }
        }

        for (let dot = 0; dot < 8; dot++) {
          const y = bandStartY + 8 + dot;
          if (y < canvasHeight && mono[y][x] === 1) {
            byte1 |= 0x80 >> dot;
          }
        }

        for (let dot = 0; dot < 8; dot++) {
          const y = bandStartY + 16 + dot;
          if (y < canvasHeight && mono[y][x] === 1) {
            byte2 |= 0x80 >> dot;
          }
        }

        bandData[offset++] = byte0;
        bandData[offset++] = byte1;
        bandData[offset++] = byte2;
      }

      bandData[offset] = 0x0A; // LF - execute printing for this 24-dot band
      chunks.push(bandData);
    }

    // Restore standard line spacing (ESC 2 = 0x1B 0x32), followed by a clean line feed
    chunks.push(new Uint8Array([0x1B, 0x32, 0x0A]));

    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
    }

    // Cache successful raster
    logoRasterCache.set(cacheKey, result);

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        `[THERMAL_LOGO]\n` +
        `LogoSource: ${trimmedUrl}\n` +
        `Paper: ${paperWidth}\n` +
        `OriginalDimensions: ${img.width}x${img.height}\n` +
        `ScaledDimensions: ${scaledWidth}x${scaledHeight}\n` +
        `Canvas: ${canvasWidth}x${canvasHeight}\n` +
        `Bands: ${numBands} (24-dot/band)\n` +
        `TotalCommandBytes: ${result.length}\n` +
        `RasterCommand: ESC_STAR_33\n` +
        `Result: SUCCESS`
      );
    }

    return result;
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[THERMAL_LOGO] Logo rasterization failed, continuing with text-only bill:', err);
    }
    return null;
  }
}
