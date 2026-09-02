import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

interface FeatureLockCardProps {
  featureTitle: string;
  description?: string;
  requiredPlan?: string;
  onUpgradePress?: () => void;
}

export const FeatureLockCard: React.FC<FeatureLockCardProps> = ({
  featureTitle,
  description,
  requiredPlan = 'Pro or Enterprise',
  onUpgradePress,
}) => {
  const router = useRouter();

  const handleGoToPlan = () => {
    if (onUpgradePress) {
      onUpgradePress();
    } else {
      router.push('/(admin)/my-plan' as any);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>🔒</Text>
      </View>
      <Text style={styles.title}>{featureTitle} Locked</Text>
      <Text style={styles.subtitle}>
        {description ||
          `This feature is not included in your current subscription plan. Upgrade to the ${requiredPlan} plan to unlock it.`}
      </Text>

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleGoToPlan}>
          <Text style={styles.primaryBtnText}>✨ View My Plan & Upgrade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    marginHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 420,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: '#ea580c',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
