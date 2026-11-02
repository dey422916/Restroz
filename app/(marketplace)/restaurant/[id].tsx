import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { customerColors } from '../../../src/utils/colors';

/**
 * Legacy Restaurant Route Handler: /restaurant/[id]
 * Safely redirects legacy restaurant route to the primary canonical dedicated route (/r/[slug]) exactly once.
 * Prevents circular redirect loops.
 */
export default function LegacyRestaurantRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!id || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(`/r/${encodeURIComponent(id)}` as any);
  }, [id, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={customerColors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
});
