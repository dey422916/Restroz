import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Order, RestaurantSettings } from '../../types';
import { printService, handleThermalPrintFallback } from '../../services/printService';
import { kotService } from '../../services/api/kotService';
import { printedKotTracker } from '../../utils/printedKotTracker';

interface ManualPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  settings: RestaurantSettings;
  billedBy?: string;
  title?: string;
}

export const ManualPrintModal: React.FC<ManualPrintModalProps> = ({
  isOpen,
  onClose,
  order,
  settings,
  billedBy,
  title = '🖨️ Print Options',
}) => {
  const [printingKot, setPrintingKot] = useState<boolean>(false);
  const [printingBill, setPrintingBill] = useState<boolean>(false);
  const [printingA4, setPrintingA4] = useState<boolean>(false);

  if (!isOpen || !order) return null;

  const kotPaperSize = settings.kot_paper_size || '80mm';
  const billPaperSize = settings.bill_paper_size || settings.kot_paper_size || '80mm';

  const orderIdentifier = (order as any).dining_tables?.table_number
    ? `Table ${(order as any).dining_tables.table_number}`
    : order.table_number
    ? `Table ${order.table_number}`
    : (order.order_type || 'ORDER').toUpperCase();

  const handlePrintKot = async () => {
    if (printingKot) return;
    setPrintingKot(true);
    try {
      let activeKot = order.kots && order.kots.length > 0 ? order.kots[order.kots.length - 1] : undefined;
      if (!activeKot) {
        // Generate initial KOT if missing for this order
        activeKot = await kotService.generateKot(order, order.notes);
      }

      const res = await printService.printKotThermal(order, settings, activeKot, false, { isManual: true });
      if (activeKot?.id) {
        await printedKotTracker.markKotAsAutoPrinted(activeKot.id, activeKot.kitchen_notes);
      }

      if (res && res.direct) {
        if (Platform.OS === 'web') {
          // Toast or non-blocking notification
          console.log(`[ManualPrintModal] KOT #${activeKot.kot_number} printed directly`);
        } else {
          Alert.alert('🖨️ KOT Printed', `Kitchen slip #${activeKot.kot_number} sent to printer.`);
        }
      }
    } catch (err: any) {
      console.warn('[ManualPrintModal] Direct KOT print failed:', err);
      let activeKot = order.kots && order.kots.length > 0 ? order.kots[order.kots.length - 1] : undefined;
      await handleThermalPrintFallback(err, 'KOT', async () => {
        await printService.printKotThermalBrowser(order, settings, activeKot, false);
        if (activeKot?.id) {
          await printedKotTracker.markKotAsAutoPrinted(activeKot.id, activeKot.kitchen_notes);
        }
      });
    } finally {
      setPrintingKot(false);
    }
  };

  const handlePrintBill = async () => {
    if (printingBill) return;
    setPrintingBill(true);
    try {
      const res = await printService.printBillThermal(order, settings, billedBy, { isManual: true });
      if (res && res.direct) {
        if (Platform.OS === 'web') {
          console.log(`[ManualPrintModal] Bill printed directly for Order #${order.order_number}`);
        } else {
          Alert.alert('🧾 Bill Printed', `Thermal bill printed for Order #${order.order_number}.`);
        }
      }
    } catch (err: any) {
      console.warn('[ManualPrintModal] Thermal bill print error:', err);
      await handleThermalPrintFallback(err, 'Bill', async () => {
        await printService.printFinalReceiptThermalBrowser(order, settings, billedBy);
      });
    } finally {
      setPrintingBill(false);
    }
  };

  const handlePrintA4 = async () => {
    if (printingA4) return;
    setPrintingA4(true);
    try {
      await printService.printTaxInvoiceA4(order, settings, billedBy);
    } catch (err: any) {
      console.warn('[ManualPrintModal] A4 Invoice print error:', err);
      Alert.alert('Invoice Error', err?.message || 'Could not print A4 invoice.');
    } finally {
      setPrintingA4(false);
    }
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subTitle}>
                Order #{order.order_number} • {orderIdentifier}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeIconBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Banner notification */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerIcon}>⚙️</Text>
            <Text style={styles.infoBannerText}>
              Master Auto Print is <Text style={styles.boldText}>OFF</Text>. Please select what to print:
            </Text>
          </View>

          {/* Action 1: Print KOT */}
          <TouchableOpacity
            testID="manual-print-kot-btn"
            style={[styles.printOptionBtn, styles.kotOptionBtn]}
            onPress={handlePrintKot}
            disabled={printingKot || printingBill || printingA4}
            activeOpacity={0.8}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconCircle, styles.kotIconCircle]}>
                <Text style={styles.optionEmoji}>🍳</Text>
              </View>
              <View>
                <Text style={styles.optionTitle}>1. Print KOT</Text>
                <Text style={styles.optionDesc}>
                  Kitchen Order Ticket • {kotPaperSize} paper width
                </Text>
              </View>
            </View>
            {printingKot ? (
              <ActivityIndicator color="#ea580c" size="small" />
            ) : (
              <View style={styles.printActionBadge}>
                <Text style={styles.printActionBadgeText}>PRINT</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Action 2: Print Bill */}
          <TouchableOpacity
            testID="manual-print-bill-btn"
            style={[styles.printOptionBtn, styles.billOptionBtn]}
            onPress={handlePrintBill}
            disabled={printingKot || printingBill || printingA4}
            activeOpacity={0.8}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconCircle, styles.billIconCircle]}>
                <Text style={styles.optionEmoji}>🧾</Text>
              </View>
              <View>
                <Text style={styles.optionTitle}>2. Print Bill</Text>
                <Text style={styles.optionDesc}>
                  Standard thermal customer bill • {billPaperSize}
                </Text>
              </View>
            </View>
            {printingBill ? (
              <ActivityIndicator color="#0284c7" size="small" />
            ) : (
              <View style={[styles.printActionBadge, styles.billBadge]}>
                <Text style={styles.printActionBadgeText}>PRINT</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Action 3: Print A4 Bill */}
          <TouchableOpacity
            testID="manual-print-a4-btn"
            style={[styles.printOptionBtn, styles.a4OptionBtn]}
            onPress={handlePrintA4}
            disabled={printingKot || printingBill || printingA4}
            activeOpacity={0.8}
          >
            <View style={styles.optionLeft}>
              <View style={[styles.optionIconCircle, styles.a4IconCircle]}>
                <Text style={styles.optionEmoji}>📄</Text>
              </View>
              <View>
                <Text style={styles.optionTitle}>3. Print A4 Bill</Text>
                <Text style={styles.optionDesc}>
                  Official Tax Invoice • Full A4 page layout
                </Text>
              </View>
            </View>
            {printingA4 ? (
              <ActivityIndicator color="#16a34a" size="small" />
            ) : (
              <View style={[styles.printActionBadge, styles.a4Badge]}>
                <Text style={styles.printActionBadgeText}>PRINT</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Done / Close Button */}
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748b',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  infoBannerIcon: {
    fontSize: 16,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: '#9a3412',
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '800',
  },
  printOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  kotOptionBtn: {
    backgroundColor: '#fffaf5',
    borderColor: '#fdba74',
  },
  billOptionBtn: {
    backgroundColor: '#f0f9ff',
    borderColor: '#7dd3fc',
  },
  a4OptionBtn: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  optionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kotIconCircle: {
    backgroundColor: '#ffedd5',
  },
  billIconCircle: {
    backgroundColor: '#e0f2fe',
  },
  a4IconCircle: {
    backgroundColor: '#dcfce7',
  },
  optionEmoji: {
    fontSize: 22,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  optionDesc: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  printActionBadge: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  billBadge: {
    backgroundColor: '#0284c7',
  },
  a4Badge: {
    backgroundColor: '#16a34a',
  },
  printActionBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  doneBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
});
