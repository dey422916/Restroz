/**
 * ESC/POS High-Level Receipt Document Builder
 * Manages document flow, table layout, text wrapping, and calibration composition.
 */

import { PrinterPaperWidth, PrinterCalibration } from '../../../types';
import { DEFAULT_PRINTER_CALIBRATION } from '../printerTypes';
import {
  MonochromeBitmap,
  PrinterRasterProfile,
  getRasterProfile,
  mmToDots,
} from './raster';
import { FONT_WIDTH, FONT_HEIGHT } from './font8x16';

export interface ColumnDefinition {
  text: string;
  widthRatio?: number; // e.g. 0.5 for 50%
  widthDots?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  scaleX?: number;
  scaleY?: number;
}

export class ReceiptCanvas {
  public readonly paperWidth: PrinterPaperWidth;
  public readonly profile: PrinterRasterProfile;
  public readonly printableWidthDots: number;
  public readonly contentWidthDots: number;

  private lines: Array<{
    type: 'text' | 'key_value' | 'columns' | 'divider' | 'banner' | 'space' | 'bitmap';
    data: any;
    height: number;
  }> = [];

  constructor(paperWidth: PrinterPaperWidth = '80mm', customProfile?: Partial<PrinterRasterProfile>) {
    this.paperWidth = paperWidth;
    this.profile = getRasterProfile(paperWidth, customProfile);
    this.printableWidthDots = this.profile.printableWidthDots;
    // By default, content uses standard nominal printable width (576 dots for 80mm, 384 dots for 58mm)
    this.contentWidthDots = this.printableWidthDots;
  }

  public addSpacing(dots: number): void {
    if (dots <= 0) return;
    this.lines.push({
      type: 'space',
      data: { dots },
      height: dots,
    });
  }

  public drawTextLine(
    text: string,
    options: {
      align?: 'left' | 'center' | 'right';
      bold?: boolean;
      scaleX?: number;
      scaleY?: number;
      invert?: boolean;
    } = {}
  ): void {
    const scaleX = options.scaleX || 1;
    const scaleY = options.scaleY || 1;
    const charWidth = FONT_WIDTH * scaleX;
    const maxCharsPerLine = Math.max(1, Math.floor(this.contentWidthDots / charWidth));

    // Handle multiline text or text wrapping
    const textLines = text.split('\n');
    for (const rawLine of textLines) {
      if (rawLine.length <= maxCharsPerLine) {
        this.lines.push({
          type: 'text',
          data: {
            text: rawLine,
            align: options.align || 'left',
            bold: options.bold,
            scaleX,
            scaleY,
            invert: options.invert,
          },
          height: FONT_HEIGHT * scaleY + 2,
        });
      } else {
        // Wrap words/characters
        let remaining = rawLine;
        while (remaining.length > 0) {
          const chunk = remaining.substring(0, maxCharsPerLine);
          remaining = remaining.substring(maxCharsPerLine);
          this.lines.push({
            type: 'text',
            data: {
              text: chunk,
              align: options.align || 'left',
              bold: options.bold,
              scaleX,
              scaleY,
              invert: options.invert,
            },
            height: FONT_HEIGHT * scaleY + 2,
          });
        }
      }
    }
  }

  public drawBanner(text: string, options: { scaleX?: number; scaleY?: number } = {}): void {
    const scaleX = options.scaleX || 1;
    const scaleY = options.scaleY || 1;
    this.lines.push({
      type: 'banner',
      data: {
        text,
        scaleX,
        scaleY,
      },
      height: FONT_HEIGHT * scaleY + 6,
    });
  }

  public drawKeyValue(
    key: string,
    value: string,
    options: { bold?: boolean; scaleX?: number; scaleY?: number } = {}
  ): void {
    const scaleX = options.scaleX || 1;
    const scaleY = options.scaleY || 1;
    this.lines.push({
      type: 'key_value',
      data: {
        key,
        value,
        bold: options.bold,
        scaleX,
        scaleY,
      },
      height: FONT_HEIGHT * scaleY + 2,
    });
  }

  public drawDivider(style: 'solid' | 'dashed' | 'dotted' | 'double' = 'dashed', thickness: number = 1): void {
    this.lines.push({
      type: 'divider',
      data: { style, thickness },
      height: style === 'double' ? 6 : 4,
    });
  }

  public drawColumns(columns: ColumnDefinition[]): void {
    this.lines.push({
      type: 'columns',
      data: { columns },
      height: FONT_HEIGHT + 4,
    });
  }

  public drawBitmap(bitmap: MonochromeBitmap, align: 'left' | 'center' | 'right' = 'center'): void {
    this.lines.push({
      type: 'bitmap',
      data: { bitmap, align },
      height: bitmap.height + 4,
    });
  }

