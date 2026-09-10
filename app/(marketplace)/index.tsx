import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { Restaurant, RestaurantPublicProfile, CustomerAddress } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { parseBannerUrls } from '../../src/utils/mediaUtils';
import { supabase, isSupabaseConfigured } from '../../src/services/supabase';
import { OptimizedImage } from '../../src/components/common/OptimizedImage';

const CUISINES = [
  'All',
  'Pure Veg',
  'North Indian',
  'Chinese',
  'Beverages',
  'Fast Food',
  'Chai & Snacks',
];

const DEFAULT_BANNER = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80';

export default function MarketplaceHomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurants, setRestaurants] = useState<
    Array<Restaurant & { public_profile?: RestaurantPublicProfile }>
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('All');

  // Address Selector State
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null);
  const [addressModalVisible, setAddressModalVisible] = useState(false);

  // Responsive Grid Columns Calculation
  // Large desktop: 4 cards/row, Normal desktop/laptop: 3 cards/row, Tablet: 2 cards/row, Mobile: 1 card/row
  const numColumns = width >= 1300 ? 4 : width >= 960 ? 3 : width >= 640 ? 2 : 1;

  const loadData = async (addr?: CustomerAddress | null, forceRefresh: boolean = false) => {
    try {
      // 1. Fetch saved addresses if user is logged in
      let addrList: CustomerAddress[] = savedAddresses;
      if (user && (savedAddresses.length === 0 || forceRefresh)) {
        addrList = await marketplaceService.getCustomerAddresses().catch(() => []);
        setSavedAddresses(addrList);
      }

      // 2. Resolve active address (passed param -> current state -> default address -> first address)
      let activeAddr = addr !== undefined ? addr : selectedAddress;
      if (!activeAddr && addrList.length > 0) {
        activeAddr = addrList.find((a) => a.is_default) || addrList[0];
        setSelectedAddress(activeAddr);
      }

      // 3. Fetch restaurants in a SINGLE optimized pass with active address coordinates
      const restData = await marketplaceService.getMarketplaceRestaurants({
        customerLat: activeAddr?.latitude != null ? Number(activeAddr.latitude) : null,
        customerLng: activeAddr?.longitude != null ? Number(activeAddr.longitude) : null,
        customerCity: activeAddr?.city || null,
        forceRefresh,
      });

      setRestaurants(restData);
    } catch (e) {
      console.warn('Error loading marketplace data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Supabase Realtime subscription on restaurant_public_profiles for live open/closed updates
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `marketplace_profiles_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_public_profiles',
        },
        (payload) => {
          if (payload.new && (payload.new as any).restaurant_id) {
            const updatedRestId = (payload.new as any).restaurant_id;
            const newIsOpen =
              (payload.new as any).is_open !== false &&
              (payload.new as any).marketplace_enabled !== false;
            const newBanner = (payload.new as any).banner_url;
            marketplaceService.clearRestaurantCache();
            setRestaurants((prev) =>
              prev.map((item) => {
                if (item.id === updatedRestId) {
                  return {
                    ...item,
                    banner_url: newBanner || item.banner_url,
                    banner_urls: newBanner ? parseBannerUrls(newBanner) : (item as any).banner_urls,
                    public_profile: {
                      ...(item.public_profile || ({} as any)),
                      ...(payload.new as any),
                      banner_url: newBanner || item.public_profile?.banner_url,
                      banner_urls: newBanner ? parseBannerUrls(newBanner) : item.public_profile?.banner_urls,
                      is_open: newIsOpen,
                    },
                  };
                }
                return item;
              })
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    marketplaceService.clearRestaurantCache();
    loadData(selectedAddress, true);
  };

  const handleSelectAddress = (addr: CustomerAddress) => {
    setSelectedAddress(addr);
    setAddressModalVisible(false);
    // Instantaneous distance recalculation and sorting from memory cache
    marketplaceService
      .getMarketplaceRestaurants({
        customerLat: addr.latitude != null ? Number(addr.latitude) : null,
        customerLng: addr.longitude != null ? Number(addr.longitude) : null,
        customerCity: addr.city || null,
      })
      .then(setRestaurants);
  };

  const filteredRestaurants = restaurants.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      if (selectedCuisine === 'All') return true;
      if (selectedCuisine === 'Pure Veg') {
        return r.public_profile?.cuisine_tags?.some((c) => c.toLowerCase().includes('veg'));
      }
      return r.public_profile?.cuisine_tags?.some((c) => c.toLowerCase().includes(selectedCuisine.toLowerCase()));
    }

    const nameMatch = (r.name || '').toLowerCase().includes(q);
    const descMatch = (r.public_profile?.public_description || '').toLowerCase().includes(q);
    const cityMatch = (r.city || '').toLowerCase().includes(q);
    const addrMatch = (r.address || '').toLowerCase().includes(q);
    const cuisineMatch =
      r.public_profile?.cuisine_tags?.some((c) => c.toLowerCase().includes(q)) || false;

    const matchesQuery = nameMatch || descMatch || cityMatch || addrMatch || cuisineMatch;
    if (!matchesQuery) return false;

    if (selectedCuisine === 'All') return true;
    if (selectedCuisine === 'Pure Veg') {
      return r.public_profile?.cuisine_tags?.some((c) => c.toLowerCase().includes('veg'));
    }
    return r.public_profile?.cuisine_tags?.some((c) => c.toLowerCase().includes(selectedCuisine.toLowerCase()));
  });

  const getCardWidthStyle = () => {
    if (numColumns === 1) return { width: '100%' as const };
    if (numColumns === 2) return { width: '48.7%' as const };
    if (numColumns === 3) return { width: '31.8%' as const };
    return { width: '23.4%' as const };
  };

  return (
    <View style={styles.container}>
      {/* Mobile-Only Header with Single RestroZ Brand (Desktop uses Layout Navbar) */}
      {!isDesktop && (
        <View style={styles.mobileHeader}>
          <View style={styles.mobileHeaderInner}>
            <Image
              source={require('../../assets/images/restroz_logo.png')}
              style={styles.mobileLogo}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.mobileBrandName}>RestroZ</Text>
              <Text style={styles.mobileBrandTagline}>Every flavor, one place</Text>
            </View>
            {user ? (
              <TouchableOpacity
                style={styles.ordersShortcut}
                onPress={() => router.push('/(marketplace)/orders')}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18 }}>📋</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.loginBtnHeader}
                onPress={() => router.push('/(auth)/login')}
                activeOpacity={0.8}
              >
                <Text style={styles.loginBtnHeaderText}>Sign In</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: width < 768 ? 16 : 24, paddingBottom: 70 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainContainer}>
          {/* Delivery Location Section */}
          <View style={styles.locationSection}>
            <TouchableOpacity
              style={styles.locationCard}
              onPress={() => {
                if (user) {
                  setAddressModalVisible(true);
                } else {
                  router.push('/(auth)/login');
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.locationIconWrap}>
                <Text style={{ fontSize: 14 }}>📍</Text>
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.deliveringToLabel}>DELIVERING TO</Text>
                <Text style={styles.locationCity} numberOfLines={1}>
                  {selectedAddress
                    ? `${selectedAddress.label} — ${selectedAddress.city}, ${selectedAddress.postal_code}`
                    : 'Select Delivery Address'}
                </Text>
              </View>
              <View style={styles.dropdownPill}>
                <Text style={styles.dropdownArrow}>Change ▼</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Large Modern Search Bar */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search restaurants, cuisines, dishes..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#94A3B8"
            />
            {searchQuery ? (
              <TouchableOpacity style={styles.searchClearBtn} onPress={() => setSearchQuery('')}>
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Hero Promo Banner */}
          <View style={styles.promoBanner}>
            <View style={styles.promoContent}>
              <View style={styles.promoBadgeWrap}>
                <Text style={styles.promoBadge}>✨ RESTROZ FOOD MARKET</Text>
              </View>
              <Text style={styles.promoTitle}>Discover Top Kitchens & Fast Delivery</Text>
              <Text style={styles.promoSub}>Direct restaurant ordering • Pure authentic taste • Hot & fresh</Text>
            </View>
            <View style={styles.promoIconWrap}>
              <Text style={{ fontSize: 42 }}>🍲</Text>
            </View>
          </View>

          {/* Category Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.cuisineRow}
            contentContainerStyle={styles.cuisineRowContent}
          >
            {CUISINES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.cuisineChip, selectedCuisine === c && styles.cuisineChipActive]}
                onPress={() => setSelectedCuisine(c)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.cuisineChipText,
                    selectedCuisine === c && styles.cuisineChipTextActive,
                  ]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedAddress ? 'Nearby Restaurants' : 'Available Restaurants'}
              <Text style={styles.sectionCount}> ({filteredRestaurants.length})</Text>
            </Text>
            <Text style={styles.sectionSubtitle}>
              {selectedAddress
                ? `Sorted for delivery to ${selectedAddress.city} • Verified cloud kitchens & restaurants`
                : 'Clean, verified kitchens serving your area'}
            </Text>
          </View>

          {/* Responsive Restaurants Grid */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={customerColors.primary} />
              <Text style={styles.loadingText}>Finding nearby restaurants...</Text>
            </View>
          ) : filteredRestaurants.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 42 }}>🍽️</Text>
              <Text style={styles.emptyTitle}>No Restaurants Found</Text>
              <Text style={styles.emptySub}>
                Try adjusting your search query or selecting a different cuisine filter.
              </Text>
            </View>
          ) : (
            <View style={styles.restaurantGrid}>
              {filteredRestaurants.map((r) => {
                const profile = r.public_profile;
                const isOpen = profile?.is_open !== false;
                const cuisines = profile?.cuisine_tags?.join(' • ') || 'Multi-Cuisine';
                const deliveryTime = profile?.estimated_delivery_minutes || 35;
                const minOrder = profile?.minimum_order_value || 0;
                const parsedBanners = parseBannerUrls(profile?.banner_url || r.banner_url || (r as any).banner_urls);
                const bannerUrl = parsedBanners[0] || DEFAULT_BANNER;
                const distanceKm = profile?.distance_km;
                const isOutside = profile?.is_outside_radius;

                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.restaurantCard,
                      getCardWidthStyle(),
                      numColumns === 1 && { marginBottom: 16 },
                      !isOpen && styles.restaurantCardDisabled,
                    ]}
                    onPress={() => router.push(`/(marketplace)/restaurant/${r.id}` as any)}
                    activeOpacity={isOpen ? 0.88 : 0.95}
                  >
                    {/* Image / Banner */}
                    <View style={[styles.cardCover, { height: numColumns === 1 ? 180 : 165 }]}>
                      <OptimizedImage
                        source={bannerUrl}
                        type="banner"
                        style={[styles.cardImage, !isOpen && styles.cardImageDimmed]}
                      />

                      {!isOpen && (
                        <View style={styles.closedOverlay}>
                          <View style={styles.closedBadgeBox}>
                            <Text style={styles.closedText}>🔴 CLOSED</Text>
                            <Text style={styles.closedSubText}>Not accepting orders</Text>
                          </View>
                        </View>
                      )}

                      {/* Delivery / Distance Badge */}
                      <View style={styles.badgeContainer}>
                        {isOpen ? (
                          <View style={styles.openStatusBadge}>
                            <Text style={styles.openStatusBadgeText}>🟢 OPEN</Text>
                          </View>
                        ) : null}
                        <View style={styles.deliveryTimeBadge}>
                          <Text style={styles.deliveryTimeText}>⚡ {deliveryTime} MINS</Text>
                        </View>
                        {distanceKm != null && (
                          <View style={styles.distanceBadge}>
                            <Text style={styles.distanceBadgeText}>📍 {distanceKm} km</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Card Content */}
                    <View style={styles.cardBody}>
                      <View style={styles.cardMainRow}>
                        <Text style={styles.cardName} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <View style={styles.ratingBadge}>
                          <Text style={styles.ratingText}>★ 4.6</Text>
                        </View>
                      </View>

                      <Text style={styles.cardCuisines} numberOfLines={1}>
                        {cuisines}
                      </Text>

                      {/* Outside Radius Warning */}
                      {isOutside && (
                        <View style={styles.outsideRadiusBadge}>
                          <Text style={styles.outsideRadiusText}>⚠️ Outside delivery area</Text>
                        </View>
                      )}

                      <View style={styles.cardMetaRow}>
                        <Text style={styles.cardMetaText} numberOfLines={1}>
                          📍 {r.address ? `${r.address}, ${r.city}` : (r.city || 'Local Delivery')}
                        </Text>
                        {minOrder > 0 && (
                          <View style={styles.minOrderBadge}>
                            <Text style={styles.minOrderText}>Min ₹{minOrder}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Address Selection Modal */}
      <Modal visible={addressModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Delivery Location</Text>
              <TouchableOpacity onPress={() => setAddressModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={{ fontSize: 16, color: '#64748B', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {savedAddresses.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
                    You have no saved addresses yet.
                  </Text>
                </View>
              ) : (
                savedAddresses.slice(0, 4).map((addr) => {
                  const isSelected = selectedAddress?.id === addr.id;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.addrOption, isSelected && styles.addrOptionSelected]}
                      onPress={() => handleSelectAddress(addr)}
                    >
                      <View style={styles.addrRadio}>
                        <View style={[styles.addrRadioInner, isSelected && styles.addrRadioInnerActive]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.addrLabel}>{addr.label}</Text>
                          {addr.is_default && (
                            <View style={styles.defaultBadge}>
                              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.addrText} numberOfLines={2}>
                          {addr.address_line1}, {addr.city} - {addr.postal_code}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.addNewAddrBtn}
                onPress={() => {
                  setAddressModalVisible(false);
                  router.push('/(marketplace)/addresses' as any);
                }}
              >
                <Text style={styles.addNewAddrText}>➕ Add New Address</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.manageAddrBtn}
                onPress={() => {
                  setAddressModalVisible(false);
                  router.push('/(marketplace)/addresses' as any);
                }}
              >
                <Text style={styles.manageAddrText}>⚙️ Manage Addresses</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  mobileHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDEBE6',
    width: '100%',
  },
  mobileHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  mobileLogo: {
    width: 36,
    height: 36,
  },
  mobileBrandName: {
    fontSize: 18,
    fontWeight: '900',
    color: customerColors.primary,
    letterSpacing: -0.4,
  },
  mobileBrandTagline: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  ordersShortcut: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  loginBtnHeader: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: customerColors.primary,
  },
  loginBtnHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  mainContainer: {
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
  },
  locationSection: {
    marginBottom: 14,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  locationIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF4EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  deliveringToLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: customerColors.primary,
    letterSpacing: 0.6,
  },
  locationCity: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 1,
  },
  dropdownPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dropdownArrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  searchClearBtn: {
    padding: 6,
  },
  searchClearText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  promoBanner: {
    backgroundColor: '#1E232F',
    borderRadius: 16,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  promoContent: {
    flex: 1,
    marginRight: 16,
  },
  promoBadgeWrap: {
    backgroundColor: 'rgba(252, 128, 25, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  promoBadge: {
    color: '#FF9E40',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  promoTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  promoSub: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
  promoIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cuisineRow: {
    marginBottom: 18,
  },
  cuisineRowContent: {
    gap: 8,
    paddingRight: 8,
  },
  cuisineChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  cuisineChipActive: {
    backgroundColor: customerColors.primary,
    borderColor: customerColors.primary,
    shadowColor: customerColors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  cuisineChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  cuisineChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionCount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  restaurantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'flex-start',
    width: '100%',
  },
  restaurantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  restaurantCardDisabled: {
    opacity: 0.72,
    backgroundColor: '#FAFAFA',
    borderColor: '#E2E8F0',
  },
  cardCover: {
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardImageDimmed: {
    opacity: 0.45,
  },
  closedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  closedBadgeBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  closedText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  closedSubText: {
    color: '#FEE2E2',
    fontWeight: '600',
    fontSize: 10,
    marginTop: 2,
  },
  openStatusBadge: {
    backgroundColor: 'rgba(5, 150, 105, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  openStatusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  deliveryTimeBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deliveryTimeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  distanceBadge: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  distanceBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cardBody: {
    padding: 14,
  },
  cardMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  cardCuisines: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  ratingBadge: {
    backgroundColor: '#11883B',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  outsideRadiusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  outsideRadiusText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '700',
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardMetaText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    marginRight: 6,
  },
  minOrderBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  minOrderText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '700',
  },
  center: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyWrap: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 480,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
  },
  addrOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  addrOptionSelected: {
    borderColor: customerColors.primary,
    backgroundColor: '#FFF4EB',
  },
  addrRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addrRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  addrRadioInnerActive: {
    backgroundColor: customerColors.primary,
  },
  addrLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  defaultBadge: {
    backgroundColor: '#FFF4EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: customerColors.primary,
  },
  addrText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  addNewAddrBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: customerColors.primary,
    alignItems: 'center',
  },
  addNewAddrText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  manageAddrBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  manageAddrText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
});
