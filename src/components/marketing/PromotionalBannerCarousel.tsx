import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { marketingService } from '../../services/api/marketingService';
import { WebsiteBanner } from '../../types/marketing';

export function PromotionalBannerCarousel() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [banners, setBanners] = useState<WebsiteBanner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    try {
      const activeBanners = await marketingService.getActiveBanners();
      setBanners(activeBanners);
    } catch (e) {
      console.warn('Failed to load banners:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (banners.length > 1) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      }, 5000);
      return () => clearInterval(timerRef.current);
    }
  }, [banners.length]);

  if (loading || banners.length === 0) {
    return null; // Don't render empty space if no banners exist
  }

  const currentBanner = banners[currentIndex];
  const imageUrl = isMobile && currentBanner.mobile_image_url
    ? currentBanner.mobile_image_url
    : currentBanner.desktop_image_url;

  const handleCta = () => {
    if (!currentBanner.cta_url) return;
    if (currentBanner.is_external_link) {
      Linking.openURL(currentBanner.cta_url).catch(() => {});
    } else {
      router.push(currentBanner.cta_url as any);
    }
  };

  return (
    <View style={styles.carouselContainer}>
      <View style={styles.bannerCard}>
        {/* Background Image if available */}
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.bannerImageBg}
            resizeMode="cover"
          />
        ) : null}

        {/* Gradient Overlay */}
        <View style={styles.bannerOverlay}>
          <View style={styles.contentCol}>
            {currentBanner.badge_text ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{currentBanner.badge_text}</Text>
              </View>
            ) : null}

            <Text style={styles.headline} numberOfLines={2}>
              {currentBanner.headline}
            </Text>

            {currentBanner.subheadline ? (
              <Text style={styles.subheadline} numberOfLines={2}>
                {currentBanner.subheadline}
              </Text>
            ) : null}

            {currentBanner.cta_label ? (
              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={handleCta}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaBtnText}>{currentBanner.cta_label} →</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Pagination Indicators */}
          {banners.length > 1 && (
            <View style={styles.dotsRow}>
              {banners.map((_, idx) => (
                <TouchableOpacity
                  key={`dot-${idx}`}
                  onPress={() => setCurrentIndex(idx)}
                  style={[styles.dot, idx === currentIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carouselContainer: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  bannerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 140,
    justifyContent: 'center',
  },
  bannerImageBg: {
    ...(StyleSheet.absoluteFill as any),
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 24,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 140,
  },
  contentCol: {
    flex: 1,
    gap: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FC8019',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subheadline: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 18,
  },
  ctaBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ctaBtnText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'flex-end',
    paddingBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FC8019',
  },
});