  /**
   * Compiles and renders the receipt content into a calibrated MonochromeBitmap.
   */
  public renderToBitmap(calibration: PrinterCalibration = DEFAULT_PRINTER_CALIBRATION): MonochromeBitmap {
    const dpi = this.profile.dpi;

    // Convert margins and shifts to dots
    const marginLeftDots = mmToDots(calibration.margin_left_mm || 0, dpi);
    const marginRightDots = mmToDots(calibration.margin_right_mm || 0, dpi);
    const marginTopDots = mmToDots(calibration.margin_top_mm || 0, dpi);
    const marginBottomDots = mmToDots(calibration.margin_bottom_mm || 0, dpi);
    const horizontalShiftDots = mmToDots(calibration.horizontal_shift_mm || 0, dpi);

    // Calculate content width
    const availableWidthDots = Math.max(64, this.printableWidthDots - marginLeftDots - marginRightDots);
    const contentWidth = Math.min(this.contentWidthDots, availableWidthDots);

    // Calculate total height
    let totalContentHeight = 0;
    for (const line of this.lines) {
      totalContentHeight += line.height;
    }

    const totalBitmapHeight = marginTopDots + totalContentHeight + marginBottomDots + 8;
    const finalBitmap = new MonochromeBitmap(this.printableWidthDots, totalBitmapHeight);

    // Calculate base horizontal placement based on Alignment
    let baseX = marginLeftDots;
    if (calibration.alignment === 'center') {
      baseX = marginLeftDots + Math.max(0, Math.floor((availableWidthDots - contentWidth) / 2));
    } else if (calibration.alignment === 'right') {
      baseX = this.printableWidthDots - marginRightDots - contentWidth;
    }

    // Apply manual shift with safety boundary clamping
    let finalStartX = baseX + horizontalShiftDots;
    if (finalStartX < 0) finalStartX = 0;
    if (finalStartX + contentWidth > this.printableWidthDots) {
      finalStartX = Math.max(0, this.printableWidthDots - contentWidth);
    }

    // Render elements
    let cursorY = marginTopDots;

    for (const item of this.lines) {
      if (item.type === 'space') {
        cursorY += item.data.dots;
      } else if (item.type === 'text') {
        const { text, align, bold, scaleX, scaleY, invert } = item.data;
        const textWidth = text.length * FONT_WIDTH * scaleX;
        let textX = finalStartX;

        if (align === 'center') {
          textX = finalStartX + Math.max(0, Math.floor((contentWidth - textWidth) / 2));
        } else if (align === 'right') {
          textX = finalStartX + Math.max(0, contentWidth - textWidth);
        }

        finalBitmap.drawText(text, textX, cursorY, { bold, scaleX, scaleY, invert });
        cursorY += item.height;
      } else if (item.type === 'banner') {
        const { text, scaleX, scaleY } = item.data;
        // Inverted banner across full content width
        finalBitmap.fillRect(finalStartX, cursorY, contentWidth, item.height, 1);
        const textWidth = text.length * FONT_WIDTH * scaleX;
        const textX = finalStartX + Math.max(0, Math.floor((contentWidth - textWidth) / 2));
        finalBitmap.drawText(text, textX, cursorY + 3, { bold: true, scaleX, scaleY, invert: true });
        cursorY += item.height;
      } else if (item.type === 'key_value') {
        const { key, value, bold, scaleX, scaleY } = item.data;
        finalBitmap.drawText(key, finalStartX, cursorY, { bold, scaleX, scaleY });
        const valWidth = value.length * FONT_WIDTH * scaleX;
        const valX = finalStartX + Math.max(0, contentWidth - valWidth);
        finalBitmap.drawText(value, valX, cursorY, { bold, scaleX, scaleY });
        cursorY += item.height;
      } else if (item.type === 'divider') {
        const { style, thickness } = item.data;
        finalBitmap.drawHorizontalLine(finalStartX, cursorY + 1, contentWidth, thickness, style);
        cursorY += item.height;
      } else if (item.type === 'columns') {
        const columns: ColumnDefinition[] = item.data.columns;
        const totalRatio = columns.reduce((acc, c) => acc + (c.widthRatio || 1), 0);
        let colStartX = finalStartX;

        for (const col of columns) {
          const ratio = (col.widthRatio || 1) / totalRatio;
          const colWidth = col.widthDots || Math.floor(contentWidth * ratio);
          const textWidth = col.text.length * FONT_WIDTH * (col.scaleX || 1);

          let colTextX = colStartX;
          if (col.align === 'center') {
            colTextX = colStartX + Math.max(0, Math.floor((colWidth - textWidth) / 2));
          } else if (col.align === 'right') {
            colTextX = colStartX + Math.max(0, colWidth - textWidth);
          }

          finalBitmap.drawText(col.text, colTextX, cursorY, {
            bold: col.bold,
            scaleX: col.scaleX || 1,
            scaleY: col.scaleY || 1,
          });

          colStartX += colWidth;
        }
        cursorY += item.height;
      } else if (item.type === 'bitmap') {
        const { bitmap: subBitmap, align } = item.data;
        let subX = finalStartX;
        if (align === 'center') {
          subX = finalStartX + Math.max(0, Math.floor((contentWidth - subBitmap.width) / 2));
        } else if (align === 'right') {
          subX = finalStartX + Math.max(0, contentWidth - subBitmap.width);
        }
        finalBitmap.drawBitmap(subX, cursorY, subBitmap);
        cursorY += item.height;
      }
    }

    return finalBitmap;
  }
}
