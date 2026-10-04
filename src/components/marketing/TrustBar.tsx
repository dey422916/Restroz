import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';

export function TrustBar() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View style={styles.trustContainer}>
      <View style={styles.trustInner}>
        <Text style={styles.trustTitle}>TRUSTED BY MODERN RESTAURANTS, CAFES & MULTI-OUTLET CHAINS</Text>
        <View style={[styles.statsGrid, isMobile && styles.statsGridMobile]}>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>⚡</Text>
            <View>
              <Text style={styles.statHeading}>Fastest Order Settle</Text>
              <Text style={styles.statSub}>Sub-second billing & thermal print</Text>
            </View>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statIcon}>🛡️</Text>
            <View>
              <Text style={styles.statHeading}>Offline-Resilient</Text>
              <Text style={styles.statSub}>Uninterrupted counter operations</Text>
            </View>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statIcon}>📱</Text>
            <View>
              <Text style={styles.statHeading}>Table-Side Waiter App</Text>
              <Text style={styles.statSub}>Android & Web mobile ordering</Text>
            </View>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statIcon}>🏢</Text>
            <View>
              <Text style={styles.statHeading}>Multi-Outlet Ready</Text>
              <Text style={styles.statSub}>Central menu, reports & inventory</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trustContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  trustInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 20,
  },
  trustTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
    flexWrap: 'wrap',
  },
  statsGridMobile: {
    flexDirection: 'column',
    gap: 16,
  },
  statItem: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FAF9F6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statIcon: {
    fontSize: 24,
  },
  statHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  statSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});
