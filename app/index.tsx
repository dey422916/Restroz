import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { user, loading, role, consumePendingTableId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Clear any stale pending QR table state on fresh root URL visits
      consumePendingTableId().catch(() => {});

      if (role === 'SUPER_ADMIN') {
        router.replace('/super-admin' as any);
      } else if (role === 'ADMIN' || role === 'STAFF') {
        router.replace('/(admin)/pos' as any);
      } else {
        // Normal customer and guest entry MUST ALWAYS land on the Restaurant Marketplace
        router.replace('/(marketplace)' as any);
      }
    }
  }, [loading, user, role]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
