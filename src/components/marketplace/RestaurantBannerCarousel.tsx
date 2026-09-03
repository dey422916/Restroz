import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { OptimizedImage } from '../common/OptimizedImage';

interface RestaurantBannerCarouselProps {
  images: string[];
  restaurantName: string;
  logoUrl?: string;
  cuisines?: string[];
  address?: string;
  rating?: number | string;
  ratingCount?: string;
  estimatedTime?: number;
  minOrder?: number;
  deliveryFee?: number | string;
  isOpen?: boolean;
}

const DEFAULT_BANNER =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

export const RestaurantBannerCarousel: React.FC<RestaurantBannerCarouselProps> = ({
  images,
  restaurantName,
  logoUrl,
  cuisines = ['Multi-Cuisine', 'Fast Food', 'North Indian'],
  address,
  rating = '4.6',
  ratingCount = '50+ reviews',
  estimatedTime = 35,
  minOrder = 0,
  deliveryFee = 'FREE',
  isOpen = true,
}) => {
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width - 32, 1280);
  const isMobile = width < 768;

  const validImages = useMemoImages(images);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isManualInteracting, setIsManualInteracting] = useState(false);
  const timerRef = useRef<any>(null);
  const touchStartX = useRef(0);

  // Auto-scroll every 5 seconds when multiple images exist
  useEffect(() => {
    if (validImages.length <= 1 || isManualInteracting) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % validImages.length);
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [validImages.length, isManualInteracting]);

  const triggerAutoSlideReset = useCallback(() => {
    setIsManualInteracting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => {
      setIsManualInteracting(false);
    }, 6000);
  }, []);

  const goToSlide = (index: number) => {
    triggerAutoSlideReset();
    const target = Math.max(0, Math.min(index, validImages.length - 1));
    setCurrentIndex(target);
  };

  const goToPrev = () => {
    const prev = (currentIndex - 1 + validImages.length) % validImages.length;
    goToSlide(prev);
  };

  const goToNext = () => {
    const next = (currentIndex + 1) % validImages.length;
    goToSlide(next);
  };

  const handleTouchStart = (e: any) => {
    touchStartX.current = e.nativeEvent.pageX || (e.nativeEvent.touches && e.nativeEvent.touches[0]?.pageX) || 0;
  };

  const handleTouchEnd = (e: any) => {
    const endX = e.nativeEvent.pageX || (e.nativeEvent.changedTouches && e.nativeEvent.changedTouches[0]?.pageX) || 0;
    const diff = touchStartX.current - endX;
    if (diff > 45) {
      goToNext();
    } else if (diff < -45) {
      goToPrev();
    }
  };

  const currentImageUri = validImages[currentIndex] || DEFAULT_BANNER;

  const renderHeroOverlay = () => (
    <View
      style={[
        styles.overlayContent,
        isMobile && { paddingHorizontal: 46, paddingVertical: 14 },
      ]}
      pointerEvents="box-none"
    >
      {/* Open/Closed Badge */}
      <View style={[styles.statusPill, isOpen ? styles.statusOpen : styles.statusClosed]}>
        <View style={[styles.statusDot, isOpen ? styles.statusDotOpen : styles.statusDotClosed]} />
        <Text style={[styles.statusText, isOpen ? styles.statusTextOpen : styles.statusTextClosed]}>
          {isOpen ? 'Open' : 'Closed'}
        </Text>
      </View>

      {/* Restaurant Title & Logo Row */}
      <View style={styles.titleRow}>
        {logoUrl ? (
          <OptimizedImage source={logoUrl} type="logo" style={styles.logoImg} contentFit="contain" />
        ) : null}
        <Text style={[styles.restaurantTitle, isMobile && { fontSize: 20 }]} numberOfLines={1}>
          {restaurantName}
        </Text>
        <Text style={styles.verifiedBadge}>🎖️</Text>
      </View>

      {/* Cuisines */}
      <Text style={styles.cuisineText} numberOfLines={1}>
        {cuisines.join(' • ')}
      </Text>

      {/* Address */}
      <Text style={styles.addressText} numberOfLines={1}>
        📍 {address || 'Doorstep Delivery Available'}
      </Text>

      {/* Rating Pill */}
      <View style={styles.ratingPill}>
        <Text style={styles.ratingStar}>★</Text>
        <Text style={styles.ratingScore}>{rating}</Text>
        <Text style={styles.ratingReviews}>{ratingCount}</Text>
      </View>

      {/* Meta Information Row */}
      <View style={styles.metaRow}>
        {/* Delivery Time */}
        <View style={styles.metaCapsule}>
          <Text style={{ fontSize: 16 }}>⏱️</Text>
          <View>
            <Text style={styles.metaMain}>{estimatedTime} mins</Text>
            <Text style={styles.metaSub}>Delivery Time</Text>
          </View>
        </View>

        {/* Minimum Order */}
        <View style={styles.metaCapsule}>
          <Text style={{ fontSize: 16 }}>₹</Text>
          <View>
            <Text style={styles.metaMain}>₹{minOrder}</Text>
            <Text style={styles.metaSub}>Min. Order</Text>
          </View>
        </View>

        {/* Delivery Fee */}
        <View style={styles.metaCapsule}>
          <Text style={{ fontSize: 16 }}>🛵</Text>
          <View>
            <Text style={styles.metaMain}>
              {typeof deliveryFee === 'number' ? (deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`) : deliveryFee}
            </Text>
            <Text style={styles.metaSub}>Delivery Fee</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <View
        style={[styles.carouselContainer, isMobile && { minHeight: 260, aspectRatio: undefined }]}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background Image Layer - Absolute Fill with Memory & Disk Caching */}
        <OptimizedImage
          key={`hero-img-${currentIndex}-${currentImageUri}`}
          source={currentImageUri}
          type="banner"
          style={[StyleSheet.absoluteFillObject, styles.slideImage]}
          contentFit="cover"
        />

        {/* Dark Gradient Overlay for Maximum Readability */}
        <View style={styles.darkGradientOverlay} />

        {/* Overlaid Restaurant Info (Matching Reference Image) */}
        {renderHeroOverlay()}

        {/* Left Arrow Button */}
        {validImages.length > 1 && (
          <TouchableOpacity
            style={[styles.arrowBtn, styles.leftArrow, isMobile && { width: 32, height: 32, left: 8 }]}
            onPress={goToPrev}
            activeOpacity={0.7}
            accessibilityLabel="Previous image"
          >
            <Text style={[styles.arrowText, isMobile && { fontSize: 20, lineHeight: 22 }]}>‹</Text>
          </TouchableOpacity>
        )}

        {/* Right Arrow Button */}
        {validImages.length > 1 && (
          <TouchableOpacity
            style={[styles.arrowBtn, styles.rightArrow, isMobile && { width: 32, height: 32, right: 8 }]}
            onPress={goToNext}
            activeOpacity={0.7}
            accessibilityLabel="Next image"
          >
            <Text style={[styles.arrowText, isMobile && { fontSize: 20, lineHeight: 22 }]}>›</Text>
          </TouchableOpacity>
        )}

        {/* Centered Indicator Dots */}
        {validImages.length > 1 && (
          <View style={styles.dotsContainer}>
            {validImages.map((_, idx) => {
              const isActive = idx === currentIndex;
              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() => goToSlide(idx)}
                  style={[
                    styles.dot,
                    isActive ? styles.activeDot : styles.inactiveDot,
                  ]}
                  activeOpacity={0.8}
                />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

function useMemoImages(imgs?: string[]): string[] {
  if (!imgs || !Array.isArray(imgs) || imgs.length === 0) {
    return [DEFAULT_BANNER];
  }
  const clean = imgs.filter((url) => typeof url === 'string' && url.trim().length > 0);
  return clean.length > 0 ? clean : [DEFAULT_BANNER];
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 10,
  },
  carouselContainer: {
    width: '100%',
    aspectRatio: 16 / 6.2,
    minHeight: 280,
    maxHeight: 380,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  darkGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  overlayContent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: 64,
    paddingVertical: 20,
    justifyContent: 'space-between',
    zIndex: 5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  statusOpen: {
    backgroundColor: 'rgba(22, 101, 52, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  statusClosed: {
    backgroundColor: 'rgba(153, 27, 27, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotOpen: {
    backgroundColor: '#4ADE80',
  },
  statusDotClosed: {
    backgroundColor: '#F87171',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextOpen: {
    color: '#DCFCE7',
  },
  statusTextClosed: {
    color: '#FEE2E2',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  logoImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  restaurantTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  verifiedBadge: {
    fontSize: 18,
  },
  cuisineText: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500',
    marginTop: 2,
  },
  addressText: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 101, 52, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginTop: 6,
  },
  ratingStar: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '800',
  },
  ratingScore: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  ratingReviews: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  metaCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  metaMain: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  metaSub: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '500',
  },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  leftArrow: {
    left: 12,
  },
  rightArrow: {
    right: 12,
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 26,
    marginTop: -2,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  dot: {
    height: 7,
    borderRadius: 3.5,
  },
  activeDot: {
    width: 18,
    backgroundColor: '#EA580C', // Orange active indicator as shown in reference image
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  inactiveDot: {
    width: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
});
