import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tableService } from '../../src/services/api/tableService';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { DiningTable, TableSection } from '../../src/types';
import { TableQRModal } from '../../src/components/admin/TableQRModal';

export default function TablesScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { activeRestaurantId, activeRestaurant } = useAuth();
  const { settings } = useSettings();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSection, setActiveSection] = useState<TableSection | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [selectedQrTable, setSelectedQrTable] = useState<DiningTable | null>(null);
  const [showSingleModal, setShowSingleModal] = useState<boolean>(false);
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);

  // Single / Edit Form State
  const [formTableNumber, setFormTableNumber] = useState<string>('');
  const [formSection, setFormSection] = useState<TableSection>('Ground Floor');
  const [formCapacity, setFormCapacity] = useState<string>('4');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [savingSingle, setSavingSingle] = useState<boolean>(false);

  // Bulk Form State
  const [bulkStartingNum, setBulkStartingNum] = useState<string>('11');
  const [bulkCount, setBulkCount] = useState<string>('5');
  const [bulkSection, setBulkSection] = useState<TableSection>('Ground Floor');
  const [bulkCapacity, setBulkCapacity] = useState<string>('4');
  const [savingBulk, setSavingBulk] = useState<boolean>(false);
  const [exportingAll, setExportingAll] = useState<boolean>(false);

  const windowHeight = Dimensions.get('window').height;

  const sections: (TableSection | 'All')[] = [
    'All',
    'Ground Floor',
    'First Floor',
    'Outdoor',
    'AC Section',
    'VIP Section',
  ];

  const availableSections: TableSection[] = [
    'Ground Floor',
    'First Floor',
    'Outdoor',
    'AC Section',
    'VIP Section',
  ];

  const loadTables = async () => {
    try {
      setLoading(true);
      const list = await tableService.getTables(activeRestaurantId);
      setTables(list);
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Failed to load tables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, [activeRestaurantId]);

  const openCreateModal = () => {
    setEditingTable(null);
    let nextNum = 1;
    while (tables.some((t) => t.table_number.toLowerCase() === `table ${nextNum}`.toLowerCase())) {
      nextNum++;
    }
    setFormTableNumber(`Table ${nextNum}`);
    setFormSection('Ground Floor');
    setFormCapacity('4');
    setFormIsActive(true);
    setShowSingleModal(true);
  };

  const openEditModal = (t: DiningTable) => {
    setEditingTable(t);
    setFormTableNumber(t.table_number);
    setFormSection(t.section);
    setFormCapacity(String(t.seating_capacity));
    setFormIsActive(t.is_active);
    setShowSingleModal(true);
  };

  const handleSaveSingleTable = async () => {
    const trimmedNumber = formTableNumber.trim();
    if (!trimmedNumber) {
      Alert.alert('Missing Field', 'Please enter a valid table number.');
      return;
    }
    const cap = parseInt(formCapacity, 10);
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Invalid Capacity', 'Please enter a valid positive number for seating capacity.');
      return;
    }

    setSavingSingle(true);
    try {
      await tableService.saveTable(
        {
          id: editingTable?.id,
          restaurant_id: activeRestaurantId,
          table_number: trimmedNumber,
          section: formSection,
          seating_capacity: cap,
          is_active: formIsActive,
        },
        activeRestaurantId
      );

      Alert.alert(
        'Success',
        editingTable
          ? `Updated ${trimmedNumber} successfully.`
          : `Created ${trimmedNumber} with unique QR code.`
      );
      setShowSingleModal(false);
      await loadTables();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message);
    } finally {
      setSavingSingle(false);
    }
  };

  const handleSaveBulkTables = async () => {
    const start = parseInt(bulkStartingNum, 10);
    const count = parseInt(bulkCount, 10);
    const cap = parseInt(bulkCapacity, 10);

    if (isNaN(start) || start <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid starting table number (e.g. 11).');
      return;
    }
    if (isNaN(count) || count <= 0 || count > 50) {
      Alert.alert('Invalid Input', 'Number of tables must be between 1 and 50.');
      return;
    }
    if (isNaN(cap) || cap <= 0) {
      Alert.alert('Invalid Input', 'Seating capacity must be a positive integer.');
      return;
    }

    setSavingBulk(true);
    try {
      const res = await tableService.createBulkTables(
        {
          startingNumber: start,
          count,
          section: bulkSection,
          seatingCapacity: cap,
        },
        activeRestaurantId
      );

      Alert.alert(
        'Bulk Creation Complete',
        `Successfully created ${res.createdCount} new dining tables (${bulkSection}, ${cap} Seats).`
      );
      setShowBulkModal(false);
      await loadTables();
    } catch (err: any) {
      Alert.alert('Bulk Creation Failed', err.message);
    } finally {
      setSavingBulk(false);
    }
  };

  const handleDeleteTable = (t: DiningTable) => {
    if (t.status === 'occupied') {
      Alert.alert('Cannot Delete', `Table ${t.table_number} is currently OCCUPIED by active guests.`);
      return;
    }

    Alert.alert(
      'Delete Table',
      `Are you sure you want to permanently delete "${t.table_number}" (${t.section})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              await tableService.deleteTable(t.id, activeRestaurantId);
              Alert.alert('Deleted', `${t.table_number} has been deleted.`);
              await loadTables();
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message);
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (t: DiningTable) => {
    try {
      await tableService.toggleTableActive(t.id, !t.is_active, activeRestaurantId);
      await loadTables();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    }
  };

  const handleExportAllQrs = async () => {
    if (tables.length === 0) {
      Alert.alert('No Tables', 'There are no tables available to export.');
      return;
    }
    setExportingAll(true);
    try {
      await tableService.exportAllTableQrsPdf(tables, activeRestaurantId);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message);
    } finally {
      setExportingAll(false);
    }
  };

  const filteredTables = tables.filter((t) => {
    if (activeSection !== 'All') {
      if (activeSection === 'VIP Section' || (activeSection as any) === 'VIP') {
        if (t.section !== 'VIP' && t.section !== 'VIP Section') return false;
      } else if (t.section !== activeSection) {
        return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.table_number.toLowerCase().includes(q) ||
        t.section.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header & Actions */}
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.title}>Tables & QR Codes ({tables.length})</Text>
          <Text style={styles.subTitle}>
            Manage dining floor tables, seating, and unique digital QR menus.
          </Text>
        </View>

        {/* Action Buttons: Add Single Table, Add Multiple Tables, Export All QRs */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.addSingleBtn} onPress={openCreateModal}>
            <Text style={styles.addBtnText}>+ ADD TABLE</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addBulkBtn} onPress={() => setShowBulkModal(true)}>
            <Text style={styles.addBulkBtnText}>+ MULTIPLE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exportAllBtn, exportingAll && styles.btnDisabled]}
            onPress={handleExportAllQrs}
            disabled={exportingAll}
          >
            {exportingAll ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.exportAllBtnText}>📥 EXPORT ALL</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <TextInput
          style={styles.searchInput}
          placeholder="Search by table number or section..."
          placeholderTextColor="#64748b"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {/* Horizontal Section Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sectionScroll}
          contentContainerStyle={styles.sectionScrollContent}
        >
          {sections.map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[styles.secPill, activeSection === sec && styles.secPillActive]}
              onPress={() => setActiveSection(sec)}
            >
              <Text
                style={[
                  styles.secPillText,
                  activeSection === sec && styles.secPillTextActive,
                ]}
              >
                {sec} {sec === 'All' ? `(${tables.length})` : `(${tables.filter((t) => t.section === sec || (sec === 'VIP Section' && t.section === 'VIP')).length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Table Cards Grid */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading restaurant tables from Supabase...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={true}
        >
          {filteredTables.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 32 }}>🪑</Text>
              <Text style={styles.emptyTitle}>No Dining Tables Found</Text>
              <Text style={styles.emptySub}>
                {searchQuery
                  ? 'No tables match your search query.'
                  : 'Tap "+ ADD TABLE" or "+ ADD MULTIPLE TABLES" above to create dining tables.'}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredTables.map((table) => {
                const isOccupied = table.status === 'occupied';
                const isReserved = table.status === 'reserved';

                const responsiveCardStyle =
                  Platform.OS === 'web'
                    ? windowWidth >= 960
                      ? styles.cardWeb4Col
                      : windowWidth >= 640
                      ? styles.cardWeb3Col
                      : styles.cardWeb2Col
                    : windowWidth >= 960
                    ? styles.cardNative4Col
                    : styles.cardNative2Col;

                return (
                  <View
                    key={table.id}
                    style={[
                      styles.card,
                      responsiveCardStyle,
                      !table.is_active && styles.cardInactive,
                    ]}
                  >
                    {/* Header: Table Number & Status Dot */}
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTableNum}>{table.table_number}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          isOccupied
                            ? styles.statusOccupied
                            : isReserved
                            ? styles.statusReserved
                            : styles.statusAvailable,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            isOccupied
                              ? styles.statusTextOccupied
                              : isReserved
                              ? styles.statusTextReserved
                              : styles.statusTextAvailable,
                          ]}
                        >
                          {table.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Section & Capacity */}
                    <Text style={styles.cardSec}>{table.section}</Text>
                    <Text style={styles.cardSeats}>👥 Seats: {table.seating_capacity} Guests</Text>

                    {/* Active Status Tag */}
                    <View style={styles.activeTagRow}>
                      <View
                        style={[
                          styles.activeDot,
                          { backgroundColor: table.is_active ? '#16a34a' : '#94a3b8' },
                        ]}
                      />
                      <Text style={styles.activeTagText}>
                        {table.is_active ? 'Active on Floor' : 'Inactive / Disabled'}
                      </Text>
                    </View>

                    {/* Table Actions Row */}
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.qrActionBtn}
                        onPress={() => setSelectedQrTable(table)}
                      >
                        <Text style={styles.qrActionBtnText}>📱 View QR</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.editActionBtn}
                        onPress={() => openEditModal(table)}
                      >
                        <Text style={styles.editActionBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.cardActionsBottom}>
                      <TouchableOpacity
                        style={styles.toggleBtn}
                        onPress={() => handleToggleActive(table)}
                      >
                        <Text style={styles.toggleBtnText}>
                          {table.is_active ? 'Deactivate' : 'Activate'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteTable(table)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ============================================================ */}
      {/* 1. SINGLE TABLE MODAL (CREATE / EDIT)                        */}
      {/* ============================================================ */}
      <Modal visible={showSingleModal} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
              paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 8,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', maxHeight: windowHeight * 0.88 }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingTable ? `Edit ${editingTable.table_number}` : 'Add New Dining Table'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowSingleModal(false)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Table Number */}
                <Text style={styles.fieldLabel}>Table Number / Name *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Table 12 or 12"
                  value={formTableNumber}
                  onChangeText={setFormTableNumber}
                />

                {/* Section Selector */}
                <Text style={styles.fieldLabel}>Floor Section *</Text>
                <View style={styles.pillsPickerRow}>
                  {availableSections.map((sec) => (
                    <TouchableOpacity
                      key={sec}
                      style={[
                        styles.pickerPill,
                        formSection === sec && styles.pickerPillActive,
                      ]}
                      onPress={() => setFormSection(sec)}
                    >
                      <Text
                        style={[
                          styles.pickerPillText,
                          formSection === sec && styles.pickerPillTextActive,
                        ]}
                      >
                        {sec}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Seating Capacity Selector */}
                <Text style={styles.fieldLabel}>Seating Capacity (Guests) *</Text>
                <View style={styles.capacityRow}>
                  {['2', '4', '6', '8', '10', '12'].map((cap) => (
                    <TouchableOpacity
                      key={cap}
                      style={[
                        styles.capBtn,
                        formCapacity === cap && styles.capBtnActive,
                      ]}
                      onPress={() => setFormCapacity(cap)}
                    >
                      <Text
                        style={[
                          styles.capBtnText,
                          formCapacity === cap && styles.capBtnTextActive,
                        ]}
                      >
                        {cap} Seats
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.fieldInput, { marginTop: 6 }]}
                  placeholder="Custom seating capacity (e.g. 14)"
                  keyboardType="numeric"
                  value={formCapacity}
                  onChangeText={setFormCapacity}
                />

                {/* Active Switch */}
                <TouchableOpacity
                  style={styles.activeCheckRow}
                  onPress={() => setFormIsActive(!formIsActive)}
                >
                  <View style={[styles.checkbox, formIsActive && styles.checkboxChecked]}>
                    {formIsActive && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkLabel}>Active on Floor (Available for orders & QR)</Text>
                </TouchableOpacity>

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.saveModalBtn, savingSingle && styles.btnDisabled]}
                  onPress={handleSaveSingleTable}
                  disabled={savingSingle}
                >
                  {savingSingle ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveModalBtnText}>
                      {editingTable ? 'UPDATE DINING TABLE' : 'CREATE TABLE & GENERATE QR'}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 2. BULK TABLES MODAL                                         */}
      {/* ============================================================ */}
      <Modal visible={showBulkModal} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
              paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 8,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', maxHeight: windowHeight * 0.88 }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>+ Add Multiple Dining Tables</Text>
                <TouchableOpacity
                  onPress={() => setShowBulkModal(false)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.bulkHint}>
                  Quickly generate a batch of sequential dining tables with unique IDs and QR codes.
                </Text>

                {/* Starting Number */}
                <Text style={styles.fieldLabel}>Starting Table Number *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 11"
                  keyboardType="numeric"
                  value={bulkStartingNum}
                  onChangeText={setBulkStartingNum}
                />

                {/* Number of Tables */}
                <Text style={styles.fieldLabel}>Number of Tables to Create *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 5 (Creates Table 11 to Table 15)"
                  keyboardType="numeric"
                  value={bulkCount}
                  onChangeText={setBulkCount}
                />

                {/* Section */}
                <Text style={styles.fieldLabel}>Section *</Text>
                <View style={styles.pillsPickerRow}>
                  {availableSections.map((sec) => (
                    <TouchableOpacity
                      key={sec}
                      style={[
                        styles.pickerPill,
                        bulkSection === sec && styles.pickerPillActive,
                      ]}
                      onPress={() => setBulkSection(sec)}
                    >
                      <Text
                        style={[
                          styles.pickerPillText,
                          bulkSection === sec && styles.pickerPillTextActive,
                        ]}
                      >
                        {sec}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Seating Capacity */}
                <Text style={styles.fieldLabel}>Seating Capacity (per table) *</Text>
                <View style={styles.capacityRow}>
                  {['2', '4', '6', '8', '10', '12'].map((cap) => (
                    <TouchableOpacity
                      key={cap}
                      style={[
                        styles.capBtn,
                        bulkCapacity === cap && styles.capBtnActive,
                      ]}
                      onPress={() => setBulkCapacity(cap)}
                    >
                      <Text
                        style={[
                          styles.capBtnText,
                          bulkCapacity === cap && styles.capBtnTextActive,
                        ]}
                      >
                        {cap} Seats
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Preview Callout */}
                <View style={styles.previewBox}>
                  <Text style={styles.previewTitle}>Batch Preview:</Text>
                  <Text style={styles.previewText}>
                    Will generate {parseInt(bulkCount, 10) || 0} tables starting at Table {bulkStartingNum} ({bulkSection}, {bulkCapacity} Seats each).
                  </Text>
                </View>

                {/* Save Bulk Button */}
                <TouchableOpacity
                  style={[styles.saveModalBtn, savingBulk && styles.btnDisabled]}
                  onPress={handleSaveBulkTables}
                  disabled={savingBulk}
                >
                  {savingBulk ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveModalBtnText}>GENERATE BULK TABLES & QR CODES</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 3. TABLE QR MODAL (DOWNLOAD, PRINT, SHARE)                  */}
      {/* ============================================================ */}
      {selectedQrTable && (
        <TableQRModal
          isOpen={Boolean(selectedQrTable)}
          onClose={() => setSelectedQrTable(null)}
          table={selectedQrTable}
          restaurantName={activeRestaurant?.name || settings?.name}
          restaurantLogo={activeRestaurant?.logo_url || settings?.logo_url}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  headerTitleBox: {
    marginBottom: 4,
  },
  exportAllBtn: {
    flex: 1.1,
    minWidth: 105,
    minHeight: 40,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportAllBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  addSingleBtn: {
    flex: 1,
    minWidth: 100,
    minHeight: 40,
    backgroundColor: '#16a34a',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  addBulkBtn: {
    flex: 1,
    minWidth: 100,
    minHeight: 40,
    backgroundColor: '#2563eb',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBulkBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
    marginBottom: 8,
  },
  sectionScroll: {
    maxHeight: 40,
  },
  sectionScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 4,
  },
  secPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  secPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  secPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  listContent: {
    padding: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardWeb4Col: {
    width: 'calc(25% - 8px)' as any,
    flexBasis: 'calc(25% - 8px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWeb3Col: {
    width: 'calc(33.333% - 7px)' as any,
    flexBasis: 'calc(33.333% - 7px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWeb2Col: {
    width: 'calc(50% - 5px)' as any,
    flexBasis: 'calc(50% - 5px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardNative4Col: {
    flexBasis: '23.5%',
    maxWidth: '24%',
    flexGrow: 1,
  },
  cardNative2Col: {
    width: '48%',
    minWidth: 150,
    flexGrow: 1,
  },
  cardInactive: {
    opacity: 0.65,
    backgroundColor: '#f8fafc',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  cardTableNum: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusAvailable: {
    backgroundColor: '#dcfce7',
  },
  statusOccupied: {
    backgroundColor: '#fef3c7',
  },
  statusReserved: {
    backgroundColor: '#eff6ff',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },
  statusTextAvailable: {
    color: '#15803d',
  },
  statusTextOccupied: {
    color: '#b45309',
  },
  statusTextReserved: {
    color: '#1d4ed8',
  },
  cardSec: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  cardSeats: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 8,
  },
  activeTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  qrActionBtn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  qrActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  editActionBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  editActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  cardActionsBottom: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#fff1f2',
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  deleteBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#e11d48',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 4,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 5,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
  },
  pillsPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  pickerPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pickerPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  pickerPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pickerPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  capacityRow: {
    flexDirection: 'row',
    gap: 6,
  },
  capBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  capBtnActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  capBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  capBtnTextActive: {
    color: '#ffffff',
  },
  activeCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  checkLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  bulkHint: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 16,
  },
  previewBox: {
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginVertical: 12,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1d4ed8',
  },
  previewText: {
    fontSize: 11,
    color: '#1e40af',
    marginTop: 2,
  },
  saveModalBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  saveModalBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
  },
});
