import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { validateCsvRows, CsvProductRow, CsvValidationError } from '../utils/validators';

export const csvPickerService = {
  async pickAndParseCsv(): Promise<{ validRows: CsvProductRow[]; errors: CsvValidationError[]; fileName: string } | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'utf8',
      } as any);

      const lines = content.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return {
          validRows: [],
          errors: [{ rowIndex: 1, field: 'file', message: 'Selected CSV file is empty' }],
          fileName: asset.name,
        };
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const rawObjects = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = values[idx] || '';
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
