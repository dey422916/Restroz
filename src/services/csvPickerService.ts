import * as DocumentPicker from 'expo-document-picker';
import { validateCsvRows, CsvProductRow, CsvValidationError } from '../utils/validators';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

export const csvPickerService = {
  async pickAndParseCsv(): Promise<{ validRows: CsvProductRow[]; errors: CsvValidationError[]; fileName: string } | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      let content = '';

      if (typeof window === 'undefined' || !asset.uri.startsWith('http')) {
        try {
          const { File } = await import('expo-file-system');
          if (typeof File === 'function') {
            const file = new File(asset.uri);
            if (typeof (file as any).text === 'function') {
              content = await (file as any).text();
            }
          }
        } catch (e) {
          // ignore
        }

        if (!content) {
          try {
            const LegacyFS = await import('expo-file-system/legacy');
            content = await LegacyFS.readAsStringAsync(asset.uri, {
              encoding: LegacyFS.EncodingType.UTF8,
            });
          } catch (e) {
            // ignore
          }
        }
      }

      if (!content) {
        const res = await fetch(asset.uri);
        content = await res.text();
      }

      const lines = content.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return {
          validRows: [],
          errors: [{ rowIndex: 1, field: 'file', message: 'Selected CSV file has no product data rows.' }],
          fileName: asset.name,
        };
      }

      const headers = parseCsvLine(lines[0]);
      const rawObjects = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = values[idx] !== undefined ? values[idx] : '';
        });
        return obj;
      });

      const { validRows, errors } = validateCsvRows(rawObjects);
      return { validRows, errors, fileName: asset.name };
    } catch (e: any) {
      console.error('Failed to pick CSV:', e);
      return null;
    }
  },
};
