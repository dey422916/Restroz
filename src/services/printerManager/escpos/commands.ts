/**
 * ESC/POS Command Byte Sequences
 * Standard EPSON ESC/POS protocol commands.
 */

export const ESC = 0x1B;
export const FS = 0x1C;
export const GS = 0x1D;
export const DLE = 0x10;
export const EOT = 0x04;
export const NUL = 0x00;
export const LF = 0x0A;
export const CR = 0x0D;
export const HT = 0x09;
export const FF = 0x0C;

export const ESC_POS_COMMANDS = {
  // Initialization
  INITIALIZE: new Uint8Array([ESC, 0x40]), // ESC @

  // Font Selection & Scale
  FONT_A: new Uint8Array([ESC, 0x4D, 0x00]), // ESC M 0 (Font A 12x24)
  FONT_B: new Uint8Array([ESC, 0x4D, 0x01]), // ESC M 1 (Font B 9x17)
  TEXT_NORMAL: new Uint8Array([GS, 0x21, 0x00]), // GS ! 0 (Normal 1x1)
  TEXT_DOUBLE_HEIGHT: new Uint8Array([GS, 0x21, 0x01]), // GS ! 1 (1x width, 2x height)
  TEXT_DOUBLE_WIDTH: new Uint8Array([GS, 0x21, 0x10]), // GS ! 16 (2x width, 1x height)
  TEXT_DOUBLE_BOTH: new Uint8Array([GS, 0x21, 0x11]), // GS ! 17 (2x width, 2x height)

  // Bold Emphasis
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]), // ESC E 1
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]), // ESC E 0

  // Line Feeds & Spacing
  LINE_FEED: new Uint8Array([LF]), // LF
  FEED_LINES: (n: number): Uint8Array => new Uint8Array([ESC, 0x64, Math.max(1, Math.min(255, n))]), // ESC d n

  // Text Alignment
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]), // ESC a 0
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]), // ESC a 1
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]), // ESC a 2

  // Margins & Printable Area Width
  MARGIN_LEFT_ZERO: new Uint8Array([GS, 0x4C, 0x00, 0x00]), // GS L 0 0 (Left margin = 0)
  PRINT_AREA_58MM: new Uint8Array([GS, 0x57, 0x80, 0x01]), // GS W 384 dots (58mm @ 203 DPI)
  PRINT_AREA_80MM: new Uint8Array([GS, 0x57, 0x40, 0x02]), // GS W 576 dots (80mm @ 203 DPI)

  // Cut Operations
  PAPER_CUT_FULL: new Uint8Array([GS, 0x56, 0x00]), // GS V 0
  PAPER_CUT_PARTIAL: new Uint8Array([GS, 0x56, 0x01]), // GS V 1
  PAPER_CUT_FEED_PARTIAL: (feedLines: number = 3): Uint8Array =>
    new Uint8Array([GS, 0x56, 0x42, Math.max(0, Math.min(255, feedLines))]), // GS V 'B' n (GS V 66 n)

  // Hardware Cash Drawer Kick (Standard 24V pin 2 / 5)
  DRAWER_KICK_PIN2: new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xFA]), // ESC p 0 25 250
  DRAWER_KICK_PIN5: new Uint8Array([ESC, 0x70, 0x01, 0x19, 0xFA]), // ESC p 1 25 250

  /**
   * GS v 0 (Raster bit image) Header Generator
   * Format: GS v 0 m xL xH yL yH
   * m = 0 (Normal mode: 1x width, 1x height)
   * xL, xH = width in bytes (little-endian)
   * yL, yH = height in dots (little-endian)
   */
  RASTER_HEADER: (widthBytes: number, heightDots: number, mode: number = 0): Uint8Array => {
    const xL = widthBytes & 0xFF;
    const xH = (widthBytes >> 8) & 0xFF;
    const yL = heightDots & 0xFF;
    const yH = (heightDots >> 8) & 0xFF;
    return new Uint8Array([GS, 0x76, 0x30, mode & 0x03, xL, xH, yL, yH]);
  },
};
