import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_TABLE_ID_KEY = 'ratnadeep_pending_table_id';

export const pendingRedirectUtil = {
  async setPendingTableId(tableId: string): Promise<void> {
    if (!tableId || tableId === 'general') return;
    try {
      await AsyncStorage.setItem(PENDING_TABLE_ID_KEY, tableId);
    } catch (e) {
      console.warn('Failed to save pending table ID:', e);
    }
  },

  async getPendingTableId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(PENDING_TABLE_ID_KEY);
    } catch (e) {
      console.warn('Failed to get pending table ID:', e);
      return null;
    }
  },

  async consumePendingTableId(): Promise<string | null> {
    try {
      const tableId = await AsyncStorage.getItem(PENDING_TABLE_ID_KEY);
      if (tableId) {
        await AsyncStorage.removeItem(PENDING_TABLE_ID_KEY);
      }
      return tableId;
    } catch (e) {
      console.warn('Failed to consume pending table ID:', e);
      return null;
    }
  },

  async clearPendingTableId(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PENDING_TABLE_ID_KEY);
    } catch (e) {
      console.warn('Failed to clear pending table ID:', e);
    }
  },
};
