import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { csvPickerService } from '../../src/services/csvPickerService';
import { productService } from '../../src/services/api/productService';
import { CsvProductRow, CsvValidationError } from '../../src/utils/validators';
import { downloadSampleProductsCsv } from '../../src/utils/sampleCsv';

import { useAuth } from '../../src/context/AuthContext';

export default function BulkImportScreen() {
  const { activeRestaurantId } = useAuth();
  const [validRows, setValidRows] = useState<CsvProductRow[]>([]);
  const [errors, setErrors] = useState<CsvValidationError[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloading(true);
      await downloadSampleProductsCsv();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePickFile = async () => {
    const res = await csvPickerService.pickAndParseCsv();
    if (res) {
      setValidRows(res.validRows);
      setErrors(res.errors);
      setFileName(res.fileName);
    }
  };

  const handleConfirmImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      const targetRestId = activeRestaurantId;
      const res = await productService.bulkImportProducts(validRows, targetRestId);

      if (res.importedCount > 0) {
        if (res.errors.length > 0) {
          Alert.alert(
            'Import Partially Successful',
            `Successfully imported ${res.importedCount} products out of ${validRows.length}.\n\nIssues on other rows:\n${res.errors.slice(0, 5).join('\n')}${res.errors.length > 5 ? `\n...and ${res.errors.length - 5} more.` : ''}`
          );
        } else {
          Alert.alert(
            'Import Successful',
            `Successfully imported ${res.importedCount} products into your menu catalog.`
          );
        }
        setValidRows([]);
        setErrors([]);
        setFileName('');
      } else {
        const errorDetails = res.errors.length > 0
          ? res.errors.slice(0, 5).join('\n')
          : 'Please check that your CSV columns and values match the required format.';
        Alert.alert(
          'Import Failed',
          `0 products could be imported.\n\nErrors encountered:\n${errorDetails}`
        );
      }
    } catch (e: any) {
      Alert.alert('Import Error', e.message || 'Failed to import products.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 32 }]}>
        <Text style={styles.title}>Bulk Product CSV Import</Text>
        <Text style={styles.subtitle}>
          Upload a structured CSV file to import multiple menu products, prices, stock quantities, and food categories at once.
        </Text>

        {/* Step 1: Download Sample CSV Template Box */}
        <View style={styles.templateCard}>
          <View style={styles.templateHeader}>
            <Text style={styles.templateTitle}>📋 Sample CSV Template & Format</Text>
            <TouchableOpacity
              style={[styles.downloadBtn, isDownloading && styles.downloadBtnDisabled]}
              onPress={handleDownloadTemplate}
              disabled={isDownloading}
            >
              <Text style={styles.downloadBtnText}>
                {isDownloading ? '⏳ Preparing...' : '📥 Download Sample CSV'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.templateSub}>
            Use this template format for your menu spreadsheet. Required columns are marked with *.
          </Text>

          {/* Formatted Column Pills Grid */}
          <View style={styles.columnsGrid}>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Product Name *</Text>
              <Text style={styles.columnType}>e.g. Paneer Butter Masala</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>SKU *</Text>
              <Text style={styles.columnType}>e.g. PBM-001 (Unique)</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Category *</Text>
              <Text style={styles.columnType}>e.g. Main Course, Beverages</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Price *</Text>
              <Text style={styles.columnType}>e.g. 280 (Selling Price)</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Tax Rate</Text>
              <Text style={styles.columnType}>e.g. 5 (5% GST)</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>HSN</Text>
              <Text style={styles.columnType}>e.g. 996331</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Food Type</Text>
              <Text style={styles.columnType}>veg / non-veg / egg</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Stock</Text>
              <Text style={styles.columnType}>e.g. 100 (Quantity)</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Unit</Text>
              <Text style={styles.columnType}>e.g. portion, piece, cup</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Description</Text>
              <Text style={styles.columnType}>Item description</Text>
            </View>
            <View style={styles.columnPill}>
              <Text style={styles.columnName}>Image URL</Text>
              <Text style={styles.columnType}>https://image-url.jpg</Text>
            </View>
          </View>
        </View>

        {/* Step 2: Upload CSV File Button */}
        <TouchableOpacity style={styles.pickBtn} onPress={handlePickFile}>
          <Text style={styles.pickBtnText}>📂 Select & Upload CSV File</Text>
        </TouchableOpacity>

        {fileName ? (
          <View style={styles.resultBox}>
            <Text style={styles.fileLabel}>Selected File: {fileName}</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabelValid}>✓ Valid Products: {validRows.length}</Text>
              {errors.length > 0 && (
                <Text style={styles.statsLabelErrors}>⚠️ Issues Found: {errors.length}</Text>
              )}
            </View>

            {errors.length > 0 && (
              <View style={styles.errBox}>
                <Text style={styles.errTitle}>CSV Diagnostics & Fixes:</Text>
                {errors.slice(0, 10).map((e, i) => (
                  <Text key={i} style={styles.errText}>
                    • Line {e.rowIndex}: [{e.field}] {e.message}
                  </Text>
                ))}
                {errors.length > 10 && (
                  <Text style={styles.errTextMore}>...and {errors.length - 10} more rows with errors.</Text>
                )}
              </View>
            )}

            {validRows.length > 0 && (
              <TouchableOpacity
                style={[styles.importBtn, isImporting && styles.importBtnDisabled]}
                onPress={handleConfirmImport}
                disabled={isImporting}
              >
                <Text style={styles.importBtnText}>
                  {isImporting ? 'IMPORTING...' : `CONFIRM & IMPORT (${validRows.length} PRODUCTS)`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 16 },
  title: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16, lineHeight: 18 },
  templateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  templateTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  downloadBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  templateSub: { fontSize: 12, color: '#64748b', marginTop: 8, marginBottom: 12 },
  columnsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  columnPill: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 120,
    flexGrow: 1,
  },
  columnName: { fontSize: 11, fontWeight: '800', color: '#1e293b' },
  columnType: { fontSize: 10, color: '#64748b', marginTop: 2 },
  pickBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  pickBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  resultBox: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fileLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  statsLabelValid: { fontSize: 13, fontWeight: '800', color: '#16a34a' },
  statsLabelErrors: { fontSize: 13, fontWeight: '800', color: '#dc2626' },
  errBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errTitle: { fontSize: 12, fontWeight: '800', color: '#991b1b', marginBottom: 4 },
  errText: { fontSize: 11, color: '#991b1b', marginTop: 2, lineHeight: 16 },
  errTextMore: { fontSize: 11, fontWeight: '700', color: '#991b1b', marginTop: 4 },
  importBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  importBtnDisabled: { backgroundColor: '#cbd5e1' },
  importBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
});
