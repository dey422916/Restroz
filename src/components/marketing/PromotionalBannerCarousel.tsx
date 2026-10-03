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
  const [loading, setLoading] = useState(false);
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
      }, 6000);
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

  return (
    <View style={styles.carouselContainer}>
      <TouchableOpacity
        style={styles.bannerCard}
        onPress={handleCta}
        activeOpacity={0.92}
      >
        {/* Banner Graphic Image */}
        {imageSource ? (
          <Image
            source={imageSource}
            style={[
              styles.bannerImage,
              { height: isMobile ? 320 : 440 }
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

        {/* Previous Button */}
        {banners.length > 1 && (
          <TouchableOpacity
            style={[styles.arrowBtn, styles.arrowLeft]}
            onPress={(e) => {
              e.stopPropagation?.();
              handlePrev();
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.arrowText}>❮</Text>
          </TouchableOpacity>
        )}

        {/* Next Button */}
        {banners.length > 1 && (
          <TouchableOpacity
            style={[styles.arrowBtn, styles.arrowRight]}
            onPress={(e) => {
              e.stopPropagation?.();
              handleNext();
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.arrowText}>❯</Text>
          </TouchableOpacity>
        )}

        {/* Bottom Pagination Dots */}
        {banners.length > 1 && (
          <View style={styles.dotsRow}>
            {banners.map((_, idx) => (
              <TouchableOpacity
                key={`dot-${idx}`}
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (timerRef.current) clearInterval(timerRef.current);
                  setCurrentIndex(idx);
                }}
                style={[styles.dot, idx === currentIndex && styles.dotActive]}
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
    paddingTop: 24,
    paddingBottom: 8,
  },
  bannerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerImage: {
    width: '100%',
    backgroundColor: '#0B1120',
  },
  fallbackCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subheadline: {
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowLeft: {
    left: 16,
  },
  arrowRight: {
    right: 16,
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#FC8019',
  },
});
