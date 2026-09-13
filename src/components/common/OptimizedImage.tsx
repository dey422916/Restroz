import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StyleProp, ViewStyle, Platform, ImageStyle } from 'react-native';
import { Image, ImageProps, ImageContentFit, ImageSource } from 'expo-image';

export interface OptimizedImageProps extends Omit<ImageProps, 'source'> {
  source?: string | ImageSource | number | null;
  fallbackSource?: string | ImageSource | number;
  contentFit?: ImageContentFit;
  containerStyle?: StyleProp<ViewStyle>;
  showLoader?: boolean;
  blurhash?: string;
  type?: 'product' | 'restaurant' | 'banner' | 'logo' | 'avatar' | 'generic';
}

const DEFAULT_FALLBACKS: Record<string, string> = {
  product: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
  banner: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
  logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=200&q=80',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
  generic: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
};

const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  source,
  fallbackSource,
  contentFit = 'cover',
  containerStyle,
  style,
  showLoader = false,
  blurhash = DEFAULT_BLURHASH,
  type = 'generic',
  transition = 200,
  ...restProps
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [source]);

  const fallback = fallbackSource || DEFAULT_FALLBACKS[type] || DEFAULT_FALLBACKS.generic;

  // Resolve valid image source string / object and extract focal position if encoded
  let rawUri: string = '';
  if (typeof source === 'string') {
    rawUri = source;
  } else if (source && typeof source === 'object' && 'uri' in source) {
    rawUri = (source as any).uri || '';
  }

  const isRawUrl = Boolean(rawUri);
  let resolvedPosY = 50;
  if (rawUri.includes('#pos=') || rawUri.includes('#y=')) {
    const match = rawUri.match(/#(?:pos|y)=(\d+(?:\.\d+)?)/);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) resolvedPosY = Math.min(100, Math.max(0, Math.round(val)));
    }
  }

  const cleanUri = rawUri ? rawUri.split('#')[0] : '';

  let resolvedUri: string = '';
  let resolvedSource: any = source;

  if (!source || hasError) {
    resolvedSource = fallback;
    resolvedUri = typeof fallback === 'string' ? fallback : '';
  } else if (cleanUri) {
    resolvedSource = { uri: cleanUri };
    resolvedUri = cleanUri;
  }

  // Web rendering: Use reliable standard <img> with object-fit for 100% robust layout & zero height collapsing
  if (Platform.OS === 'web' && resolvedUri) {
    const flattened = StyleSheet.flatten([styles.container, style, containerStyle]) || {};
    const imgFit: any = contentFit === 'contain' ? 'contain' : contentFit === 'cover' ? 'cover' : 'fill';

    return (
      <View style={[styles.container, style, containerStyle]}>
        <img
          src={resolvedUri}
          alt=""
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: imgFit,
            objectPosition: `50% ${resolvedPosY}%`,
            display: 'block',
            borderRadius: (flattened as any)?.borderRadius || 0,
          }}
          onError={() => setHasError(true)}
          onLoad={() => setIsLoading(false)}
        />
        {showLoader && isLoading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color="#EA580C" />
          </View>
        )}
      </View>
    );
  }

  // Native rendering: Use expo-image with memory-disk cache and blurhash placeholder
  return (
    <View style={[styles.container, style, containerStyle]}>
      <Image
        {...restProps}
        source={resolvedSource}
        contentFit={contentFit}
        contentPosition={{ top: `${resolvedPosY}%`, left: '50%' }}
        cachePolicy="memory-disk"
        placeholder={blurhash}
        transition={transition}
        onLoadStart={() => setIsLoading(true)}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        style={styles.image}
      />
      {showLoader && isLoading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="small" color="#EA580C" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(240, 240, 240, 0.4)',
  },
});

export default OptimizedImage;
