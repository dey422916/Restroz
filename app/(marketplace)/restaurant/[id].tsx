import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { marketplaceService } from '../../../src/services/api/marketplaceService';
import { couponService } from '../../../src/services/api/couponService';
import { useCustomerCart } from '../../../src/context/CustomerCartContext';
import { Restaurant, RestaurantPublicProfile, Category, Product, Coupon } from '../../../src/types';
import { customerColors } from '../../../src/utils/colors';

import { RestaurantBannerCarousel } from '../../../src/components/marketplace/RestaurantBannerCarousel';

import { parseBannerUrls } from '../../../src/utils/mediaUtils';

const CATEGORY_ICONS: Record<string, string> = {
  all: '🍽️',
  snacks: '🥪',
  snack: '🥪',
  'main dishes': '🍲',
  'main course': '🍛',
  curry: '🍛',
  beverages: '☕',
  drinks: '🥤',
  chai: '🍵',
  desserts: '🍰',
  sweets: '🍨',
  breads: '🫓',
  biryani: '🍚',
  soups: '🥣',
  salads: '🥗',
  fastfood: '🍔',
};

const TAG_PALETTES = [
  { bg: '#EFF6FF', text: '#1D4ED8' }, // blue
  { bg: '#FDF2F8', text: '#BE185D' }, // pink
  { bg: '#FEF3C7', text: '#B45309' }, // amber
  { bg: '#F3E8FF', text: '#7E22CE' }, // purple
  { bg: '#ECFDF5', text: '#047857' }, // emerald
  { bg: '#FFF7ED', text: '#C2410C' }, // orange
];

