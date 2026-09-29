import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { customerColors } from '../../src/utils/colors';

/**
 * Short Route Handler: /r/[slug]
 * Seamlessly resolves short restaurant storefront URLs (e.g., https://restroz.shop/r/panch-phoron)
 * to the canonical restaurant ordering storefront route (/restaurant/[slug]).
 */
export default function ShortRestaurantRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    if (slug) {
      router.replace(`/restaurant/${encodeURIComponent(slug)}`);
    }
  }, [slug, router]);

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
