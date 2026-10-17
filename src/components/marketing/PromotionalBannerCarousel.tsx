import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { marketingService } from '../../services/api/marketingService';
import { WebsiteBanner } from '../../types/marketing';

const LOCAL_BANNER_ASSETS: Record<string, any> = {
  '/banners/banner-complete-management.jpg': require('../../../assets/images/banner-complete-management.jpg'),
  '/banners/banner-durga-puja-offer.jpg': require('../../../assets/images/banner-durga-puja-offer.jpg'),
};

export function PromotionalBannerCarousel() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Initialize with empty array and loading state to prevent wrong square image flash on refresh
  const [banners, setBanners] = useState<WebsiteBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    const loadBanners = async () => {
      try {
        const activeBanners = await marketingService.getActiveBanners();
        if (isMounted) {
          if (activeBanners && activeBanners.length > 0) {
            // Discard any default dummy banner referencing the unrelated square image
            const validBanners = activeBanners.filter(
              (b) =>
                b.id !== 'banner-complete-management-default' &&
                b.desktop_image_url !== '/banners/banner-complete-management.jpg'
            );
            setBanners(validBanners);
          } else {
            setBanners([]);
          }
        }
      } catch (e) {
        console.warn('Failed to load banners:', e);
        if (isMounted) {
          setBanners([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadBanners();
    return () => {
      isMounted = false;
    };
  }, []);

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

  // If banners are loading, show a neutral skeleton container with matching 16:5 aspect ratio
  if (isLoading) {
    return (
      <View style={styles.carouselContainer}>
        <View style={styles.skeletonCard} />
      </View>
    );
  }

  // If no banners are available, do not render any temporary fallback
  if (banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentIndex];
  // On mobile, never substitute the old square image
  const mobileImage =
    currentBanner.mobile_image_url &&
    currentBanner.mobile_image_url !== '/banners/banner-complete-management.jpg'
      ? currentBanner.mobile_image_url
      : null;
  const rawImageUrl = isMobile && mobileImage
    ? mobileImage
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
        activeOpacity={currentBanner.cta_url ? 0.95 : 1}
        disabled={!currentBanner.cta_url}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={styles.sharpBannerImage}
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
    paddingTop: 16,
    paddingBottom: 8,
  },
  skeletonCard: {
    width: '100%',
    aspectRatio: 16 / 5,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  bannerCard: {
    width: '100%',
    aspectRatio: 16 / 5,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharpBannerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  fallbackCard: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
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
    top: 12,
    right: 14,
    backgroundColor: '#FC8019',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  navArrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  navArrowLeft: {
    left: 14,
  },
  navArrowRight: {
    right: 14,
  },
  navArrowIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  dotsPill: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  dotItem: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotItemActive: {
    width: 24,
    backgroundColor: '#FC8019',
  },
});
