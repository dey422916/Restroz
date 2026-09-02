import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { csvPickerService } from '../../src/services/csvPickerService';
import { productService } from '../../src/services/api/productService';
import { CsvProductRow, CsvValidationError } from '../../src/utils/validators';

export default function BulkImportScreen() {
  const insets = useSafeAreaInsets();
  const [validRows, setValidRows] = useState<CsvProductRow[]>([]);
  const [errors, setErrors] = useState<CsvValidationError[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);

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
      const res = await productService.bulkImportProducts(validRows);
      Alert.alert('Import Successful', `Successfully imported ${res.importedCount} products with photos & inventory stock levels into Supabase.`);
      setValidRows([]);
      setErrors([]);
      setFileName('');
    } catch (e: any) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}>
        <Text style={styles.title}>Bulk Product CSV Import</Text>
        <Text style={styles.subtitle}>Select a CSV file from your Android device to import products, stock quantities, and product photos.</Text>

        <TouchableOpacity style={styles.pickBtn} onPress={handlePickFile}>
          <Text style={styles.pickBtnText}>📂 Select CSV File from Device</Text>
        </TouchableOpacity>

        {fileName ? (
          <View style={styles.resultBox}>
            <Text style={styles.fileLabel}>Selected File: {fileName}</Text>
            <Text style={styles.statsLabel}>Valid Products: {validRows.length} | Errors: {errors.length}</Text>

            {errors.length > 0 && (
              <View style={styles.errBox}>
                <Text style={styles.errTitle}>CSV Diagnostics:</Text>
                {errors.map((e, i) => (
                  <Text key={i} style={styles.errText}>Line {e.rowIndex}: [{e.field}] {e.message}</Text>
                ))}
              </View>
            )}

            {validRows.length > 0 && (
              <TouchableOpacity
                style={[styles.importBtn, isImporting && styles.importBtnDisabled]}
                onPress={handleConfirmImport}
                disabled={isImporting}
              >
                <Text style={styles.importBtnText}>CONFIRM IMPORT ({validRows.length} ITEMS)</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 20 },
  title: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 16 },
  pickBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  pickBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  resultBox: { marginTop: 20, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  fileLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  statsLabel: { fontSize: 12, fontWeight: '700', color: '#16a34a', marginTop: 4 },
  errBox: { backgroundColor: '#ffe4e6', borderRadius: 10, padding: 10, marginTop: 10 },
  errTitle: { fontSize: 11, fontWeight: '800', color: '#991b1b' },
  errText: { fontSize: 10, color: '#991b1b', marginTop: 2 },
  importBtn: { backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 14 },
  importBtnDisabled: { backgroundColor: '#cbd5e1' },
  importBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
});
