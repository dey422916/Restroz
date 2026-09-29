/**
 * High-Performance ESC/POS Native Text Document Builder
 * Enforces strict 32-character maximum line width for 58mm thermal printers (Font A 12x24)
 * and 48-character width for 80mm thermal printers.
 */

import { PrinterPaperWidth } from '../../../types';
import { ESC_POS_COMMANDS } from './commands';
import { EscPosDocument } from './encoder';
import { DEFAULT_58MM_PROFILE, DEFAULT_80MM_PROFILE } from './raster';

export interface EscPosTextStyle {
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  scale?: 'normal' | 'double_height' | 'double_width' | 'double_both';
}

/**
 * Word wraps text into lines that do not exceed maxChars without splitting words unnecessarily.
 */
export function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [''];
  const sanitized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const inputLines = sanitized.split('\n');
  const resultLines: string[] = [];

  for (const rawLine of inputLines) {
    if (rawLine.length <= maxChars) {
      resultLines.push(rawLine);
      continue;
    }

    const words = rawLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (!word) {
        if (currentLine.length + 1 <= maxChars) {
          currentLine += ' ';
        }
        continue;
      }

      // If a single word is longer than maxChars, hard break it
      if (word.length > maxChars) {
        if (currentLine) {
          resultLines.push(currentLine);
          currentLine = '';
        }
        let remainingWord = word;
        while (remainingWord.length > maxChars) {
          resultLines.push(remainingWord.substring(0, maxChars));
          remainingWord = remainingWord.substring(maxChars);
        }
        currentLine = remainingWord;
        continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length <= maxChars) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          resultLines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      resultLines.push(currentLine);
    }
  }

  return resultLines.length > 0 ? resultLines : [''];
}

/**
 * Formats key-value pair line right-padded and right-aligned to width
 */
export function formatKeyValue(key: string, value: string, width: number): string {
  const k = key.trim();
  const v = value.trim().replace(/₹/g, 'INR ');
  if (k.length + v.length + 1 <= width) {
    const spaces = width - (k.length + v.length);
    return k + ' '.repeat(spaces) + v;
  }
  return k + '\n' + ' '.repeat(Math.max(0, width - v.length)) + v;
}

/**
 * Formats multi-column row with specified column widths and single space separator
 */
export function formatColumns(cols: Array<{ text: string; width: number; align?: 'left' | 'right' }>): string {
  return cols
    .map((c) => {
      const align = c.align || 'left';
      const text = c.text || '';
      if (align === 'right') {
        return text.padStart(c.width, ' ').substring(0, c.width);
      }
      return text.padEnd(c.width, ' ').substring(0, c.width);
    })
    .join(' ');
}

export interface EscPosTextBuilderOptions {
  isBle?: boolean;
  transport?: string;
  disablePaperAreaCmds?: boolean;
  disableCutCmd?: boolean;
}

export class EscPosTextBuilder {
  public readonly paperWidth: PrinterPaperWidth;
  public readonly lineWidth: number; // 32 for 58mm, 48 for 80mm
  public readonly isBle: boolean;
  public readonly disableCutCmd: boolean;
  private chunks: Uint8Array[] = [];
  private encoder = new TextEncoder();

  constructor(
    paperWidth: PrinterPaperWidth = '58mm',
    printerName?: string,
    options?: EscPosTextBuilderOptions
  ) {
    this.paperWidth = paperWidth === '58mm' ? '58mm' : '80mm';
    this.lineWidth = this.paperWidth === '58mm' ? 32 : 42;
    this.isBle = Boolean(options?.isBle || options?.disablePaperAreaCmds || this.paperWidth === '58mm');
    this.disableCutCmd = Boolean(options?.disableCutCmd || options?.isBle || this.paperWidth === '58mm');

    const transportStr = options?.transport ? options.transport.toUpperCase() : (this.isBle ? 'BLUETOOTH' : 'PRINT_AGENT');
    if (this.paperWidth === '80mm') {
      console.log(
        `[80MM_RUNTIME]\n` +
        `Printer: ${printerName || 'RP3150 STAR(U) 1'}\n` +
        `Paper Width: 80mm\n` +
        `Renderer Width: 42\n` +
        `Font: Font A\n` +
        `Scale: normal 1x1\n` +
        `Transport: ${transportStr}`
      );
    } else {
      console.log(
        `[58MM_RUNTIME]\n` +
        `Printer: ${printerName || 'POS58 Printer'}\n` +
        `Paper Width: 58mm\n` +
        `Renderer Width: 32\n` +
        `Font: Font A\n` +
        `Scale: normal 1x1\n` +
        `Transport: ${transportStr}`
      );
    }

    // 1. Initialize printer hardware state (ESC @)
    this.appendBytes(ESC_POS_COMMANDS.INITIALIZE);

    // 2. Select Font A (12x24 dots) - ESC M 0
    this.appendBytes(ESC_POS_COMMANDS.FONT_A);

    // 3. Reset text scale to normal 1x1 (GS ! 0x00)
    this.appendBytes(ESC_POS_COMMANDS.TEXT_NORMAL);

    // 4. Bold off (ESC E 0)
    this.appendBytes(ESC_POS_COMMANDS.BOLD_OFF);

    // 5. Align left (ESC a 0)
    this.appendBytes(ESC_POS_COMMANDS.ALIGN_LEFT);
  }

