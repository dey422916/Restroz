import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../utils/colors';

interface SubscriptionLockOverlayProps {
  status: 'expired' | 'suspended' | 'cancelled' | 'none';
  restaurantName?: string;
  planName?: string;
  endDate?: string | null;
  message?: string;
  onLogout?: () => void;
  onRefresh?: () => void;
}

export const SubscriptionLockOverlay: React.FC<SubscriptionLockOverlayProps> = ({
  status,
  restaurantName = 'Your Restaurant',
  planName = 'Subscription Plan',
  endDate,
  message,
  onLogout,
  onRefresh,
}) => {
  const getIcon = () => {
    switch (status) {
      case 'suspended':
        return '🚫';
      case 'expired':
        return '⏳';
      case 'cancelled':
        return '❌';
      default:
        return '🔒';
    }
  };

  const getTitle = () => {
    switch (status) {
      case 'suspended':
        return 'Account Suspended';
      case 'expired':
        return 'Subscription Expired';
      case 'cancelled':
        return 'Subscription Cancelled';
      default:
        return 'Subscription Inactive';
    }
  };

  const getSubtext = () => {
    if (message) return message;
    if (status === 'expired') {
      return `The ${planName} subscription for ${restaurantName} ended on ${endDate ? new Date(endDate).toLocaleDateString() : 'recently'}. All your tables, products, and order histories are safely preserved.`;
    }
    if (status === 'suspended') {
      return `Access to ${restaurantName} has been temporarily suspended by the platform administrator.`;
    }
    return `Please contact your SaaS platform administrator to assign an active plan and resume full POS operations.`;
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={{ fontSize: 36 }}>{getIcon()}</Text>
        </View>

        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.restaurantName}>{restaurantName}</Text>

        <Text style={styles.description}>{getSubtext()}</Text>

        <View style={styles.guaranteeBox}>
          <Text style={{ fontSize: 16 }}>🛡️</Text>
          <Text style={styles.guaranteeText}>
            Data Protected: No products, tables, or orders are deleted.
          </Text>
        </View>

        <View style={styles.buttonRow}>
          {onRefresh && (
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
              <Text style={styles.refreshButtonText}>🔄 Check Status</Text>
            </TouchableOpacity>
          )}

          {onLogout && (
            <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
              <Text style={styles.logoutButtonText}>🚪 Log Out</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    maxWidth: 520,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    textAlign: 'center',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 14,
  },
  description: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
    gap: 10,
  },
  guaranteeText: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '500',
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
});
