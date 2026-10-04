import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

export interface AlternatingFeatureProps {
  badge: string;
  title: string;
  subtitle: string;
  bullets: { title: string; desc: string }[];
  ctaText?: string;
  ctaRoute?: string;
  reversed?: boolean;
  visualComponent: React.ReactNode;
}

export function AlternatingFeatureRow({
  badge,
  title,
  subtitle,
  bullets,
  ctaText = 'Learn more',
  ctaRoute,
  reversed = false,
  visualComponent,
}: AlternatingFeatureProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;

  const isReversedLayout = isDesktop && reversed;

  return (
    <View style={styles.rowContainer}>
      <View
        style={[
          styles.rowInner,
          !isDesktop && styles.rowInnerMobile,
          isReversedLayout && styles.rowInnerReversed,
        ]}
      >
        {/* Copy Col */}
        <View style={styles.copyCol}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.bulletsList}>
            {bullets.map((b, idx) => (
              <View key={`bullet-${idx}`} style={styles.bulletItem}>
                <View style={styles.checkBadge}>
                  <Text style={styles.checkIcon}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bulletTitle}>{b.title}</Text>
                  <Text style={styles.bulletDesc}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {ctaRoute && (
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push(ctaRoute as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaBtnText}>{ctaText} →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Visual Mockup Col */}
        <View style={styles.visualCol}>
          {visualComponent}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    paddingVertical: 48,
    width: '100%',
  },
  rowInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 48,
  },
  rowInnerMobile: {
    flexDirection: 'column',
    gap: 32,
  },
  rowInnerReversed: {
    flexDirection: 'row-reverse',
  },
  copyCol: {
    flex: 1,
    gap: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
  },
  bulletsList: {
    gap: 16,
    paddingTop: 8,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkIcon: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '900',
  },
  bulletTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  bulletDesc: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 18,
  },
  ctaBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#FAF9F6',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  ctaBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  visualCol: {
    flex: 1,
    width: '100%',
  },
});
