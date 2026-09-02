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

  const loadData = async (addr?: CustomerAddress | null) => {
    try {
      const activeAddr = addr !== undefined ? addr : selectedAddress;
      const [restData, addrList] = await Promise.all([
        marketplaceService.getMarketplaceRestaurants({
          customerLat: activeAddr?.latitude != null ? Number(activeAddr.latitude) : null,
          customerLng: activeAddr?.longitude != null ? Number(activeAddr.longitude) : null,
          customerCity: activeAddr?.city || null,
        }),
        user ? marketplaceService.getCustomerAddresses().catch(() => []) : Promise.resolve([]),
      ]);

      setRestaurants(restData);
      setSavedAddresses(addrList);

      if (user && addrList.length > 0 && !selectedAddress && addr === undefined) {
        const def = (addrList as CustomerAddress[]).find((a: CustomerAddress) => a.is_default) || addrList[0];
        setSelectedAddress(def);
        // Reload restaurants with default address coordinates
        if (def.latitude != null && def.longitude != null) {
          const sorted = await marketplaceService.getMarketplaceRestaurants({
            customerLat: Number(def.latitude),
            customerLng: Number(def.longitude),
            customerCity: def.city,
          });
          setRestaurants(sorted);
        }
      }
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

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSelectAddress = (addr: CustomerAddress) => {
    setSelectedAddress(addr);
    setAddressModalVisible(false);
    setLoading(true);
    loadData(addr);
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
      {/* Top Navigation & Address Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerInner}>
          <Image
            source={require('../../assets/images/restroz_logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.deliveringToLabel}>RESTROZ MARKETPLACE</Text>
            <TouchableOpacity
              style={styles.locationSelector}
              onPress={() => {
                if (user) {
                  setAddressModalVisible(true);
                } else {
                  router.push('/(auth)/login');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.locationCity} numberOfLines={1}>
                {selectedAddress
                  ? `Delivering to: ${selectedAddress.label} — ${selectedAddress.city}, ${selectedAddress.postal_code} ▼`
                  : 'Delivering to: Select Address ▼'}
              </Text>
            </TouchableOpacity>
          </View>

          {user ? (
            <TouchableOpacity
              style={styles.ordersShortcut}
              onPress={() => router.push('/(marketplace)/orders')}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20 }}>📋</Text>
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
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search restaurants (e.g. Kalputra, Kullad), cuisines..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#94A3B8"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={{ fontSize: 14, color: '#94A3B8' }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Hero Promo Banner */}
          <View style={styles.promoBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoBadge}>RESTROZ FOOD MARKET</Text>
              <Text style={styles.promoTitle}>Discover Top Kitchens & Fast Delivery</Text>
              <Text style={styles.promoSub}>Direct restaurant ordering • Pure authentic taste</Text>
            </View>
            <Text style={{ fontSize: 44 }}>🍲</Text>
          </View>

          {/* Cuisine Filter Chips */}
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
              {selectedAddress ? 'Nearby Restaurants' : 'Available Restaurants'} ({filteredRestaurants.length})
            </Text>
            <Text style={styles.sectionSubtitle}>
              {selectedAddress
                ? `Sorted for delivery to ${selectedAddress.city}`
                : 'Clean, isolated kitchens serving your area'}
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
              <Text style={{ fontSize: 40 }}>🍽️</Text>
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
                    ]}
                    onPress={() => router.push(`/(marketplace)/restaurant/${r.id}` as any)}
                    activeOpacity={0.85}
                  >
                    {/* Image / Banner */}
                    <View style={[styles.cardCover, { height: numColumns === 1 ? 175 : 155 }]}>
                      <Image source={{ uri: bannerUrl }} style={styles.cardImage} />

                      {!isOpen && (
                        <View style={styles.closedOverlay}>
                          <Text style={styles.closedText}>CLOSED FOR DELIVERY</Text>
                        </View>
                      )}

                      {/* Delivery / Distance Badge */}
                      <View style={styles.badgeContainer}>
                        <View style={styles.deliveryTimeBadge}>
                          <Text style={styles.deliveryTimeText}>⏱️ {deliveryTime} MINS</Text>
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
                        <View style={{ flex: 1, marginRight: 6 }}>
                          <Text style={styles.cardName} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text style={styles.cardCuisines} numberOfLines={1}>
                            {cuisines}
                          </Text>
                        </View>

                        <View style={styles.ratingBadge}>
                          <Text style={styles.ratingText}>★ 4.6</Text>
                        </View>
                      </View>

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
                          <Text style={styles.minOrderText}>Min ₹{minOrder}</Text>
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
              <TouchableOpacity onPress={() => setAddressModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {savedAddresses.length === 0 ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
                    You have no saved addresses yet.
                  </Text>
                </View>
              ) : (
                savedAddresses.slice(0, 3).map((addr) => {
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
    backgroundColor: customerColors.background,
  },
  topHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    width: '100%',
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    maxWidth: 1440,
    width: '100%',
    alignSelf: 'center',
  },
  headerLogo: {
    width: 42,
    height: 42,
    marginRight: 10,
  },
  deliveringToLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: customerColors.primary,
    letterSpacing: 0.8,
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  locationCity: {
    fontSize: 14,
    fontWeight: '800',
    color: customerColors.text,
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
    fontSize: 13,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  mainContainer: {
    maxWidth: 1440,
    width: '100%',
    alignSelf: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: customerColors.text,
  },
  promoBanner: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  promoBadge: {
    color: customerColors.primaryLight,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  promoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  promoSub: {
    color: '#94A3B8',
    fontSize: 12,
  },
  cuisineRow: {
    marginBottom: 16,
  },
  cuisineRowContent: {
    gap: 8,
  },
  cuisineChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  cuisineChipActive: {
    backgroundColor: customerColors.primary,
    borderColor: customerColors.primary,
  },
  cuisineChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: customerColors.textSecondary,
  },
  cuisineChipTextActive: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: customerColors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: customerColors.textSecondary,
    marginTop: 2,
  },
  restaurantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'flex-start',
    width: '100%',
  },
  restaurantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  closedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.8,
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
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
    backgroundColor: customerColors.primaryDark,
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
    padding: 12,
  },
  cardMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '800',
    color: customerColors.text,
    marginBottom: 2,
  },
  cardCuisines: {
    fontSize: 12,
    color: customerColors.textSecondary,
  },
  ratingBadge: {
    backgroundColor: customerColors.success,
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
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8F9FA',
  },
  cardMetaText: {
    fontSize: 11,
    color: customerColors.textSecondary,
    flex: 1,
    marginRight: 6,
  },
  minOrderText: {
    fontSize: 11,
    color: customerColors.text,
    fontWeight: '600',
  },
  center: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: customerColors.textSecondary,
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: customerColors.text,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: customerColors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
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
    color: customerColors.text,
  },
  addrOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  addrOptionSelected: {
    borderColor: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
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
    color: customerColors.text,
  },
  defaultBadge: {
    backgroundColor: customerColors.primaryBg,
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
    color: customerColors.textSecondary,
    marginTop: 2,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
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
    color: customerColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