export default function RestaurantMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Responsive columns: Desktop (>=1400px: 5, >=1050px: 4), Tablet (>=720px: 3), Mobile (<720px: 2)
  const numColumns = width >= 1400 ? 5 : width >= 1050 ? 4 : width >= 720 ? 3 : 2;

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<
    (Restaurant & { public_profile?: RestaurantPublicProfile }) | null
  >(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { cart, itemCount, addToCart, updateQuantity, applyCoupon, removeCoupon, conflictModal, resolveConflict } =
    useCustomerCart();

  useEffect(() => {
    if (!id) return;
    const loadMenu = async () => {
      try {
        const [rest, menu, cpnList] = await Promise.all([
          marketplaceService.getRestaurantPublicDetails(id),
          marketplaceService.getRestaurantMenu(id),
          couponService.getValidMarketplaceCoupons(id),
        ]);

        setRestaurant(rest);
        setCategories(menu.categories);
        setProducts(menu.products);
        setCoupons(cpnList);
      } catch (e) {
        console.warn('Error loading restaurant menu:', e);
      } finally {
        setLoading(false);
      }
    };

    loadMenu();
  }, [id]);

  const profile = restaurant?.public_profile;
  const isOpen = profile?.is_open !== false;
  const isCurrentRestCart = cart.restaurantId === restaurant?.id;

  const restaurantImages = useMemo(() => {
    if (!restaurant) return [];
    const list: string[] = [];
    const prof = restaurant.public_profile;

    // 1. Check public profile banner_url (parsed as JSON array or string)
    list.push(...parseBannerUrls(prof?.banner_url));

    // 2. Check restaurant banner_url
    list.push(...parseBannerUrls(restaurant.banner_url));

    // 3. Check explicit arrays if available
    list.push(...parseBannerUrls(prof?.banner_urls));
    list.push(...parseBannerUrls(prof?.gallery_urls));
    list.push(...parseBannerUrls(restaurant.banner_urls));
    list.push(...parseBannerUrls(restaurant.gallery_urls));

    const unique = Array.from(new Set(list.filter((u) => typeof u === 'string' && u.trim().length > 0)));

    if (unique.length === 0) {
      if (restaurant.logo_url) unique.push(restaurant.logo_url);
      else unique.push('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80');
    }

    return unique;
  }, [restaurant]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.category_id !== selectedCategory) return false;
      if (vegOnly && p.food_type !== 'veg') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [products, selectedCategory, vegOnly, searchQuery]);

  const getItemCartQty = (productId: string) => {
    if (!isCurrentRestCart) return 0;
    const item = cart.items.find((i) => i.product_id === productId);
    return item ? item.quantity : 0;
  };

  const getCategoryName = (catId?: string) => {
    if (!catId) return '';
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : '';
  };

  const getCategoryIcon = (name: string) => {
    const key = name.toLowerCase().trim();
    for (const [k, icon] of Object.entries(CATEGORY_ICONS)) {
      if (key.includes(k)) return icon;
    }
    return '🍽️';
  };

  const getTagColor = (text: string) => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_PALETTES[Math.abs(hash) % TAG_PALETTES.length];
  };

  const getCardWidthStyle = () => {
    if (numColumns === 5) return { width: '18.8%' as const };
    if (numColumns === 4) return { width: '23.8%' as const };
    if (numColumns === 3) return { width: '31.8%' as const };
    return { width: '48.2%' as const }; // 2 cards per row on mobile
  };

  if (loading || !restaurant) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={customerColors.primary} />
        <Text style={styles.loadingText}>Loading menu & specials...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(marketplace)')}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: customerColors.primary }}>
            ← Restaurants
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <TouchableOpacity
          style={styles.cartIconBtn}
          onPress={() => router.push('/(marketplace)/cart')}
        >
          <Text style={{ fontSize: 18 }}>🛍️</Text>
          {itemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Restaurant Hero Banner with Image Carousel and Floating Overlay Info */}
        <RestaurantBannerCarousel
          images={restaurantImages}
          restaurantName={restaurant.name}
          logoUrl={restaurant.logo_url}
          cuisines={profile?.cuisine_tags}
          address={restaurant.address || restaurant.city}
          rating="4.6"
          ratingCount="50+ reviews"
          estimatedTime={profile?.estimated_delivery_minutes || 35}
          minOrder={profile?.minimum_order_value || 0}
          deliveryFee="₹15"
          isOpen={isOpen}
        />

        {/* Restaurant Active Coupons Carousel */}
        {coupons.length > 0 && (
          <View style={styles.couponCarouselSection}>
            <View style={styles.couponSectionHeader}>
              <Text style={styles.couponSectionTitle}>🏷️ Exclusive Offers & Deals</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.couponCarouselContent}
            >
              {coupons.map((cpn, idx) => {
                const discountTag =
                  cpn.discount_type === 'percentage'
                    ? `${cpn.discount_value}% OFF`
                    : `₹${cpn.discount_value} OFF`;

                const badgePalettes = [
                  { bg: '#ECFDF5', text: '#059669' }, // mint green
                  { bg: '#F3E8FF', text: '#7E22CE' }, // purple
                  { bg: '#EFF6FF', text: '#2563EB' }, // blue
                  { bg: '#FFF7ED', text: '#EA580C' }, // orange
                ];
                const badgeStyle = badgePalettes[idx % badgePalettes.length];

                return (
                  <View key={cpn.id} style={styles.couponCard}>
                    <View style={[styles.couponDiscountBadge, { backgroundColor: badgeStyle.bg }]}>
                      <Text style={[styles.couponDiscountText, { color: badgeStyle.text }]}>
                        {discountTag}
                      </Text>
                    </View>

                    <Text style={styles.couponCodeHeading}>{cpn.code}</Text>

                    <Text style={styles.couponMinOrderText}>
                      {cpn.min_order_value > 0 ? `Min order ₹${cpn.min_order_value}` : 'No min order required'}
                    </Text>

                    <View style={styles.couponCardFooter}>
                      <Text style={[styles.viewOfferText, { color: badgeStyle.text }]}>View Offer</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Category Filter & Search Section */}
        <View style={styles.filterSection}>
          <View style={styles.categoryFilterRow}>
            {/* Horizontal Category Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  selectedCategory === 'all' && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory('all')}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === 'all' && styles.categoryChipTextActive,
                  ]}
                >
                  All Items
                </Text>
              </TouchableOpacity>

              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat.id && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat.id && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* Pure Veg Pill Toggle */}
              <TouchableOpacity
                style={[styles.vegTogglePill, vegOnly && styles.vegTogglePillActive]}
                onPress={() => setVegOnly(!vegOnly)}
              >
                <Text style={{ fontSize: 11 }}>🟢</Text>
                <Text style={[styles.vegTogglePillText, vegOnly && styles.vegTogglePillTextActive]}>
                  Pure Veg
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* In-Line Search Input */}
            <View style={styles.searchInlineBox}>
              <Text style={{ fontSize: 13, marginRight: 6 }}>🔍</Text>
              <TextInput
                style={styles.searchInlineInput}
                placeholder="Search items..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* Responsive Image-First Product Grid */}
        <View style={styles.menuGridContainer}>
          {filteredProducts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 36 }}>🍽️</Text>
              <Text style={styles.emptyTitle}>No Dishes Found</Text>
              <Text style={styles.emptySub}>
                {searchQuery
                  ? `No items match "${searchQuery}". Try a different search term.`
                  : 'No items available in this category.'}
              </Text>
            </View>
          ) : (
            <View style={styles.gridRow}>
              {filteredProducts.map((p) => {
                const qty = getItemCartQty(p.id);
                const catName = getCategoryName(p.category_id);
                const tagStyle = getTagColor(catName || p.name);
                const isVeg = p.food_type === 'veg';
                const isAvailable = p.is_available && (p.stock_quantity === null || p.stock_quantity > 0);

                return (
                  <View key={p.id} style={[styles.imageCard, getCardWidthStyle()]}>
                    {/* Top Image Container */}
                    <View style={styles.cardImageWrap}>
                      {p.image_url ? (
                        <Image
                          source={{ uri: p.image_url }}
                          style={styles.cardImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.cardPlaceholderWrap}>
                          <Text style={{ fontSize: 32 }}>🍲</Text>
                        </View>
                      )}

                      {/* Floating Veg / Non-Veg Indicator Badge on Top Left */}
                      <View style={styles.cardVegBadge}>
                        <View style={[styles.vegSymbolBox, isVeg ? styles.vegBorder : styles.nonVegBorder]}>
                          <View style={[styles.vegSymbolDot, isVeg ? styles.vegDot : styles.nonVegDot]} />
                        </View>
                      </View>

                      {/* Unavailable / Sold Out Banner */}
                      {!isAvailable && (
                        <View style={styles.cardSoldOutBadge}>
                          <Text style={styles.cardSoldOutText}>Sold Out</Text>
                        </View>
                      )}
                    </View>

                    {/* Card Body Info */}
                    <View style={styles.cardBody}>
                      {/* Item Name */}
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {p.name}
                      </Text>

                      {/* Category & Type Tags */}
                      <View style={styles.tagsContainer}>
                        {catName ? (
                          <View style={[styles.pastelTag, { backgroundColor: tagStyle.bg }]}>
                            <Text style={[styles.pastelTagText, { color: tagStyle.text }]}>
                              {catName.toLowerCase()}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.pastelTag,
                            { backgroundColor: isVeg ? '#F0FDF4' : '#FFF1F2' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pastelTagText,
                              { color: isVeg ? '#166534' : '#9F1239' },
                            ]}
                          >
                            {isVeg ? 'veg' : 'non-veg'}
                          </Text>
                        </View>
                      </View>

                      {/* Star Ratings Row */}
                      <View style={styles.ratingRow}>
                        <Text style={styles.ratingStars}>★★★★☆</Text>
                        <Text style={styles.ratingScore}>4.5</Text>
                      </View>

                      {/* Short Description */}
                      {p.description ? (
                        <Text style={styles.cardDesc} numberOfLines={2}>
                          {p.description}
                        </Text>
                      ) : null}

                      {/* Price & Action Row */}
                      <View style={styles.cardFooter}>
                        <View style={styles.priceWrap}>
                          <Text style={styles.cardPrice}>
                            ₹{p.discounted_price || p.price}
                          </Text>
                          {p.discounted_price && p.discounted_price < p.price ? (
                            <Text style={styles.cardOriginalPrice}>₹{p.price}</Text>
                          ) : null}
                        </View>

                        {/* Action Stepper or ADD Button */}
                        {isOpen && isAvailable ? (
                          <View style={styles.actionWrap}>
                            {qty > 0 ? (
                              <View style={styles.gridStepper}>
                                <TouchableOpacity
                                  style={styles.gridStepperBtn}
                                  onPress={() => updateQuantity(p.id, qty - 1)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.gridStepperBtnText}>−</Text>
                                </TouchableOpacity>
                                <Text style={styles.gridStepperQty}>{qty}</Text>
                                <TouchableOpacity
                                  style={styles.gridStepperBtn}
                                  onPress={() => updateQuantity(p.id, qty + 1)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.gridStepperBtnText}>+</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.gridAddBtn}
                                onPress={() =>
                                  addToCart(
                                    {
                                      id: restaurant.id,
                                      name: restaurant.name,
                                      logo_url: restaurant.logo_url,
                                    },
                                    p,
                                    1
                                  )
                                }
                                activeOpacity={0.8}
                              >
                                <Text style={styles.gridAddBtnText}>ADD +</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Bottom Cart Bar */}
      {isCurrentRestCart && itemCount > 0 && (
        <View style={styles.floatingCartBar}>
          <View>
            <Text style={styles.cartBarItems}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'} in cart
            </Text>
            <Text style={styles.cartBarTotal}>₹{cart.payableAmount}</Text>
          </View>
          <TouchableOpacity
            style={styles.viewCartBtn}
            onPress={() => router.push('/(marketplace)/cart')}
          >
            <Text style={styles.viewCartBtnText}>View Cart →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cross-Restaurant Conflict Modal */}
      <Modal visible={conflictModal.isOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Text style={{ fontSize: 32 }}>🛍️</Text>
            </View>
            <Text style={styles.modalTitle}>Replace cart items?</Text>
            <Text style={styles.modalBody}>
              Your cart currently contains items from{' '}
              <Text style={{ fontWeight: '700', color: customerColors.primary }}>
                {conflictModal.currentRestName}
              </Text>
              .{'\n\n'}
              Would you like to clear your current cart and start a new order with{' '}
              <Text style={{ fontWeight: '700', color: customerColors.primary }}>
                {conflictModal.newRestName}
              </Text>
              ?
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => resolveConflict('cancel')}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => resolveConflict('clear_and_continue')}
              >
                <Text style={styles.modalConfirmText}>Clear Cart & Continue</Text>
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
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  cartIconBtn: {
    padding: 6,
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: customerColors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  scrollArea: {
    flex: 1,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  cuisines: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  address: {
    fontSize: 12,
    color: customerColors.textSecondary,
  },
  ratingBox: {
    backgroundColor: customerColors.success,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    minWidth: 46,
  },
  ratingNumber: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  ratingCount: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F8F9FA',
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: customerColors.textSecondary,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.text,
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  closedBannerText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  categoryFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  categoryChipActive: {
    backgroundColor: '#EA580C', // Solid orange as in reference
  },
  categoryChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  vegTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  vegTogglePillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  vegTogglePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  vegTogglePillTextActive: {
    color: '#15803D',
  },
  searchInlineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 180,
  },
  searchInlineInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },
  itemsCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  menuGridContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 4,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 16 / 11,
    backgroundColor: '#F1F5F9',
    position: 'relative',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardPlaceholderWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  cardVegBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  vegSymbolBox: {
    width: 13,
    height: 13,
    borderWidth: 1.5,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vegBorder: {
    borderColor: '#16A34A',
  },
  nonVegBorder: {
    borderColor: '#DC2626',
  },
  vegSymbolDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  vegDot: {
    backgroundColor: '#16A34A',
  },
  nonVegDot: {
    backgroundColor: '#DC2626',
  },
  cardSoldOutBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardSoldOutText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  cardBody: {
    padding: 10,
    flex: 1,
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 6,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  pastelTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pastelTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  ratingStars: {
    color: '#F59E0B',
    fontSize: 11,
    letterSpacing: 1,
  },
  ratingScore: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  cardDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 14,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  priceWrap: {
    flexDirection: 'column',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  cardOriginalPrice: {
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  actionWrap: {
    alignItems: 'flex-end',
  },
  gridAddBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  gridAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  gridStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: customerColors.primary,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridStepperBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  gridStepperBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  gridStepperQty: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 3,
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: customerColors.text,
  },
  emptySub: {
    fontSize: 12,
    color: customerColors.textSecondary,
    textAlign: 'center',
  },
  floatingCartBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  cartBarItems: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  cartBarTotal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  viewCartBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewCartBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: customerColors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: customerColors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  couponCarouselSection: {
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 16,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  couponSectionHeader: {
    marginBottom: 10,
  },
  couponSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  couponCarouselContent: {
    gap: 12,
    paddingRight: 16,
  },
  couponCard: {
    width: 190,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  couponDiscountBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  couponDiscountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  couponCodeHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  couponMinOrderText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 10,
  },
  couponCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    paddingTop: 6,
  },
  viewOfferText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
