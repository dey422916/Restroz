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
import { marketingService, DEFAULT_MARKETING_BANNERS } from '../../services/api/marketingService';
import { WebsiteBanner } from '../../types/marketing';

const LOCAL_BANNER_ASSETS: Record<string, any> = {
  '/banners/banner-complete-management.jpg': require('../../../assets/images/banner-complete-management.jpg'),
  '/banners/banner-durga-puja-offer.jpg': require('../../../assets/images/banner-durga-puja-offer.jpg'),
};

export function PromotionalBannerCarousel() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [banners, setBanners] = useState<WebsiteBanner[]>(DEFAULT_MARKETING_BANNERS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    try {
      const activeBanners = await marketingService.getActiveBanners();
      if (activeBanners && activeBanners.length > 0) {
        setBanners(activeBanners);
      }
    } catch (e) {
      console.warn('Failed to load banners:', e);
    }
  };

  useEffect(() => {
    if (banners.length > 1) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      }, 6500);
      return () => clearInterval(timerRef.current);
    }
  }, [banners.length]);

  const handlePrev = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentIndex((prev) => (prev === 0 ? banners.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  if (banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentIndex];
  const rawImageUrl = isMobile && currentBanner.mobile_image_url
    ? currentBanner.mobile_image_url
    : currentBanner.desktop_image_url;

  const imageSource = rawImageUrl && LOCAL_BANNER_ASSETS[rawImageUrl]
    ? LOCAL_BANNER_ASSETS[rawImageUrl]
    : rawImageUrl
    ? { uri: rawImageUrl }
    : null;

  const handleCta = () => {
    if (!currentBanner.cta_url) return;
    if (currentBanner.is_external_link) {
      Linking.openURL(currentBanner.cta_url).catch(() => {});
    } else {
      router.push(currentBanner.cta_url as any);
    }
  };

  const bannerHeight = isMobile ? 360 : 480;

  return (
    <View style={styles.carouselContainer}>
      <TouchableOpacity
        style={[styles.bannerCard, { height: bannerHeight }]}
        onPress={handleCta}
        activeOpacity={0.92}
      >
        {/* Ambient Color Aura Layer (Matches image colors seamlessly) */}
        {imageSource ? (
          <Image
            source={imageSource}
            style={styles.ambientBlurBg}
            blurRadius={Platform.OS === 'web' ? 45 : 25}
            resizeMode="cover"
          />
        ) : null}

        {/* Ambient Dark Tint & Vignette */}
        <View style={styles.ambientDarkTint} />

        {/* Sharp Foreground Content Container */}
        <View style={styles.foregroundWrapper}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={[
                styles.sharpBannerImage,
                { height: bannerHeight - (isMobile ? 24 : 32) }
              ]}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.fallbackCard}>
              <Text style={styles.headline}>{currentBanner.headline}</Text>
              {currentBanner.subheadline ? (
                <Text style={styles.subheadline}>{currentBanner.subheadline}</Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Floating Category Badge */}
        {currentBanner.badge_text ? (
          <View style={styles.floatingBadge}>
            <Text style={styles.floatingBadgeText}>{currentBanner.badge_text}</Text>
          </View>
        ) : null}

        {/* Previous Navigation Arrow */}
        {banners.length > 1 && (
          <TouchableOpacity
            style={[styles.navArrowBtn, styles.navArrowLeft]}
            onPress={(e) => {
              e.stopPropagation?.();
              handlePrev();
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Text style={styles.navArrowIcon}>❮</Text>
          </TouchableOpacity>
        )}

        {/* Next Navigation Arrow */}
        {banners.length > 1 && (
          <TouchableOpacity
            style={[styles.navArrowBtn, styles.navArrowRight]}
            onPress={(e) => {
              e.stopPropagation?.();
              handleNext();
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Text style={styles.navArrowIcon}>❯</Text>
          </TouchableOpacity>
        )}

        {/* Bottom Pagination Indicator */}
        {banners.length > 1 && (
          <View style={styles.dotsPill}>
            {banners.map((_, idx) => (
              <TouchableOpacity
                key={`dot-${idx}`}
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (timerRef.current) clearInterval(timerRef.current);
                  setCurrentIndex(idx);
                }}
                style={[styles.dotItem, idx === currentIndex && styles.dotItemActive]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              />
            ))}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  carouselContainer: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  bannerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ambientBlurBg: {
    ...(StyleSheet.absoluteFill as any),
    width: '100%',
    height: '100%',
    opacity: 0.5,
    transform: [{ scale: 1.15 }],
  },
  ambientDarkTint: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  foregroundWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 2,
  },
  sharpBannerImage: {
    width: '100%',
    maxWidth: 1200,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  fallbackCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subheadline: {
    color: '#CBD5E1',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  floatingBadge: {
    position: 'absolute',
    top: 16,
    right: 18,
    backgroundColor: '#FC8019',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  navArrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  navArrowLeft: {
    left: 18,
  },
  navArrowRight: {
    right: 18,
  },
  navArrowIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  dotsPill: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    zIndex: 10,
  },
  dotItem: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  dotItemActive: {
    width: 26,
    backgroundColor: '#FC8019',
  },
});
