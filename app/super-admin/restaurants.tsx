import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Image,
  Platform,
  Linking,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { superAdminService } from '../../src/services/api/superAdminService';
import { storageService } from '../../src/services/api/storageService';
import { locationSearchService, PlaceSuggestion } from '../../src/services/api/locationSearchService';
import { Restaurant, RestaurantSubscription } from '../../src/types';
import { colors } from '../../src/utils/colors';

export default function SuperAdminRestaurantsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { setActiveRestaurantId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, RestaurantSubscription>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [selectedPlaceInfo, setSelectedPlaceInfo] = useState<string | null>(null);
  const searchTimeoutRef = React.useRef<any>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formLegalName, setFormLegalName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formPostalCode, setFormPostalCode] = useState('');
  const [formBannerUrl, setFormBannerUrl] = useState('');
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');

  const loadData = async () => {
    try {
      const [rests, subs] = await Promise.all([
        superAdminService.getAllRestaurants(),
        superAdminService.getRestaurantSubscriptions(),
      ]);

      setRestaurants(rests);
      const subMap: Record<string, RestaurantSubscription> = {};
      subs.forEach((s) => {
        if (s.status === 'active' || !subMap[s.restaurant_id]) {
          subMap[s.restaurant_id] = s;
        }
      });
      setSubscriptions(subMap);
    } catch (e) {
      console.warn('Error loading restaurants:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!slugManuallyEdited) {
      setFormSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+/, '')
      );
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugManuallyEdited(true);
    setFormSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const handleCreateRestaurant = async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Restaurant Name is required.');
      return;
    }

    let trimmedSlug = (formSlug.trim() || generateSlug(trimmedName))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!trimmedSlug) {
      trimmedSlug = 'rest-' + Math.random().toString(36).substring(2, 7);
    }

    if (!formAddress.trim()) {
      Alert.alert('Validation Error', 'Street Address is required for marketplace discovery.');
      return;
    }
    if (!formCity.trim()) {
      Alert.alert('Validation Error', 'City is required for marketplace discovery.');
      return;
    }
    if (!formState.trim()) {
      Alert.alert('Validation Error', 'State is required for marketplace discovery.');
      return;
    }
    if (!formPostalCode.trim()) {
      Alert.alert('Validation Error', 'Postal Code / PIN is required for marketplace discovery.');
      return;
    }

    setSaving(true);
    try {
      const newRest = await superAdminService.createRestaurant({
        name: trimmedName,
        slug: trimmedSlug,
        legal_name: formLegalName.trim() || trimmedName,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        address: formAddress.trim(),
        city: formCity.trim(),
        state: formState.trim(),
        postal_code: formPostalCode.trim(),
        banner_url: formBannerUrl.trim() || undefined,
        logo_url: formLogoUrl.trim() || undefined,
        latitude: formLat.trim() ? parseFloat(formLat.trim()) : undefined,
        longitude: formLng.trim() ? parseFloat(formLng.trim()) : undefined,
        status: 'ACTIVE',
      });

      Alert.alert('Success', `Restaurant "${newRest.name}" onboarded successfully with isolated settings and menu items!`);
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create restaurant.');
    } finally {
      setSaving(false);
    }
  };

  const handleMapSearchChange = (query: string) => {
    setMapSearchQuery(query);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (!query || query.trim().length < 2) {
      setPlaceSuggestions([]);
      setSearchingPlaces(false);
      return;
    }

    // Direct synchronous extraction if user pasted a Google Maps <iframe> embed code or Maps link
    const parsed = locationSearchService.parseGoogleMapsLocation(query);
    if (parsed) {
      setFormLat(parsed.latitude.toFixed(6));
      setFormLng(parsed.longitude.toFixed(6));
      if (!formName.trim() && parsed.name) {
        handleNameChange(parsed.name);
      }
      setSelectedPlaceInfo(`Extracted from ${parsed.source}: ${parsed.name || 'Location Pin'} (${parsed.latitude.toFixed(6)}, ${parsed.longitude.toFixed(6)})`);
      setSearchingPlaces(false);
      setPlaceSuggestions([]);

      // Auto reverse-geocode to populate address, city, state, postalCode
      locationSearchService.reverseGeocode(parsed.latitude, parsed.longitude).then((rev) => {
        if (rev) {
          if (!formAddress.trim() && rev.street) setFormAddress(rev.street);
          if (!formCity.trim() && rev.city) setFormCity(rev.city);
          if (!formState.trim() && rev.state) setFormState(rev.state);
          if (!formPostalCode.trim() && rev.postalCode) setFormPostalCode(rev.postalCode);
        }
      });
      return;
    }

    setSearchingPlaces(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await locationSearchService.searchPlaces(query);
        setPlaceSuggestions(results);
      } catch (err) {
        console.warn('Place search error:', err);
      } finally {
        setSearchingPlaces(false);
      }
    }, 350);
  };

  const handleSelectPlace = (place: PlaceSuggestion) => {
    if (place.street) setFormAddress(place.street);
    if (place.city) setFormCity(place.city);
    if (place.state) setFormState(place.state);
    if (place.postalCode) setFormPostalCode(place.postalCode);
    if (place.latitude) setFormLat(place.latitude.toFixed(6));
    if (place.longitude) setFormLng(place.longitude.toFixed(6));

    if (!formName.trim() && place.name) {
      handleNameChange(place.name);
    }

    setSelectedPlaceInfo(`${place.name} (${place.city ? place.city + ', ' : ''}${place.state})`);
    setPlaceSuggestions([]);
    setMapSearchQuery(place.name);
  };

  const resetForm = () => {
    setFormName('');
    setFormSlug('');
    setSlugManuallyEdited(false);
    setFormLegalName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormCity('');
    setFormState('');
    setFormPostalCode('');
    setFormBannerUrl('');
    setFormLogoUrl('');
    setFormLat('');
    setFormLng('');
    setMapSearchQuery('');
    setPlaceSuggestions([]);
    setSelectedPlaceInfo(null);
  };

  const handlePickBanner = async () => {
    setUploadingBanner(true);
    try {
      const res = await storageService.pickAndUploadBanner();
      if (res?.url) {
        setFormBannerUrl(res.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload banner image.');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handlePickLogo = async () => {
    setUploadingLogo(true);
    try {
      const res = await storageService.pickAndUploadLogo();
      if (res?.url) {
        setFormLogoUrl(res.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload logo image.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleFetchCurrentLocation = async () => {
    try {
      setFetchingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Please allow location access to automatically fetch device GPS coordinates for this restaurant.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (location?.coords) {
        const lat = location.coords.latitude;
        const lng = location.coords.longitude;
        setFormLat(lat.toFixed(6));
        setFormLng(lng.toFixed(6));

        // Auto reverse-geocode to populate address/city/state/pin if empty
        try {
          const rev = await locationSearchService.reverseGeocode(lat, lng);
          if (rev) {
            if (!formAddress.trim() && rev.street) setFormAddress(rev.street);
            if (!formCity.trim() && rev.city) setFormCity(rev.city);
            if (!formState.trim() && rev.state) setFormState(rev.state);
            if (!formPostalCode.trim() && rev.postalCode) setFormPostalCode(rev.postalCode);
            setSelectedPlaceInfo(`Device GPS Location (${rev.city || 'Coordinates captured'})`);
          }
        } catch (revErr) {
          console.warn('Reverse geocode warning:', revErr);
        }

        Alert.alert(
          'Location Detected',
          `GPS Coordinates captured:\nLatitude: ${lat.toFixed(6)}\nLongitude: ${lng.toFixed(6)}`
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Location Error',
        err?.message || 'Unable to fetch current device location. Please make sure location services / GPS is turned on.'
      );
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleToggleStatus = async (restaurant: Restaurant) => {
    const newStatus = restaurant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await superAdminService.updateRestaurantStatus(restaurant.id, newStatus);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update status.');
    }
  };

  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.email && r.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.phone && r.phone.includes(searchQuery));

    if (!matchesSearch) return false;

    const sub = subscriptions[r.id];
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return r.status === 'ACTIVE';
    if (statusFilter === 'SUSPENDED') return r.status === 'SUSPENDED';
    if (statusFilter === 'ACTIVE_SUB') return sub?.status === 'active';
    if (statusFilter === 'EXPIRED_SUB') return sub?.status === 'expired';
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Restaurant Directory</Text>
          <Text style={styles.subtitle}>
            Onboard new tenants, manage lifecycle status, and oversee subscription plans
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isMobile && { width: '100%', justifyContent: 'center' }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>➕ Onboard New Restaurant</Text>
        </TouchableOpacity>
      </View>

      {/* Filter and Search Bar */}
      <View style={[styles.searchBar, isMobile && styles.searchBarMobile]}>
        <View style={styles.searchInputWrap}>
          <Text style={{ fontSize: 14 }}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, slug, email..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#94A3B8"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsScroll}
        >
          {['ALL', 'ACTIVE', 'SUSPENDED', 'ACTIVE_SUB', 'EXPIRED_SUB'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, statusFilter === f && styles.filterPillActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text
                style={[styles.filterPillText, statusFilter === f && styles.filterPillTextActive]}
              >
                {f.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content Rendering */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.tableScroll} contentContainerStyle={{ paddingBottom: isMobile ? 100 : 40 }}>
          {filteredRestaurants.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No restaurants found matching your criteria.</Text>
            </View>
          ) : isMobile ? (
            /* Mobile Cards Layout */
            <View style={styles.mobileCardList}>
              {filteredRestaurants.map((r) => {
                const sub = subscriptions[r.id];
                const planName =
                  sub?.plan?.name ||
                  (r.id === 'a0000000-0000-0000-0000-000000000001'
                    ? 'Enterprise Plan'
                    : 'No Active Plan');

                return (
                  <View key={r.id} style={styles.mobileCard}>
                    {/* Top Row: Avatar, Name & Status Badge */}
                    <View style={styles.mobileCardTop}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{r.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <Text style={styles.restName} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={styles.restContact} numberOfLines={1}>
                          {r.slug}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          r.status === 'ACTIVE' ? styles.badgeActive : styles.badgeSuspended,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            r.status === 'ACTIVE'
                              ? styles.badgeTextActive
                              : styles.badgeTextSuspended,
                          ]}
                        >
                          {r.status}
                        </Text>
                      </View>
                    </View>

                    {/* Metadata Grid */}
                    <View style={styles.mobileMetaGrid}>
                      <View style={styles.mobileMetaItem}>
                        <Text style={styles.mobileMetaLabel}>SUBSCRIPTION PLAN</Text>
                        <Text style={styles.mobileMetaValue}>{planName}</Text>
                      </View>
                      <View style={styles.mobileMetaItem}>
                        <Text style={styles.mobileMetaLabel}>EXPIRY DATE</Text>
                        <Text style={styles.mobileMetaValue}>
                          {sub?.end_date ? new Date(sub.end_date).toLocaleDateString() : 'Active/N/A'}
                        </Text>
                      </View>
                    </View>

                    {/* Incomplete Address Warning */}
                    {(!r.address || !r.city || !r.postal_code) && (
                      <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
                        <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '700' }}>
                          ⚠️ Complete restaurant address required for marketplace discovery.
                        </Text>
                      </View>
                    )}

                    {/* Contact Info */}
                    {(r.email || r.phone || r.city) && (
                      <View style={styles.mobileContactRow}>
                        <Text style={styles.mobileContactText}>
                          📍 {r.city || 'No city'} • 📞 {r.phone || 'No phone'} • ✉️ {r.email || 'No email'}
                        </Text>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.mobileActionRow}>
                      <TouchableOpacity
                        style={[styles.mobileViewBtn, { backgroundColor: '#0284C7' }]}
                        onPress={() => {
                          setActiveRestaurantId(r.id);
                          router.push('/(admin)/pos' as any);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.mobileViewBtnText, { color: '#FFFFFF' }]}>🖥️ Manage POS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.mobileViewBtn}
                        onPress={() => router.push(`/super-admin/restaurant/${r.id}` as any)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.mobileViewBtnText}>👁️ Details</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.mobileToggleBtn,
                          r.status === 'ACTIVE'
                            ? styles.mobileToggleBtnWarn
                            : styles.mobileToggleBtnSuccess,
                        ]}
                        onPress={() => handleToggleStatus(r)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.mobileToggleBtnText,
                            r.status === 'ACTIVE'
                              ? styles.mobileToggleBtnTextWarn
                              : styles.mobileToggleBtnTextSuccess,
                          ]}
                        >
                          {r.status === 'ACTIVE' ? '🚫 Suspend' : '✅ Activate'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* Desktop Table Layout */
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>RESTAURANT</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>SLUG</Text>
                <Text style={[styles.th, { flex: 1 }]}>STATUS</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>CURRENT PLAN</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>EXPIRY</Text>
                <Text style={[styles.th, { flex: 2, textAlign: 'right' }]}>ACTIONS</Text>
              </View>

              {filteredRestaurants.map((r) => {
                const sub = subscriptions[r.id];
                const isIncomplete = !r.address || !r.city || !r.postal_code;
                return (
                  <View key={r.id} style={styles.tableRow}>
                    <TouchableOpacity
                      style={[styles.tdWrap, { flex: 2 }]}
                      onPress={() => router.push(`/super-admin/restaurant/${r.id}` as any)}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{r.name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.restName} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={styles.restContact} numberOfLines={1}>
                          {r.city ? `📍 ${r.city} • ` : ''}{r.email || r.phone || 'No contact'}
                        </Text>
                        {isIncomplete && (
                          <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '700', marginTop: 2 }}>
                            ⚠️ Address Incomplete
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    <Text style={[styles.tdText, { flex: 1.2, fontWeight: '600' }]}>{r.slug}</Text>

                    <View style={{ flex: 1 }}>
                      <View
                        style={[
                          styles.statusBadge,
                          r.status === 'ACTIVE' ? styles.badgeActive : styles.badgeSuspended,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            r.status === 'ACTIVE'
                              ? styles.badgeTextActive
                              : styles.badgeTextSuspended,
                          ]}
                        >
                          {r.status}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.planName}>
                        {sub?.plan?.name ||
                          (r.id === 'a0000000-0000-0000-0000-000000000001'
                            ? 'Enterprise Plan'
                            : 'No Plan')}
                      </Text>
                      <Text style={styles.subStatus}>
                        {sub ? `Status: ${sub.status}` : 'Pending assignment'}
                      </Text>
                    </View>

                    <Text style={[styles.tdText, { flex: 1.2, fontSize: 13 }]}>
                      {sub?.end_date ? new Date(sub.end_date).toLocaleDateString() : 'N/A'}
                    </Text>

                    <View style={[styles.actionRow, { flex: 2, justifyContent: 'flex-end', gap: 6 }]}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD', paddingHorizontal: 10, width: 'auto' }]}
                        onPress={() => {
                          setActiveRestaurantId(r.id);
                          router.push('/(admin)/pos' as any);
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369A1' }}>🖥️ POS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => router.push(`/super-admin/restaurant/${r.id}` as any)}
                      >
                        <Text style={{ fontSize: 14 }}>👁️</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          r.status === 'ACTIVE' ? styles.actionBtnWarn : styles.actionBtnSuccess,
                        ]}
                        onPress={() => handleToggleStatus(r)}
                      >
                        <Text style={{ fontSize: 14 }}>{r.status === 'ACTIVE' ? '🚫' : '✅'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Onboard Restaurant Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { height: isMobile ? '94%' : '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle}>Onboard New Restaurant Tenant</Text>
                <Text style={styles.modalSubtitle}>Fill in restaurant details, address & GPS location</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={{ fontSize: 22, color: '#64748B', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.label}>Restaurant Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Royal Spice Kitchen"
                value={formName}
                onChangeText={handleNameChange}
                autoFocus={true}
              />

              <Text style={styles.label}>Subdomain Slug *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. royal-spice (auto-generated from name)"
                value={formSlug}
                onChangeText={handleSlugChange}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Legal Business Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Royal Spice Hospitality Pvt Ltd"
                value={formLegalName}
                onChangeText={setFormLegalName}
              />

              <View style={[styles.formRow, isMobile && { flexDirection: 'column' }]}>
                <View style={[{ flex: 1 }, !isMobile && { marginRight: 8 }]}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+91 9876543210"
                    value={formPhone}
                    onChangeText={setFormPhone}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={[{ flex: 1 }, !isMobile && { marginLeft: 8 }]}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="admin@royalspice.com"
                    value={formEmail}
                    onChangeText={setFormEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Google Map & Places Search Section */}
              <View style={styles.mapSearchContainer}>
                <View style={styles.mapSearchHeader}>
                  <Text style={styles.mapSearchTitle}>🗺️ Google Map Search / Paste &lt;iframe&gt;</Text>
                  <Text style={styles.mapSearchSubtitle}>
                    Search any Indian place, or paste Google Maps &lt;iframe&gt; embed code / share link to auto-detect coordinates
                  </Text>
                </View>

                <View style={styles.mapSearchInputRow}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>🔍</Text>
                  <TextInput
                    style={styles.mapSearchInput}
                    placeholder="Search place, or paste Google Maps <iframe> / link..."
                    value={mapSearchQuery}
                    onChangeText={handleMapSearchChange}
                    placeholderTextColor="#94A3B8"
                  />
                  {searchingPlaces && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
                  {mapSearchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setMapSearchQuery('');
                        setPlaceSuggestions([]);
                      }}
                      style={{ padding: 4, marginLeft: 4 }}
                    >
                      <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Suggestions Dropdown */}
                {placeSuggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    <Text style={styles.suggestionsHeader}>Select Listed Location:</Text>
                    <ScrollView
                      style={styles.suggestionsList}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                    >
                      {placeSuggestions.map((item) => (
                        <TouchableOpacity
                          key={item.placeId}
                          style={styles.suggestionItem}
                          onPress={() => handleSelectPlace(item)}
                          activeOpacity={0.7}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <Text style={{ fontSize: 16, marginRight: 8, marginTop: 2 }}>📍</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.suggestionName} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text style={styles.suggestionAddress} numberOfLines={2}>
                                {item.displayName}
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                {item.city ? (
                                  <View style={styles.suggestionTag}>
                                    <Text style={styles.suggestionTagText}>🏙️ {item.city}</Text>
                                  </View>
                                ) : null}
                                {item.postalCode ? (
                                  <View style={styles.suggestionTag}>
                                    <Text style={styles.suggestionTagText}>📮 PIN: {item.postalCode}</Text>
                                  </View>
                                ) : null}
                                <View style={[styles.suggestionTag, { backgroundColor: '#EFF6FF' }]}>
                                  <Text style={[styles.suggestionTagText, { color: '#1D4ED8' }]}>
                                    🌐 {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {selectedPlaceInfo ? (
                  <View style={styles.selectedPlaceBadge}>
                    <Text style={styles.selectedPlaceText}>
                      ✓ Linked to Map: <Text style={{ fontWeight: '800' }}>{selectedPlaceInfo}</Text>
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.label}>Street Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Shop 12, Main Market, GT Road"
                value={formAddress}
                onChangeText={setFormAddress}
              />

              <View style={[styles.formRow, isMobile && { flexDirection: 'column' }]}>
                <View style={[{ flex: 1 }, !isMobile && { marginRight: 6 }]}>
                  <Text style={styles.label}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Burdwan"
                    value={formCity}
                    onChangeText={setFormCity}
                  />
                </View>
                <View style={[{ flex: 1 }, !isMobile && { marginHorizontal: 6 }]}>
                  <Text style={styles.label}>State *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. West Bengal"
                    value={formState}
                    onChangeText={setFormState}
                  />
                </View>
                <View style={[{ flex: 1 }, !isMobile && { marginLeft: 6 }]}>
                  <Text style={styles.label}>Postal Code / PIN *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 713101"
                    value={formPostalCode}
                    onChangeText={setFormPostalCode}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* Restaurant Banner / Cover Upload */}
              <Text style={styles.label}>Restaurant Cover / Banner Image</Text>
              <View style={{ marginBottom: 12 }}>
                {formBannerUrl.trim() ? (
                  <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', marginBottom: 8 }}>
                    <Image source={{ uri: formBannerUrl }} style={{ width: '100%', height: 120, resizeMode: 'cover' }} />
                    <View style={{ padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                      <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700' }}>✓ Banner Ready</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={handlePickBanner} disabled={uploadingBanner}>
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                            {uploadingBanner ? 'Uploading...' : '🔄 Change Banner'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFormBannerUrl('')}>
                          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>✕ Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#94A3B8',
                      borderRadius: 8,
                      padding: 16,
                      alignItems: 'center',
                      backgroundColor: '#F8FAFC',
                      marginBottom: 8,
                    }}
                    onPress={handlePickBanner}
                    disabled={uploadingBanner}
                  >
                    {uploadingBanner ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Text style={{ fontSize: 24, marginBottom: 4 }}>🖼️</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                          Upload Restaurant Banner (JPG, PNG, WEBP)
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          Max 5MB • 16:9 widescreen recommended
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Restaurant Logo Upload */}
              <Text style={styles.label}>Restaurant Logo</Text>
              <View style={{ marginBottom: 12 }}>
                {formLogoUrl.trim() ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <Image source={{ uri: formLogoUrl }} style={{ width: 44, height: 44, borderRadius: 8, resizeMode: 'cover' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700' }}>✓ Logo Ready</Text>
                    </View>
                    <TouchableOpacity onPress={handlePickLogo} disabled={uploadingLogo}>
                      <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                        {uploadingLogo ? 'Uploading...' : '🔄 Change'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setFormLogoUrl('')}>
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>✕ Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#94A3B8',
                      borderRadius: 8,
                      padding: 12,
                      alignItems: 'center',
                      backgroundColor: '#F8FAFC',
                    }}
                    onPress={handlePickLogo}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                        📷 Upload Logo (Square JPG, PNG, WEBP)
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Geolocation Section */}
              <View style={styles.geoContainer}>
                <View style={styles.geoHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.geoTitle}>📍 Restaurant GPS Location</Text>
                    <Text style={styles.geoSubtitle}>
                      Used for customer distance calculation & local marketplace discovery
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.fetchLocBtn, fetchingLocation && styles.fetchLocBtnDisabled]}
                    onPress={handleFetchCurrentLocation}
                    disabled={fetchingLocation}
                    activeOpacity={0.8}
                  >
                    {fetchingLocation ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, marginRight: 4 }}>📡</Text>
                        <Text style={styles.fetchLocBtnText}>Auto-Fetch GPS</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {formLat && formLng ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <View style={styles.geoActiveTag}>
                      <Text style={styles.geoActiveTagText}>
                        ✓ Coordinates: {formLat}, {formLng}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                      onPress={() => {
                        const url = `https://www.google.com/maps/search/?api=1&query=${formLat},${formLng}`;
                        Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open Google Maps.'));
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369A1' }}>🗺️ View on Google Maps</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={[styles.formRow, isMobile && { flexDirection: 'column' }]}>
                  <View style={[{ flex: 1 }, !isMobile && { marginRight: 6 }]}>
                    <Text style={styles.label}>Latitude (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 23.232400"
                      value={formLat}
                      onChangeText={setFormLat}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[{ flex: 1 }, !isMobile && { marginLeft: 6 }]}>
                    <Text style={styles.label}>Longitude (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 87.861500"
                      value={formLng}
                      onChangeText={setFormLng}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelBtn, isMobile && { flex: 1 }]}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, isMobile && { flex: 2 }]}
                onPress={handleCreateRestaurant}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Create Restaurant</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    flexWrap: 'wrap',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  searchBarMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  // Mobile Card List Styles
  mobileCardList: {
    gap: 12,
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mobileMetaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 12,
  },
  mobileMetaItem: {
    flex: 1,
  },
  mobileMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  mobileMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileContactRow: {
    marginBottom: 12,
  },
  mobileContactText: {
    fontSize: 12,
    color: '#64748B',
  },
  mobileActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mobileViewBtn: {
    flex: 1,
    backgroundColor: '#EEF2F6',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  mobileViewBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  mobileToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  mobileToggleBtnWarn: {
    backgroundColor: '#FEE2E2',
  },
  mobileToggleBtnSuccess: {
    backgroundColor: '#DCFCE7',
  },
  mobileToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  mobileToggleBtnTextWarn: {
    color: '#DC2626',
  },
  mobileToggleBtnTextSuccess: {
    color: '#16A34A',
  },
  // Desktop Table Styles
  tableScroll: {
    flex: 1,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tdText: {
    fontSize: 13,
    color: '#0F172A',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  restName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  restContact: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
  },
  badgeSuspended: {
    backgroundColor: '#FEE2E2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#15803D',
  },
  badgeTextSuspended: {
    color: '#B91C1C',
  },
  planName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  subStatus: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnWarn: {
    backgroundColor: '#FEE2E2',
  },
  actionBtnSuccess: {
    backgroundColor: '#DCFCE7',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 580,
    maxHeight: '94%',
    flexDirection: 'column',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalBody: {
    flex: 1,
    width: '100%',
  },
  modalBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 90,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 14,
    color: '#0F172A',
  },
  formRow: {
    flexDirection: 'row',
  },
  mapSearchContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
    marginTop: 14,
    marginBottom: 6,
  },
  mapSearchHeader: {
    marginBottom: 8,
  },
  mapSearchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  mapSearchSubtitle: {
    fontSize: 11,
    color: '#0284C7',
    marginTop: 2,
  },
  mapSearchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 2,
  },
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 8,
    overflow: 'hidden',
  },
  suggestionsList: {
    maxHeight: 220,
  },
  suggestionsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  suggestionAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  suggestionTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  suggestionTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  selectedPlaceBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  selectedPlaceText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
  },
  geoContainer: {
    marginTop: 14,
    marginBottom: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  geoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  geoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  geoSubtitle: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
  },
  geoActiveTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  geoActiveTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  fetchLocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  fetchLocBtnDisabled: {
    opacity: 0.6,
  },
  fetchLocBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 12,
    flexShrink: 0,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
