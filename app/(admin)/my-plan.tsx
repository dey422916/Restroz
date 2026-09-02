import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { subscriptionGuardService } from '../../src/services/api/subscriptionGuardService';
import { RestaurantPlanUsage } from '../../src/types';

export default function MyPlanScreen() {
  const router = useRouter();
  const { activeRestaurantId, activeRestaurant } = useAuth();
  const [usage, setUsage] = useState<RestaurantPlanUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!activeRestaurantId) return;
    setLoading(true);
    try {
      const data = await subscriptionGuardService.getPlanUsage(activeRestaurantId);
      setUsage(data);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load plan details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRestaurantId]);

  const handleContactUpgrade = () => {
    Alert.alert(
      'Upgrade Subscription',
      `To upgrade your plan for ${activeRestaurant?.name || 'your restaurant'}, please contact the Super Admin platform administrator or support team at support@ratnadeeppos.com.`,
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
        <Text style={styles.loadingText}>Loading subscription details...</Text>
      </View>
    );
  }

  if (!usage) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No Plan Data Found</Text>
      </View>
    );
  }

  const { plan, staff, tables, products, features } = usage;

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { bg: '#dcfce7', text: '#15803d' };
      case 'TRIAL':
        return { bg: '#e0e7ff', text: '#4338ca' };
      case 'EXPIRED':
      case 'SUSPENDED':
        return { bg: '#fee2e2', text: '#b91c1c' };
      default:
        return { bg: '#f1f5f9', text: '#64748b' };
    }
  };

  const statusStyle = getStatusBadgeStyle(plan.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>💎 My Plan & Limits</Text>
          <Text style={styles.headerSub}>{activeRestaurant?.name || 'Restaurant'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>{plan.status}</Text>
        </View>
      </View>

      {/* Plan Card */}
      <View style={styles.planCard}>
        <View style={styles.planCardTop}>
          <View>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPricing}>
              ₹{plan.price.toLocaleString('en-IN')} / {plan.billing_cycle}
            </Text>
          </View>
          <TouchableOpacity style={styles.upgradeBtn} onPress={handleContactUpgrade}>
            <Text style={styles.upgradeBtnText}>✨ Upgrade Plan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.planDatesRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Start Date</Text>
            <Text style={styles.dateValue}>
              {plan.start_date ? new Date(plan.start_date).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Expiry / Renewal</Text>
            <Text style={styles.dateValue}>
              {plan.end_date ? new Date(plan.end_date).toLocaleDateString() : 'Lifetime / Active'}
            </Text>
          </View>
        </View>
      </View>

      {/* Resource Limits Section */}
      <Text style={styles.sectionTitle}>📊 Resource Usage & Limits</Text>

      {/* Staff Limit Bar */}
      <View style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>👥 Staff Members</Text>
          <Text style={styles.usageNumbers}>
            {staff.current} / {staff.is_unlimited ? 'Unlimited' : staff.max}
          </Text>
        </View>
        {!staff.is_unlimited && (
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, staff.percentage)}%` },
                staff.percentage >= 80 ? styles.progressWarning : styles.progressNormal,
              ]}
            />
          </View>
        )}
        <Text style={styles.usageHint}>
          {staff.is_unlimited
            ? 'You have unlimited staff slots.'
            : `${staff.percentage}% utilized • ${Math.max(0, (staff.max || 0) - staff.current)} slots remaining`}
        </Text>
      </View>

      {/* Tables Limit Bar */}
      <View style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>🪑 Dining Tables</Text>
          <Text style={styles.usageNumbers}>
            {tables.current} / {tables.is_unlimited ? 'Unlimited' : tables.max}
          </Text>
        </View>
        {!tables.is_unlimited && (
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, tables.percentage)}%` },
                tables.percentage >= 80 ? styles.progressWarning : styles.progressNormal,
              ]}
            />
          </View>
        )}
        <Text style={styles.usageHint}>
          {tables.is_unlimited
            ? 'You have unlimited dining tables.'
            : `${tables.percentage}% utilized • ${Math.max(0, (tables.max || 0) - tables.current)} slots remaining`}
        </Text>
      </View>

      {/* Products Limit Bar */}
      <View style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>🍲 Menu Products</Text>
          <Text style={styles.usageNumbers}>
            {products.current} / {products.is_unlimited ? 'Unlimited' : products.max}
          </Text>
        </View>
        {!products.is_unlimited && (
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, products.percentage)}%` },
                products.percentage >= 80 ? styles.progressWarning : styles.progressNormal,
              ]}
            />
          </View>
        )}
        <Text style={styles.usageHint}>
          {products.is_unlimited
            ? 'You have unlimited menu items.'
            : `${products.percentage}% utilized • ${Math.max(0, (products.max || 0) - products.current)} slots remaining`}
        </Text>
      </View>

      {/* Included SaaS Features */}
      <Text style={styles.sectionTitle}>⚡ Included SaaS Features</Text>
      <View style={styles.featuresGrid}>
        {[
          { key: 'qr_ordering', label: '📱 QR Dine-In Ordering' },
          { key: 'inventory', label: '📦 Live Inventory & Stock' },
          { key: 'reports', label: '📈 Analytics & Day Sales' },
          { key: 'coupons', label: '🎟️ Coupons & Discounts' },
          { key: 'delivery_marketplace', label: '🌐 Online Marketplace' },
          { key: 'split_bill', label: '💵 Bill Splitting & Settle' },
          { key: 'csv_import', label: '📑 CSV Menu Import' },
          { key: 'advanced_analytics', label: '🧠 Advanced Insights' },
        ].map((f) => {
          const isEnabled = Boolean(features[f.key] ?? true);
          return (
            <View
              key={f.key}
              style={[styles.featureItem, !isEnabled && styles.featureItemLocked]}
            >
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={isEnabled ? styles.featureActiveText : styles.featureLockedText}>
                {isEnabled ? '✅ Active' : '🔒 Locked'}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  headerSub: { fontSize: 14, color: '#64748b', marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '800' },
  planCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 24,
  },
  planCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  planName: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  planPricing: { fontSize: 14, color: '#ea580c', fontWeight: '700', marginTop: 4 },
  upgradeBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  upgradeBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  planDatesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  dateCol: { flex: 1 },
  dateLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' },
  dateValue: { fontSize: 13, color: '#334155', fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 14 },
  usageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  usageLabel: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  usageNumbers: { fontSize: 14, fontWeight: '800', color: '#ea580c' },
  progressBarBg: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: { height: '100%', borderRadius: 4 },
  progressNormal: { backgroundColor: '#ea580c' },
  progressWarning: { backgroundColor: '#dc2626' },
  usageHint: { fontSize: 12, color: '#64748b' },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  featureItem: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  featureItemLocked: { opacity: 0.6, backgroundColor: '#f8fafc' },
  featureLabel: { fontSize: 12, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  featureActiveText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  featureLockedText: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
  errorText: { fontSize: 16, fontWeight: '700', color: '#dc2626' },
});