  private appendBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
  }

  /**
   * Resets printer formatting state cleanly to standard Font A, 1x1 scale, left-aligned, not bold.
   * Prevents font width, double height, or alignment from leaking across sections.
   */
  public resetToNormal(): this {
    this.appendBytes(ESC_POS_COMMANDS.FONT_A);
    this.appendBytes(ESC_POS_COMMANDS.TEXT_NORMAL);
    this.appendBytes(ESC_POS_COMMANDS.BOLD_OFF);
    this.appendBytes(ESC_POS_COMMANDS.ALIGN_LEFT);
    return this;
  }

  /**
   * Appends raw binary command sequence (e.g. raster image bytes) directly to the document
   * and immediately resets font and alignment state.
   */
  public addRawBytes(bytes: Uint8Array): this {
    if (bytes && bytes.length > 0) {
      this.appendBytes(bytes);
      this.resetToNormal();
    }
    return this;
  }

  private appendString(str: string): void {
    // Replace rupee symbol ₹ with INR to prevent code page corruption
    const sanitized = str.replace(/₹/g, 'INR ');
    this.chunks.push(this.encoder.encode(sanitized));
  }

  /**
   * Applies alignment command
   */
  public setAlign(align: 'left' | 'center' | 'right' = 'left'): this {
    if (align === 'center') {
      this.appendBytes(ESC_POS_COMMANDS.ALIGN_CENTER);
    } else if (align === 'right') {
      this.appendBytes(ESC_POS_COMMANDS.ALIGN_RIGHT);
    } else {
      this.appendBytes(ESC_POS_COMMANDS.ALIGN_LEFT);
    }
    return this;
  }

  /**
   * Applies bold command
   */
  public setBold(bold: boolean = false): this {
    this.appendBytes(bold ? ESC_POS_COMMANDS.BOLD_ON : ESC_POS_COMMANDS.BOLD_OFF);
    return this;
  }

  /**
   * Applies text scale command
   */
  public setScale(scale: 'normal' | 'double_height' | 'double_width' | 'double_both' = 'normal'): this {
    if (scale === 'double_height') {
      this.appendBytes(ESC_POS_COMMANDS.TEXT_DOUBLE_HEIGHT);
    } else if (scale === 'double_width') {
      this.appendBytes(ESC_POS_COMMANDS.TEXT_DOUBLE_WIDTH);
    } else if (scale === 'double_both') {
      this.appendBytes(ESC_POS_COMMANDS.TEXT_DOUBLE_BOTH);
    } else {
      this.appendBytes(ESC_POS_COMMANDS.TEXT_NORMAL);
    }
    return this;
  }

  private textLines: string[] = [];

  public getTextLines(): string[] {
    return [...this.textLines];
  }

  /**
   * Adds a single or multi-line text block with automatic word wrapping to lineWidth.
   * Strictly enforces line length <= lineWidth (32 for 58mm, 42 for 80mm).
   */
  public addLine(text: string, style: EscPosTextStyle = {}): this {
    const scale = style.scale || 'normal';
    const isDoubleWidth = scale === 'double_width' || scale === 'double_both';
    const maxChars = isDoubleWidth ? Math.floor(this.lineWidth / 2) : this.lineWidth;

    const wrappedLines = wrapText(text, maxChars);

    this.setAlign(style.align || 'left');
    this.setBold(style.bold || false);
    this.setScale(scale);

    for (const line of wrappedLines) {
      if (typeof __DEV__ !== 'undefined' && __DEV__ && line.length > maxChars) {
        console.warn(`[EscPosBuilder OVERFLOW] Line exceeds ${maxChars} chars: "${line}" (${line.length} chars)`);
      }
      this.textLines.push(line);
      this.appendString(line);
      this.appendBytes(ESC_POS_COMMANDS.LINE_FEED);
    }

    // Always reset font, scale, bold, and align back to clean normal state
    this.resetToNormal();

    return this;
  }

  /**
   * Adds a horizontal divider line strictly matching lineWidth (32 for 58mm, 42 for 80mm).
   */
  public addDivider(char: '-' | '=' | '*' = '-'): this {
    const line = char.repeat(this.lineWidth);
    this.setAlign('left');
    this.setBold(false);
    this.setScale('normal');
    this.textLines.push(line);
    this.appendString(line);
    this.appendBytes(ESC_POS_COMMANDS.LINE_FEED);
    this.resetToNormal();
    return this;
  }

  /**
   * Adds a centered banner block (e.g. *** REPRINT *** or TAX INVOICE)
   */
  public addBanner(text: string, style: EscPosTextStyle = {}): this {
    return this.addLine(text, { align: 'center', bold: true, ...style });
  }

  /**
   * Adds a Key-Value pair line.
   * Strictly fits inside lineWidth (32 chars on 58mm, 42 chars on 80mm).
   */
  public addKeyValue(key: string, value: string, style: EscPosTextStyle = {}): this {
    const scale = style.scale || 'normal';
    const isDoubleWidth = scale === 'double_width' || scale === 'double_both';
    const maxChars = isDoubleWidth ? Math.floor(this.lineWidth / 2) : this.lineWidth;

    const sanitizedKey = key.trim();
    const sanitizedVal = value.trim().replace(/₹/g, 'INR ');

    // Single-line formatting when key + value fits with at least 1 space
    if (sanitizedKey.length + sanitizedVal.length + 1 <= maxChars) {
      const spaceCount = maxChars - (sanitizedKey.length + sanitizedVal.length);
      const combined = sanitizedKey + ' '.repeat(spaceCount) + sanitizedVal;
      this.addLine(combined, style);
    } else {
      // Key on line 1, Value right-aligned or wrapped on line 2
      this.addLine(sanitizedKey, style);
      const valLines = wrapText(sanitizedVal, maxChars);
      for (const valLine of valLines) {
        const valSpaceCount = Math.max(0, maxChars - valLine.length);
        const formattedValLine = ' '.repeat(valSpaceCount) + valLine;
        this.addLine(formattedValLine, style);
      }
    }

    return this;
  }

  /**
   * Adds a KOT line item with guaranteed right-aligned QTY on the SAME row.
   * 58mm layout: ITEM (27 chars) + 1 space + QTY (4 chars) = 32 chars
   * 80mm layout: ITEM (36 chars) + 1 space + QTY (5 chars) = 42 chars
   */
  public addKotItem(item: { name: string; quantity: number | string; notes?: string }): this {
    const qtyStr = String(item.quantity);
    const qtyColWidth = this.paperWidth === '58mm' ? 4 : 5;
    const nameColWidth = this.lineWidth - qtyColWidth - 1; // 27 for 58mm, 36 for 80mm

    const nameLines = wrapText(item.name, nameColWidth);
    const formattedQty = qtyStr.padStart(qtyColWidth, ' ');

    for (let i = 0; i < nameLines.length; i++) {
      const isLast = i === nameLines.length - 1;
      const namePart = nameLines[i].padEnd(nameColWidth, ' ');

      if (isLast) {
        const fullLine = `${namePart} ${formattedQty}`;
        this.addLine(fullLine, { bold: true });
      } else {
        const fullLine = `${namePart} ${' '.repeat(qtyColWidth)}`;
        this.addLine(fullLine, { bold: true });
      }
    }

    if (item.notes && item.notes.trim()) {
      const noteLines = wrapText(`  * ${item.notes.trim()}`, this.lineWidth);
      for (const nl of noteLines) {
        this.addLine(nl, { bold: false });
      }
    }

    return this;
  }

  /**
   * Adds a Bill line item with structured columns and word wrapping.
   * 58mm column layout:
   * ITEM: 14 chars | QTY: 3 chars | RATE: 6 chars | AMT: 6 chars
   * 14 + 1 + 3 + 1 + 6 + 1 + 6 = 32 characters
   *
   * 80mm column layout (42 characters):
   * ITEM: 21 chars | QTY: 3 chars | RATE: 7 chars | AMT: 8 chars
   * 21 + 1 + 3 + 1 + 7 + 1 + 8 = 42 characters
   */
  public addBillItem(item: {
    name: string;
    quantity: number | string;
    rate: number | string;
    amount: number | string;
  }): this {
    const is58 = this.paperWidth === '58mm';
    const itemWidth = is58 ? 14 : 21;
    const qtyWidth = 3;
    const rateWidth = is58 ? 6 : 7;
    const amtWidth = is58 ? 6 : 8;

    const qtyNum = Number(item.quantity) || 1;
    const rateNum = Number(item.rate) || 0;
    const amtNum = Number(item.amount) || 0;

    const formatNum = (num: number, maxW: number): string => {
      const withDec = num.toFixed(2);
      if (withDec.length <= maxW) return withDec;
      const noDec = (num % 1 === 0) ? String(Math.round(num)) : num.toFixed(1);
      if (noDec.length <= maxW) return noDec;
      return String(Math.round(num));
    };

    const qtyStr = String(qtyNum).padStart(qtyWidth, ' ');
    const rateStr = formatNum(rateNum, rateWidth).padStart(rateWidth, ' ');
    const amtStr = formatNum(amtNum, amtWidth).padStart(amtWidth, ' ');

    const nameLines = wrapText(item.name, itemWidth);

    for (let i = 0; i < nameLines.length; i++) {
      const isLast = i === nameLines.length - 1;
      const namePart = nameLines[i].padEnd(itemWidth, ' ');

      if (isLast) {
        const fullLine = `${namePart} ${qtyStr} ${rateStr} ${amtStr}`;
        this.addLine(fullLine, { bold: false });
      } else {
        const emptyColumns = ' '.repeat(qtyWidth + 1 + rateWidth + 1 + amtWidth);
        const fullLine = `${namePart} ${emptyColumns}`;
        this.addLine(fullLine, { bold: false });
      }
    }

    return this;
  }

  /**
   * Adds the Bill table column header line.
   * 58mm: ITEM (14) QTY (3) RATE (6) AMT (6) = 32 chars
   * 80mm: ITEM (21) QTY (3) RATE (7) AMT (8) = 42 chars
   */
  public addBillTableHeader(): this {
    const is58 = this.paperWidth === '58mm';
    const itemWidth = is58 ? 14 : 21;
    const qtyWidth = 3;
    const rateWidth = is58 ? 6 : 7;
    const amtWidth = is58 ? 6 : 8;

    const itemH = 'ITEM'.padEnd(itemWidth, ' ');
    const qtyH = 'QTY'.padStart(qtyWidth, ' ');
    const rateH = 'RATE'.padStart(rateWidth, ' ');
    const amtH = 'AMT'.padStart(amtWidth, ' ');

    const header = `${itemH} ${qtyH} ${rateH} ${amtH}`;
    this.addLine(header, { bold: true });
    return this;
  }

  /**
   * Adds the KOT table column header line.
   * 58mm: ITEM (27) QTY (4) = 32 chars
   * 80mm: ITEM (36) QTY (5) = 42 chars
   */
  public addKotTableHeader(): this {
    const qtyColWidth = this.paperWidth === '58mm' ? 4 : 5;
    const nameColWidth = this.lineWidth - qtyColWidth - 1; // 27 for 58mm, 36 for 80mm

    const itemH = 'ITEM'.padEnd(nameColWidth, ' ');
    const qtyH = 'QTY'.padStart(qtyColWidth, ' ');

    const header = `${itemH} ${qtyH}`;
    this.addLine(header, { bold: true });
    return this;
  }

  /**
   * Feeds lines compactly and executes paper cut (when supported)
   */
  public addFeedAndCut(feedLines: number = 3): this {
    if (feedLines > 0) {
      this.appendBytes(ESC_POS_COMMANDS.FEED_LINES(feedLines));
    }
    // Only send GS V if cutter is NOT disabled (portable BLE 58mm printers lack cutter and may stall or ignore on GS V)
    if (!this.disableCutCmd) {
      this.appendBytes(ESC_POS_COMMANDS.PAPER_CUT_FEED_PARTIAL(0));
    }
    return this;
  }

  /**
   * Compiles the command buffer into an EscPosDocument
   */
  public build(): EscPosDocument {
    let totalLen = 0;
    for (const chunk of this.chunks) {
      totalLen += chunk.length;
    }

    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const widthDots = this.paperWidth === '58mm' ? 384 : 576;
    const profile = this.paperWidth === '58mm' ? DEFAULT_58MM_PROFILE : DEFAULT_80MM_PROFILE;

    return {
      bytes: combined,
      paperWidth: this.paperWidth,
      widthDots,
      estimatedHeightDots: Math.max(100, Math.round(totalLen * 2)),
      profile,
      textLines: [...this.textLines],
    };
  }
}
