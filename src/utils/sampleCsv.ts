import { Platform, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';

export const SAMPLE_PRODUCTS_CSV_CONTENT = `Product Name,SKU,Category,Price,Tax Rate,HSN,Food Type,Stock,Unit,Description,Image URL
Paneer Butter Masala,PBM-001,Main Course,280,5,996331,veg,100,portion,Rich and creamy tomato gravy with tender cottage cheese,https://images.unsplash.com/photo-1631452180519-c014fe946bc7
Chicken Biryani,CHK-002,Biryani,340,5,996331,non-veg,80,portion,Fragrant basmati rice cooked with marinated chicken and aromatic spices,https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8
Masala Chai,BEV-003,Beverages,30,5,996331,veg,150,cup,Freshly brewed traditional spiced milk tea,https://images.unsplash.com/photo-1576092768241-dec231879fc3
Cold Coffee,BEV-004,Beverages,120,5,996331,veg,100,glass,Chilled creamy blended coffee with chocolate drizzle,https://images.unsplash.com/photo-1517701604599-bb29b565090c`;

export async function downloadSampleProductsCsv(): Promise<void> {
  const fileName = 'sample_products_template.csv';

  try {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const blob = new Blob([SAMPLE_PRODUCTS_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert('Download Started', 'sample_products_template.csv has been downloaded.');
      }
      return;
    }

    // Native Mobile (Android / iOS)
    let uri = '';
    try {
      const { File, Paths } = await import('expo-file-system');
      if (typeof File === 'function' && Paths && Paths.cache) {
        const file = new File(Paths.cache, fileName);
        file.create();
        file.write(SAMPLE_PRODUCTS_CSV_CONTENT);
        uri = file.uri;
      }
    } catch (e) {
      // ignore
    }

    if (!uri) {
      try {
        const LegacyFS = await import('expo-file-system/legacy');
        const targetPath = `${LegacyFS.cacheDirectory || ''}${fileName}`;
        await LegacyFS.writeAsStringAsync(targetPath, SAMPLE_PRODUCTS_CSV_CONTENT, {
          encoding: LegacyFS.EncodingType.UTF8,
        });
        uri = targetPath;
      } catch (e) {
        // ignore
      }
    }

    if (uri && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Download / Save Sample Products CSV Template',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      Alert.alert('Download Ready', `Sample CSV prepared. File location: ${uri || fileName}`);
    }
  } catch (error: any) {
    console.error('Failed to export sample CSV:', error);
    Alert.alert('Download Error', error.message || 'Unable to download sample CSV template.');
  }
}
