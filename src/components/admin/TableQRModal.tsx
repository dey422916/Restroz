import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { DiningTable } from '../../types';
import { getTableQrUrl } from '../../utils/qr';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

interface TableQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: DiningTable | null;
  restaurantName?: string;
  restaurantLogo?: string;
}

export const TableQRModal: React.FC<TableQRModalProps> = ({
  isOpen,
  onClose,
  table,
  restaurantName,
  restaurantLogo,
}) => {
  const insets = useSafeAreaInsets();
  const { activeRestaurant } = useAuth();
  const { settings } = useSettings();
  const qrSvgRef = useRef<any>(null);
  const windowHeight = Dimensions.get('window').height;

  if (!table) return null;
  const qrUrl = getTableQrUrl(table.id);
  const brandName = restaurantName || activeRestaurant?.name || settings?.name || 'Restaurant POS';

  // Generate Base64 Data URL from QR SVG
  const getQrBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (qrSvgRef.current && qrSvgRef.current.toDataURL) {
        qrSvgRef.current.toDataURL((data: string) => {
          resolve(data);
        });
      } else {
        reject(new Error('QR SVG reference not ready'));
      }
    });
  };

  const generateHtmlCard = (base64Data: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #ffffff;
        }
        .qr-card {
          border: 3px solid #0f172a;
          border-radius: 24px;
          padding: 32px 28px;
          text-align: center;
          background: #ffffff;
          width: 320px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .brand-name {
          font-size: 22px;
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 4px;
          letter-spacing: 0.5px;
        }
        .brand-sub {
          font-size: 12px;
          font-weight: 700;
          color: #16a34a;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .qr-img {
          width: 200px;
          height: 200px;
          margin: 0 auto;
          display: block;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 8px;
        }
        .table-badge {
          font-size: 24px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 18px;
        }
        .table-meta {
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          margin-top: 4px;
        }
        .scan-hint {
          margin-top: 14px;
          font-size: 12px;
          font-weight: 800;
          color: #2563eb;
          background: #eff6ff;
          padding: 8px 12px;
          border-radius: 10px;
          display: inline-block;
        }
      </style>
    </head>
    <body>
      <div class="qr-card">
        <div class="brand-name">${brandName}</div>
        <div class="brand-sub">Digital Ordering Menu</div>
        <img src="data:image/png;base64,${base64Data}" class="qr-img" alt="Table QR" />
        <div class="table-badge">${table.table_number}</div>
        <div class="table-meta">${table.section} • Seats: ${table.seating_capacity}</div>
        <div class="scan-hint">📲 Scan with Phone Camera to Order</div>
      </div>
    </body>
    </html>
  `;

  // Download Single QR as Image / PDF
  const handleDownloadQr = async () => {
    try {
      const base64Data = await getQrBase64();
      const sanitizedBrand = brandName.replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `${sanitizedBrand}-${table.table_number.replace(/\s+/g, '-')}-QR.png`;

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${base64Data}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Download Complete', `${fileName} downloaded successfully.`);
      } else {
        const html = generateHtmlCard(base64Data);
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Download ${table.table_number} QR Card`,
            UTI: '.pdf',
          });
        } else {
          Alert.alert('Saved', `QR Code exported to: ${uri}`);
        }
      }
    } catch (err: any) {
      Alert.alert('Download Failed', err.message || 'Could not export QR code image.');
    }
  };

  // Print Single QR Code Card
  const handlePrintQr = async () => {
    try {
      const base64 = await getQrBase64();
      const html = generateHtmlCard(base64);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const existing = document.getElementById('ratnadeep-qr-print-frame');
        if (existing) existing.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'ratnadeep-qr-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => iframe.remove(), 3000);
          }, 250);
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Could not print QR code card.');
    }
  };

  // Share Table QR Link
  const handleShareQr = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `RestroZ - ${table.table_number} QR`,
          text: `Scan to open digital menu for ${table.table_number} (${table.section})`,
          url: qrUrl,
        });
      } else if (await Sharing.isAvailableAsync()) {
        const base64Data = await getQrBase64();
        const html = generateHtmlCard(base64Data);
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          dialogTitle: `Share ${table.table_number} QR Code`,
        });
      } else {
        Alert.alert('Table QR Link', qrUrl);
      }
    } catch (err: any) {
      console.warn('Share cancelled or failed:', err);
    }
  };

  return (
    <Modal visible={isOpen} animationType="fade" transparent>
      <View
        style={[
          styles.overlay,
          {
            paddingBottom: insets.bottom + 19,
            paddingTop: insets.top + 19,
          },
        ]}
      >
        <View style={[styles.content, { maxHeight: windowHeight * 0.88 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{table.table_number} Digital Menu QR</Text>
              <Text style={styles.subtitle}>
                {table.section} • Seats: {table.seating_capacity}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Table QR Card Preview */}
            <View style={styles.qrCardPreview}>
              <Text style={styles.cardBrand}>{brandName}</Text>
              <Text style={styles.cardSub}>Digital Menu & Instant Order</Text>

              {/* Native Cross-Platform SVG QR */}
              <View style={styles.qrBox}>
                <QRCode
                  value={qrUrl}
                  size={180}
                  backgroundColor="#ffffff"
                  color="#0f172a"
                  getRef={(c) => (qrSvgRef.current = c)}
                />
              </View>

              <Text style={styles.cardTableNum}>{table.table_number}</Text>
              <Text style={styles.cardMeta}>
                {table.section} • Capacity: {table.seating_capacity} Guests
              </Text>

              <View style={styles.scanBadge}>
                <Text style={styles.scanBadgeText}>📲 Scan with Phone Camera to Order</Text>
              </View>
            </View>

            {/* Direct QR Link */}
            <Text style={styles.urlLabel}>Direct URL:</Text>
            <Text style={styles.urlText} numberOfLines={2}>
              {qrUrl}
            </Text>

            {/* Action Buttons Grid */}
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionBtnDownload} onPress={handleDownloadQr}>
                <Text style={styles.actionBtnTextWhite}>📥 Download QR</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnPrint} onPress={handlePrintQr}>
                <Text style={styles.actionBtnTextWhite}>🖨️ Print QR Card</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionBtnShare} onPress={handleShareQr}>
                <Text style={styles.actionBtnTextDark}>🔗 Share Link / QR</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnClose} onPress={onClose}>
                <Text style={styles.actionBtnTextDark}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  close: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  scrollBody: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  qrCardPreview: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  cardBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  cardSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  qrBox: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    marginBottom: 12,
    elevation: 2,
  },
  cardTableNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  cardMeta: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  scanBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  scanBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  urlLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  urlText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 8,
  },
  actionBtnDownload: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnPrint: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnShare: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionBtnClose: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionBtnTextWhite: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  actionBtnTextDark: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
});
