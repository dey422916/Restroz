import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { orderService } from '../../src/services/api/orderService';
import { productService } from '../../src/services/api/productService';
import { categoryService } from '../../src/services/api/categoryService';
import { settingsService } from '../../src/services/api/settingsService';
import { dayRegisterService, getLocalRestaurantDate } from '../../src/services/api/dayRegisterService';
import { analyticsService } from '../../src/services/api/analyticsService';
import { useAuth } from '../../src/context/AuthContext';
import { formatCurrency } from '../../src/utils/currency';
import { Order, Product, Category, DayRegister, RestaurantSettings, ItemSalesSummary } from '../../src/types';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { activeRestaurantId, activeRestaurant } = useAuth();
  const isMobile = width < 768;

  // Primary navigation tabs
  const [activeTab, setActiveTab] = useState<'sales' | 'items' | 'register'>('sales');

  // Core Data
  const [loading, setLoading] = useState<boolean>(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [registers, setRegisters] = useState<DayRegister[]>([]);
  const [activeRegister, setActiveRegister] = useState<DayRegister | null>(null);

  // Date Range Filtering for Analytics (Local Timezone YYYY-MM-DD)
  const todayStr = useMemo(() => getLocalRestaurantDate(new Date()), []);
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'custom'>('today');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  // Item Search & Filter
  const [itemSearch, setItemSearch] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedFoodTypeFilter, setSelectedFoodTypeFilter] = useState<'all' | 'veg' | 'non-veg' | 'egg'>('all');

  // Register Modals
  const [showOpenModal, setShowOpenModal] = useState<boolean>(false);
  const [openStaffName, setOpenStaffName] = useState<string>('Staff / Admin');
  const [openFloatInput, setOpenFloatInput] = useState<string>('2000');
  const [openNotes, setOpenNotes] = useState<string>('');
  const [submittingOpen, setSubmittingOpen] = useState<boolean>(false);

  const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
  const [closeStaffName, setCloseStaffName] = useState<string>('Staff / Admin');
  const [countedCashInput, setCountedCashInput] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [submittingClose, setSubmittingClose] = useState<boolean>(false);
  const [liveReconciliation, setLiveReconciliation] = useState<any>(null);

  // Z-Report Modal
  const [viewingZReport, setViewingZReport] = useState<DayRegister | null>(null);

  // Load all initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [ords, prods, cats, sets, regList, curReg] = await Promise.all([
        orderService.getOrders(activeRestaurantId),
        productService.getProducts(activeRestaurantId),
        categoryService.getCategories(activeRestaurantId),
        settingsService.getSettings(activeRestaurantId),
        dayRegisterService.getRegisters(activeRestaurantId),
        dayRegisterService.getCurrentRegister(activeRestaurantId),
      ]);

      setOrders(ords);
      setProducts(prods);
      setCategories(cats);
      setSettings(sets);
      setRegisters(regList);
      setActiveRegister(curReg && curReg.status === 'open' ? curReg : null);

      if (curReg && curReg.status === 'open') {
        const recon = await dayRegisterService.calculateRegisterReconciliation(curReg);
        setLiveReconciliation(recon);
      }
    } catch (e) {
      console.warn('Dashboard loadData exception:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      if (activeRestaurantId) {
        const refreshedOrders = await orderService.getOrders(activeRestaurantId);
        setOrders(refreshedOrders);
        const curReg = await dayRegisterService.getCurrentRegister(activeRestaurantId);
        setActiveRegister(curReg && curReg.status === 'open' ? curReg : null);
        if (curReg && curReg.status === 'open') {
          const recon = await dayRegisterService.calculateRegisterReconciliation(curReg);
          setLiveReconciliation(recon);
        }
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [activeRestaurantId]);

  // Handle Date Presets
  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'today') {
      const t = getLocalRestaurantDate(now);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'yesterday') {
      const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const y = getLocalRestaurantDate(yDate);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === '7days') {
      const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setStartDate(getLocalRestaurantDate(past7));
      setEndDate(getLocalRestaurantDate(now));
    } else if (preset === '30days') {
      const past30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      setStartDate(getLocalRestaurantDate(past30));
      setEndDate(getLocalRestaurantDate(now));
    }
  };

  // Day-wise Sales Analytics
  const daySalesData = useMemo(() => {
    return analyticsService.getDayWiseSales(orders, startDate, endDate);
  }, [orders, startDate, endDate]);

  // Item-wise Sales & Best Sellers Analytics
  const itemSalesData = useMemo(() => {
    return analyticsService.getItemWiseSales(orders, products, startDate, endDate);
  }, [orders, products, startDate, endDate]);

  // Filtered Item Ranking List
  const filteredItemRanking = useMemo(() => {
    return itemSalesData.items.filter((itm) => {
      const matchesSearch =
        itm.product_name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        itm.sku.toLowerCase().includes(itemSearch.toLowerCase());
      const matchesCat =
        selectedCategoryFilter === 'all' ||
        itm.category_name.toLowerCase() === selectedCategoryFilter.toLowerCase();
      const matchesFoodType =
        selectedFoodTypeFilter === 'all' || itm.food_type === selectedFoodTypeFilter;
      return matchesSearch && matchesCat && matchesFoodType;
    });
  }, [itemSalesData.items, itemSearch, selectedCategoryFilter, selectedFoodTypeFilter]);

  // Handle Open Register
  const handleOpenRegisterSubmit = async () => {
    const floatAmount = parseFloat(openFloatInput);
    if (isNaN(floatAmount) || floatAmount < 0) {
      if (Platform.OS === 'web') window.alert('Please enter a valid opening cash float amount.');
      else Alert.alert('Invalid Float', 'Please enter a valid opening cash float amount.');
      return;
    }

    setSubmittingOpen(true);
    try {
      const created = await dayRegisterService.openRegister({
        opening_cash_float: floatAmount,
        opened_by: openStaffName.trim() || 'Admin',
        notes: openNotes.trim() || undefined,
        restaurant_id: activeRestaurantId,
      });

      setActiveRegister(created);
      setShowOpenModal(false);
      await loadData();

      const msg = `Register successfully OPENED with ₹${floatAmount.toFixed(2)} opening cash float.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Register Opened', msg);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message);
      else Alert.alert('Open Register Error', err.message);
    } finally {
      setSubmittingOpen(false);
    }
  };

  // Open Close Register Dialog
  const handleInitiateCloseRegister = async () => {
    if (!activeRegister) return;
    const recon = await dayRegisterService.calculateRegisterReconciliation(activeRegister, activeRestaurantId);
    setLiveReconciliation(recon);
    setCountedCashInput(recon.expected_cash.toString());
    setShowCloseModal(true);
  };

  // Handle Close Register Submit
  const handleCloseRegisterSubmit = async () => {
    if (!activeRegister) return;
    const counted = parseFloat(countedCashInput);
    if (isNaN(counted) || counted < 0) {
      if (Platform.OS === 'web') window.alert('Please enter the counted cash drawer amount.');
      else Alert.alert('Invalid Cash', 'Please enter the counted cash drawer amount.');
      return;
    }

    setSubmittingClose(true);
    try {
      const closed = await dayRegisterService.closeRegister({
        register_id: activeRegister.id,
        actual_cash_counted: counted,
        closed_by: closeStaffName.trim() || 'Admin',
        closing_notes: closeNotes.trim() || undefined,
        restaurant_id: activeRestaurantId,
      });

      setActiveRegister(null);
      setShowCloseModal(false);
      await loadData();
      setViewingZReport(closed);

      const diff = closed.cash_difference || 0;
      const diffText =
        diff === 0
          ? 'Cash drawer balanced perfectly.'
          : diff > 0
          ? `Cash Over: +₹${diff.toFixed(2)}`
          : `Cash Shortage: -₹${Math.abs(diff).toFixed(2)}`;
      const msg = `Register CLOSED for ${closed.register_date}.\n${diffText}\nZ-Report generated.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Register Closed', msg);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message);
      else Alert.alert('Close Register Error', err.message);
    } finally {
      setSubmittingClose(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            📊 Analytics & Day Operations
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Day-wise sales, item ranking & register (00:00–24:00)
          </Text>
        </View>

        <TouchableOpacity style={styles.posNavBtn} onPress={() => router.push('/(admin)')}>
          <Text style={styles.posNavBtnText}>🖥️ POS</Text>
        </TouchableOpacity>
      </View>

      {/* Live Register Status Banner */}
      <View
        style={[
          styles.registerBanner,
          activeRegister ? styles.registerBannerOpen : styles.registerBannerClosed,
          isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
        ]}
      >
        <View style={styles.registerBannerLeft}>
          <Text style={{ fontSize: 16 }}>{activeRegister ? '🟢' : '🔴'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.registerStatusTitle}>
              {activeRegister ? 'Register OPEN (Active Shift)' : 'Register CLOSED'}
            </Text>
            <Text style={styles.registerStatusDesc}>
              {activeRegister
                ? `Opened by ${activeRegister.opened_by} • Float: ${formatCurrency(activeRegister.opening_cash_float)} • Live Cash: ${formatCurrency(liveReconciliation?.expected_cash || activeRegister.opening_cash_float)}`
                : 'Open register with opening float to start POS orders.'}
            </Text>
          </View>
        </View>

        <View style={styles.registerBannerActions}>
          {activeRegister ? (
            <TouchableOpacity
              style={[styles.closeRegBtn, isMobile && { width: '100%', alignItems: 'center' }]}
              onPress={handleInitiateCloseRegister}
            >
              <Text style={styles.closeRegBtnText}>🔒 Close Register (Z-Report)</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.openRegBtn, isMobile && { width: '100%', alignItems: 'center' }]}
              onPress={() => setShowOpenModal(true)}
            >
              <Text style={styles.openRegBtnText}>💵 Open Register Now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main 3 Navigation Tabs - Scrollable */}
      <View style={styles.tabScrollWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mainTabScroll}
        >
          <TouchableOpacity
            accessibilityRole="button"
            testID="tab-sales"
            style={[styles.mainTabBtn, activeTab === 'sales' && styles.mainTabBtnActive]}
            onPress={() => setActiveTab('sales')}
          >
            <Text style={[styles.mainTabText, activeTab === 'sales' && styles.mainTabTextActive]}>
              📈 Day-Wise Sales
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            testID="tab-items"
            style={[styles.mainTabBtn, activeTab === 'items' && styles.mainTabBtnActive]}
            onPress={() => setActiveTab('items')}
          >
            <Text style={[styles.mainTabText, activeTab === 'items' && styles.mainTabTextActive]}>
              🏆 Item-Wise Best Sellers ({itemSalesData.items.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            testID="tab-register"
            style={[styles.mainTabBtn, activeTab === 'register' && styles.mainTabBtnActive]}
            onPress={() => setActiveTab('register')}
          >
            <Text style={[styles.mainTabText, activeTab === 'register' && styles.mainTabTextActive]}>
              📋 Register & Z-Reports ({registers.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Content Container */}
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        {/* ========================================================================= */}
        {/* TAB 1: DAY-WISE SALES REPORT                                              */}
        {/* ========================================================================= */}
        {activeTab === 'sales' && (
          <View>
            {/* Date Preset Filter Card */}
            <View style={styles.dateFilterCard}>
              <Text style={styles.dateFilterLabel}>Select Reporting Period (00:00–24:00 Local Cycle):</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.datePillRow}
              >
                <TouchableOpacity
                  style={[styles.datePill, datePreset === 'today' && styles.datePillActive]}
                  onPress={() => applyDatePreset('today')}
                >
                  <Text style={[styles.datePillText, datePreset === 'today' && styles.datePillTextActive]}>
                    Today ({todayStr})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.datePill, datePreset === 'yesterday' && styles.datePillActive]}
                  onPress={() => applyDatePreset('yesterday')}
                >
                  <Text style={[styles.datePillText, datePreset === 'yesterday' && styles.datePillTextActive]}>
                    Yesterday
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.datePill, datePreset === '7days' && styles.datePillActive]}
                  onPress={() => applyDatePreset('7days')}
                >
                  <Text style={[styles.datePillText, datePreset === '7days' && styles.datePillTextActive]}>
                    Last 7 Days
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.datePill, datePreset === '30days' && styles.datePillActive]}
                  onPress={() => applyDatePreset('30days')}
                >
                  <Text style={[styles.datePillText, datePreset === '30days' && styles.datePillTextActive]}>
                    Last 30 Days
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Custom Date Inputs */}
              <View
                style={[
                  styles.customDateRow,
                  isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>From:</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={startDate}
                    onChangeText={(t) => {
                      setStartDate(t);
                      setDatePreset('custom');
                    }}
                    placeholder="YYYY-MM-DD"
                  />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>To:</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={endDate}
                    onChangeText={(t) => {
                      setEndDate(t);
                      setDatePreset('custom');
                    }}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={{ alignSelf: isMobile ? 'flex-start' : 'auto' }}>
                  <Text style={styles.dateRangeBadge}>
                    📅 {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Core KPI Metrics Grid */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { borderLeftColor: '#16a34a' }]}>
                <Text style={styles.kpiLabel}>Net Sales</Text>
                <Text style={[styles.kpiValue, { color: '#16a34a' }]}>
                  {formatCurrency(daySalesData.totals.net_sales)}
                </Text>
                <Text style={styles.kpiSub}>
                  Gross: {formatCurrency(daySalesData.totals.gross_sales)} • AOV: {formatCurrency(daySalesData.totals.average_order_value)}
                </Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#2563eb' }]}>
                <Text style={styles.kpiLabel}>Total Orders</Text>
                <Text style={[styles.kpiValue, { color: '#2563eb' }]}>
                  {daySalesData.totals.total_orders}
                </Text>
                <Text style={styles.kpiSub}>
                  {daySalesData.totals.paid_orders_count} Paid • {daySalesData.totals.cancelled_orders_count} Cancelled
                </Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#7c3aed' }]}>
                <Text style={styles.kpiLabel}>Tax Collected (GST)</Text>
                <Text style={[styles.kpiValue, { color: '#7c3aed' }]}>
                  {formatCurrency(daySalesData.totals.tax_collected)}
                </Text>
                <Text style={styles.kpiSub}>CGST + SGST</Text>
              </View>

              <View style={[styles.kpiCard, { borderLeftColor: '#ea580c' }]}>
                <Text style={styles.kpiLabel}>Discounts</Text>
                <Text style={[styles.kpiValue, { color: '#ea580c' }]}>
                  {formatCurrency(daySalesData.totals.discount_amount)}
                </Text>
                <Text style={styles.kpiSub}>Promos & Coupons</Text>
              </View>
            </View>

            {/* Payment Methods & Channels Split */}
            <View style={[styles.splitRow, isMobile && { flexDirection: 'column' }]}>
              {/* Payment Methods Breakdown */}
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.cardHeaderTitle}>💳 Payment Reconciliation</Text>
                <Text style={styles.cardHeaderSub}>Breakdown across payment records</Text>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>💵 Cash Sales</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.cash_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#16a34a',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.cash_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>📱 UPI / QR</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.upi_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#2563eb',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.upi_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>💳 Card</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.card_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#7c3aed',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.card_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              {/* Order Channels Breakdown */}
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.cardHeaderTitle}>🍽️ Sales by Order Channel</Text>
                <Text style={styles.cardHeaderSub}>Revenue distribution across order types</Text>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>🍽️ POS Dine-In</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.dine_in_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#0284c7',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.dine_in_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>📱 QR Digital Menu</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.qr_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#8b5cf6',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.qr_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>🛍️ POS Takeaway</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.takeaway_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#ea580c',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.takeaway_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownItemHeader}>
                    <Text style={styles.breakdownItemTitle} numberOfLines={1}>🌐 Online Delivery</Text>
                    <Text style={styles.breakdownItemVal}>{formatCurrency(daySalesData.totals.delivery_sales)}</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#059669',
                          width: `${daySalesData.totals.net_sales > 0 ? (daySalesData.totals.delivery_sales / daySalesData.totals.net_sales) * 100 : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Day-by-Day Detailed History Table - Scrollable */}
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>📅 Day-by-Day Sales Breakdown (00:00–24:00)</Text>
              <Text style={styles.cardHeaderSub}>Daily settlement records in local restaurant time</Text>

              {daySalesData.dailySummaries.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={{ fontSize: 28 }}>📭</Text>
                  <Text style={styles.emptyText}>No sales recorded for the selected period.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={[styles.tableContainer, { minWidth: 680 }]}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.th, { width: 140 }]}>Date</Text>
                      <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Orders</Text>
                      <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>Net Sales</Text>
                      <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>Cash</Text>
                      <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>UPI / Digital</Text>
                      <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Tax</Text>
                      <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>AOV</Text>
                    </View>

                    {daySalesData.dailySummaries.map((day) => (
                      <View key={day.date} style={styles.tableDataRow}>
                        <View style={{ width: 140 }}>
                          <Text style={styles.tdDate}>{day.formatted_date}</Text>
                          <Text style={styles.tdSub}>{day.date}</Text>
                        </View>
                        <Text style={[styles.td, { width: 70, textAlign: 'center', fontWeight: 'bold' }]}>
                          {day.total_orders}
                        </Text>
                        <Text style={[styles.td, { width: 110, textAlign: 'right', fontWeight: '900', color: '#16a34a' }]}>
                          {formatCurrency(day.net_sales)}
                        </Text>
                        <Text style={[styles.td, { width: 100, textAlign: 'right', color: '#334155' }]}>
                          {formatCurrency(day.cash_sales)}
                        </Text>
                        <Text style={[styles.td, { width: 110, textAlign: 'right', color: '#2563eb' }]}>
                          {formatCurrency(day.upi_sales + day.card_sales)}
                        </Text>
                        <Text style={[styles.td, { width: 80, textAlign: 'right', color: '#64748b' }]}>
                          {formatCurrency(day.tax_collected)}
                        </Text>
                        <Text style={[styles.td, { width: 70, textAlign: 'right', color: '#0f172a', fontWeight: '600' }]}>
                          {formatCurrency(day.average_order_value)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ITEM-WISE SALES REPORT & BEST SELLERS                              */}
        {/* ========================================================================= */}
        {activeTab === 'items' && (
          <View>
            {/* Top 5 Best Sellers Spotlight */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.cardHeaderTitle}>🔥 Top 5 Best Selling Items</Text>
                  <Text style={styles.cardHeaderSub}>Most popular dishes by units sold & revenue</Text>
                </View>
                <Text style={styles.totalUnitsBadge}>
                  {itemSalesData.totalUnitsSold} Units Sold
                </Text>
              </View>

              <View style={styles.bestSellersGrid}>
                {itemSalesData.topSellingItems.map((item, idx) => (
                  <View key={item.product_id} style={[styles.bestSellerCard, isMobile && { minWidth: '100%' }]}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankBadgeText}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.bestSellerBody}>
                      <View style={styles.dishTitleRow}>
                        <View
                          style={[
                            styles.foodTypeDot,
                            {
                              backgroundColor:
                                item.food_type === 'veg'
                                  ? '#16a34a'
                                  : item.food_type === 'egg'
                                  ? '#d97706'
                                  : '#dc2626',
                            },
                          ]}
                        />
                        <Text style={styles.bestSellerName} numberOfLines={1}>
                          {item.product_name}
                        </Text>
                      </View>
                      <Text style={styles.bestSellerCat}>{item.category_name} • {item.sku}</Text>
                      <View style={styles.bestSellerStatRow}>
                        <Text style={styles.bestSellerUnits}>{item.units_sold} Sold</Text>
                        <Text style={styles.bestSellerRevenue}>{formatCurrency(item.total_revenue)}</Text>
                      </View>
                      <View style={styles.shareBarBg}>
                        <View
                          style={[
                            styles.shareBarFill,
                            {
                              width: `${Math.min(100, item.share_percentage * 2.5)}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.shareText}>{item.share_percentage}% of total dish sales</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Category Revenue Distribution */}
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>📂 Sales by Food Category</Text>
              <Text style={styles.cardHeaderSub}>Category revenue and units breakdown</Text>

              <View style={styles.catGrid}>
                {itemSalesData.categorySales.map((cat) => (
                  <View key={cat.category_name} style={[styles.catCard, isMobile && { minWidth: '46%' }]}>
                    <Text style={styles.catName} numberOfLines={1}>{cat.category_name}</Text>
                    <Text style={styles.catRevenue}>{formatCurrency(cat.total_revenue)}</Text>
                    <Text style={styles.catUnits}>{cat.units_sold} units sold</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Full Item Ranking Table - Scrollable */}
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>📋 Complete Item Sales Ranking Table</Text>
              <Text style={styles.cardHeaderSub}>Search, sort and analyze sales performance for every menu item</Text>

              {/* Filters */}
              <View style={styles.itemFilterRow}>
                <TextInput
                  style={styles.itemSearchInput}
                  placeholder="Search item by name or SKU..."
                  value={itemSearch}
                  onChangeText={setItemSearch}
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catFilterPills}>
                  <TouchableOpacity
                    style={[styles.catPill, selectedCategoryFilter === 'all' && styles.catPillActive]}
                    onPress={() => setSelectedCategoryFilter('all')}
                  >
                    <Text style={[styles.catPillText, selectedCategoryFilter === 'all' && styles.catPillTextActive]}>
                      All Categories
                    </Text>
                  </TouchableOpacity>

                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catPill, selectedCategoryFilter === c.name && styles.catPillActive]}
                      onPress={() => setSelectedCategoryFilter(c.name)}
                    >
                      <Text style={[styles.catPillText, selectedCategoryFilter === c.name && styles.catPillTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {filteredItemRanking.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={{ fontSize: 28 }}>🔍</Text>
                  <Text style={styles.emptyText}>No menu items match your search or filter.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={[styles.tableContainer, { minWidth: 680 }]}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.th, { width: 35, textAlign: 'center' }]}>#</Text>
                      <Text style={[styles.th, { width: 170 }]}>Dish Name & SKU</Text>
                      <Text style={[styles.th, { width: 110 }]}>Category</Text>
                      <Text style={[styles.th, { width: 80, textAlign: 'center' }]}>Units Sold</Text>
                      <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Avg Price</Text>
                      <Text style={[styles.th, { width: 105, textAlign: 'right' }]}>Total Revenue</Text>
                      <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Sales Share</Text>
                    </View>

                    {filteredItemRanking.map((item, idx) => (
                      <View key={item.product_id} style={styles.tableDataRow}>
                        <Text style={[styles.td, { width: 35, textAlign: 'center', fontWeight: 'bold', color: '#64748b' }]}>
                          {idx + 1}
                        </Text>
                        <View style={{ width: 170, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View
                            style={[
                              styles.foodTypeDot,
                              {
                                backgroundColor:
                                  item.food_type === 'veg'
                                    ? '#16a34a'
                                    : item.food_type === 'egg'
                                    ? '#d97706'
                                    : '#dc2626',
                              },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tdItemName} numberOfLines={1}>{item.product_name}</Text>
                            <Text style={styles.tdSub}>{item.sku}</Text>
                          </View>
                        </View>
                        <Text style={[styles.td, { width: 110, color: '#475569' }]} numberOfLines={1}>{item.category_name}</Text>
                        <Text style={[styles.td, { width: 80, textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }]}>
                          {item.units_sold}
                        </Text>
                        <Text style={[styles.td, { width: 90, textAlign: 'right', color: '#64748b' }]}>
                          {formatCurrency(item.average_price)}
                        </Text>
                        <Text style={[styles.td, { width: 105, textAlign: 'right', fontWeight: '900', color: '#16a34a' }]}>
                          {formatCurrency(item.total_revenue)}
                        </Text>
                        <Text style={[styles.td, { width: 90, textAlign: 'right', fontWeight: 'bold', color: '#2563eb' }]}>
                          {item.share_percentage}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: REGISTER & Z-REPORTS                                               */}
        {/* ========================================================================= */}
        {activeTab === 'register' && (
          <View>
            {/* Active Shift Summary Card */}
            {activeRegister ? (
              <View style={[styles.card, { borderColor: '#16a34a', borderWidth: 2 }]}>
                <View style={[styles.sectionHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                  <View>
                    <Text style={[styles.cardHeaderTitle, { color: '#16a34a' }]}>
                      🟢 Active Register Shift ({activeRegister.register_date})
                    </Text>
                    <Text style={styles.cardHeaderSub}>
                      Opened at {new Date(activeRegister.opened_at).toLocaleTimeString()} by {activeRegister.opened_by}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.closeRegBtn, isMobile && { width: '100%', alignItems: 'center' }]}
                    onPress={handleInitiateCloseRegister}
                  >
                    <Text style={styles.closeRegBtnText}>🔒 Close Register & End Day</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.activeRegGrid}>
                  <View style={[styles.activeRegBox, isMobile && { minWidth: '46%' }]}>
                    <Text style={styles.activeRegLabel}>Opening Cash Float</Text>
                    <Text style={styles.activeRegVal}>{formatCurrency(activeRegister.opening_cash_float)}</Text>
                  </View>

                  <View style={[styles.activeRegBox, isMobile && { minWidth: '46%' }]}>
                    <Text style={styles.activeRegLabel}>Cash Sales Collected</Text>
                    <Text style={[styles.activeRegVal, { color: '#16a34a' }]}>
                      {formatCurrency(liveReconciliation?.cash_sales || 0)}
                    </Text>
                  </View>

                  <View style={[styles.activeRegBox, isMobile && { minWidth: '46%' }]}>
                    <Text style={styles.activeRegLabel}>Expected Cash in Drawer</Text>
                    <Text style={[styles.activeRegVal, { color: '#0f172a', fontWeight: '900' }]}>
                      {formatCurrency(liveReconciliation?.expected_cash || activeRegister.opening_cash_float)}
                    </Text>
                  </View>

                  <View style={[styles.activeRegBox, isMobile && { minWidth: '46%' }]}>
                    <Text style={styles.activeRegLabel}>UPI & Card Sales</Text>
                    <Text style={[styles.activeRegVal, { color: '#2563eb' }]}>
                      {formatCurrency(liveReconciliation?.digital_sales || 0)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
                <View style={[styles.sectionHeaderRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                  <View>
                    <Text style={[styles.cardHeaderTitle, { color: '#b91c1c' }]}>
                      🔴 Restaurant Register is Currently CLOSED
                    </Text>
                    <Text style={styles.cardHeaderSub}>
                      Open register with an opening cash float to begin today's POS business cycle.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.openRegBtn, isMobile && { width: '100%', alignItems: 'center' }]}
                    onPress={() => setShowOpenModal(true)}
                  >
                    <Text style={styles.openRegBtnText}>💵 Open Register Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Historical Register Closures Log */}
            <View style={styles.card}>
              <Text style={styles.cardHeaderTitle}>📜 Historical Register Settlements & Z-Reports</Text>
              <Text style={styles.cardHeaderSub}>Past day settlements, cash reconciliation audits, and discrepancies</Text>

              {registers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={{ fontSize: 28 }}>📭</Text>
                  <Text style={styles.emptyText}>No register sessions recorded yet.</Text>
                </View>
              ) : (
                <View style={styles.regHistoryList}>
                  {registers.map((reg) => {
                    const diff = reg.cash_difference || 0;
                    const isClosed = reg.status === 'closed';

                    return (
                      <View key={reg.id} style={styles.regHistoryCard}>
                        <View style={[styles.regCardHeader, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                          <View>
                            <Text style={styles.regCardDate}>📅 {reg.register_date}</Text>
                            <Text style={styles.regCardSub}>
                              Opened: {new Date(reg.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {reg.opened_by}
                              {reg.closed_at ? ` • Closed: ${new Date(reg.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by ${reg.closed_by}` : ' • Active Shift'}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={[
                                styles.regStatusBadge,
                                { backgroundColor: isClosed ? '#f1f5f9' : '#dcfce7' },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.regStatusBadgeText,
                                  { color: isClosed ? '#475569' : '#16a34a' },
                                ]}
                              >
                                {isClosed ? 'CLOSED' : 'OPEN'}
                              </Text>
                            </View>

                            {isClosed && (
                              <TouchableOpacity
                                style={styles.viewZReportBtn}
                                onPress={() => setViewingZReport(reg)}
                              >
                                <Text style={styles.viewZReportBtnText}>📄 View Z-Report</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        <View style={styles.regMetricsRow}>
                          <View style={styles.regMetricCol}>
                            <Text style={styles.regMetricLabel}>Float</Text>
                            <Text style={styles.regMetricVal}>{formatCurrency(reg.opening_cash_float)}</Text>
                          </View>
                          <View style={styles.regMetricCol}>
                            <Text style={styles.regMetricLabel}>Cash Sales</Text>
                            <Text style={[styles.regMetricVal, { color: '#16a34a' }]}>{formatCurrency(reg.cash_sales)}</Text>
                          </View>
                          <View style={styles.regMetricCol}>
                            <Text style={styles.regMetricLabel}>Digital Sales</Text>
                            <Text style={[styles.regMetricVal, { color: '#2563eb' }]}>{formatCurrency(reg.digital_sales)}</Text>
                          </View>
                          <View style={styles.regMetricCol}>
                            <Text style={styles.regMetricLabel}>Expected Cash</Text>
                            <Text style={styles.regMetricVal}>{formatCurrency(reg.expected_cash)}</Text>
                          </View>
                          {isClosed && (
                            <>
                              <View style={styles.regMetricCol}>
                                <Text style={styles.regMetricLabel}>Actual Cash</Text>
                                <Text style={styles.regMetricVal}>{formatCurrency(reg.actual_cash_counted || 0)}</Text>
                              </View>
                              <View style={styles.regMetricCol}>
                                <Text style={styles.regMetricLabel}>Difference</Text>
                                <Text
                                  style={[
                                    styles.regMetricVal,
                                    {
                                      color:
                                        diff === 0
                                          ? '#16a34a'
                                          : diff > 0
                                          ? '#2563eb'
                                          : '#dc2626',
                                    },
                                  ]}
                                >
                                  {diff === 0 ? '✓ Balanced' : diff > 0 ? `+${formatCurrency(diff)}` : `-${formatCurrency(Math.abs(diff))}`}
                                </Text>
                              </View>
                            </>
                          )}
                        </View>

                        {reg.notes && (
                          <Text style={styles.regNotesText}>📝 Note: {reg.notes}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL 1: OPEN REGISTER                                                    */}
      {/* ========================================================================= */}
      <Modal visible={showOpenModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💵 Open Restaurant Register</Text>
              <TouchableOpacity onPress={() => setShowOpenModal(false)}>
                <Text style={{ fontSize: 20, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Enter opening cash float in the cash drawer to begin today's (00:00–24:00) shift.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff / Manager Name</Text>
              <TextInput
                style={styles.formInput}
                value={openStaffName}
                onChangeText={setOpenStaffName}
                placeholder="e.g. Admin / Cashier"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Opening Cash Float (₹)</Text>
              <TextInput
                style={styles.formInput}
                value={openFloatInput}
                onChangeText={setOpenFloatInput}
                keyboardType="numeric"
                placeholder="e.g. 2000"
              />
              <View style={styles.quickChipsRow}>
                {['1000', '2000', '3000', '5000'].map((chip) => (
                  <TouchableOpacity
                    key={chip}
                    style={styles.quickChip}
                    onPress={() => setOpenFloatInput(chip)}
                  >
                    <Text style={styles.quickChipText}>₹{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Opening Notes (Optional)</Text>
              <TextInput
                style={styles.formInput}
                value={openNotes}
                onChangeText={setOpenNotes}
                placeholder="e.g. Starting morning shift"
              />
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowOpenModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleOpenRegisterSubmit}
                disabled={submittingOpen}
              >
                {submittingOpen ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Open Register →</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: CLOSE REGISTER & Z-REPORT SETTLEMENT                             */}
      {/* ========================================================================= */}
      <Modal visible={showCloseModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔒 Close Register & End Shift (Z-Report)</Text>
              <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                <Text style={{ fontSize: 20, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Reconcile physical cash drawer against system calculated sales.
            </Text>

            {/* Reconciliation Snapshot */}
            <View style={styles.reconCard}>
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>Opening Cash Float:</Text>
                <Text style={styles.reconVal}>{formatCurrency(activeRegister?.opening_cash_float || 0)}</Text>
              </View>
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>+ Cash Sales Collected:</Text>
                <Text style={[styles.reconVal, { color: '#16a34a' }]}>
                  {formatCurrency(liveReconciliation?.cash_sales || 0)}
                </Text>
              </View>
              <View style={[styles.reconRow, { borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 6, marginTop: 4 }]}>
                <Text style={[styles.reconLabel, { fontWeight: 'bold', color: '#0f172a' }]}>
                  = Expected Cash in Drawer:
                </Text>
                <Text style={[styles.reconVal, { fontWeight: '900', color: '#0f172a', fontSize: 15 }]}>
                  {formatCurrency(liveReconciliation?.expected_cash || 0)}
                </Text>
              </View>
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>Digital / UPI / Card Sales:</Text>
                <Text style={[styles.reconVal, { color: '#2563eb' }]}>
                  {formatCurrency(liveReconciliation?.digital_sales || 0)}
                </Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff / Manager Closing Register</Text>
              <TextInput
                style={styles.formInput}
                value={closeStaffName}
                onChangeText={setCloseStaffName}
                placeholder="e.g. Admin / Cashier"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Counted Physical Cash in Drawer (₹)</Text>
              <TextInput
                style={styles.formInput}
                value={countedCashInput}
                onChangeText={setCountedCashInput}
                keyboardType="numeric"
                placeholder="Enter physical cash counted"
              />
            </View>

            {/* Discrepancy Indicator */}
            {(() => {
              const counted = parseFloat(countedCashInput) || 0;
              const expected = liveReconciliation?.expected_cash || 0;
              const diff = counted - expected;

              return (
                <View
                  style={[
                    styles.discrepancyBox,
                    {
                      backgroundColor:
                        diff === 0 ? '#dcfce7' : diff > 0 ? '#dbeafe' : '#fee2e2',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.discrepancyText,
                      {
                        color: diff === 0 ? '#16a34a' : diff > 0 ? '#1d4ed8' : '#b91c1c',
                      },
                    ]}
                  >
                    {diff === 0
                      ? '✓ Cash Drawer Perfectly Balanced'
                      : diff > 0
                      ? `🟢 Cash Over (Excess): +${formatCurrency(diff)}`
                      : `🔴 Cash Shortage: -${formatCurrency(Math.abs(diff))}`}
                  </Text>
                </View>
              );
            })()}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Closing Notes (Optional)</Text>
              <TextInput
                style={styles.formInput}
                value={closeNotes}
                onChangeText={setCloseNotes}
                placeholder="e.g. Handed over to night manager"
              />
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCloseModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#dc2626' }]}
                onPress={handleCloseRegisterSubmit}
                disabled={submittingClose}
              >
                {submittingClose ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Confirm Close & Settle Day →</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: Z-REPORT VIEW / PRINT                                            */}
      {/* ========================================================================= */}
      <Modal visible={Boolean(viewingZReport)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📄 Official Z-Report / Day Settlement</Text>
              <TouchableOpacity onPress={() => setViewingZReport(null)}>
                <Text style={{ fontSize: 20, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {viewingZReport && (
              <ScrollView style={{ maxHeight: 420 }}>
                <View style={styles.receiptContainer}>
                  <Text style={styles.receiptStoreName}>{activeRestaurant?.name || settings?.name || 'Restaurant POS'}</Text>
                  <Text style={styles.receiptAddress}>{settings?.address || activeRestaurant?.address || 'Restaurant POS'}</Text>
                  <Text style={styles.receiptGst}>GSTIN: {settings?.gstin || '22AAAAA0000A1Z5'}</Text>
                  <View style={styles.receiptDivider} />

                  <Text style={styles.receiptTitle}>*** Z-REPORT (DAY END SUMMARY) ***</Text>
                  <Text style={styles.receiptMeta}>Date: {viewingZReport.register_date}</Text>
                  <Text style={styles.receiptMeta}>
                    Opened: {new Date(viewingZReport.opened_at).toLocaleString()} ({viewingZReport.opened_by})
                  </Text>
                  <Text style={styles.receiptMeta}>
                    Closed: {viewingZReport.closed_at ? new Date(viewingZReport.closed_at).toLocaleString() : 'N/A'} ({viewingZReport.closed_by || 'N/A'})
                  </Text>
                  <View style={styles.receiptDivider} />

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptText}>Opening Cash Float:</Text>
                    <Text style={styles.receiptText}>{formatCurrency(viewingZReport.opening_cash_float)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptText}>Cash Sales:</Text>
                    <Text style={styles.receiptText}>{formatCurrency(viewingZReport.cash_sales)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptText}>UPI / Digital Sales:</Text>
                    <Text style={styles.receiptText}>{formatCurrency(viewingZReport.upi_sales + viewingZReport.card_sales)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptText, { fontWeight: 'bold' }]}>TOTAL NET SALES:</Text>
                    <Text style={[styles.receiptText, { fontWeight: 'bold' }]}>{formatCurrency(viewingZReport.total_sales)}</Text>
                  </View>
                  <View style={styles.receiptDivider} />

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptText}>Expected Cash:</Text>
                    <Text style={styles.receiptText}>{formatCurrency(viewingZReport.expected_cash)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptText}>Actual Counted Cash:</Text>
                    <Text style={styles.receiptText}>{formatCurrency(viewingZReport.actual_cash_counted || 0)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptText, { fontWeight: 'bold' }]}>Cash Discrepancy:</Text>
                    <Text style={[styles.receiptText, { fontWeight: 'bold' }]}>
                      {(viewingZReport.cash_difference || 0) === 0
                        ? '0.00 (Balanced)'
                        : formatCurrency(viewingZReport.cash_difference || 0)}
                    </Text>
                  </View>

                  {viewingZReport.notes && (
                    <>
                      <View style={styles.receiptDivider} />
                      <Text style={styles.receiptMeta}>Notes: {viewingZReport.notes}</Text>
                    </>
                  )}
                </View>
              </ScrollView>
            )}

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.print();
                  } else {
                    Alert.alert('Z-Report Printed', 'Z-Report sent to primary receipt printer.');
                  }
                }}
              >
                <Text style={styles.submitBtnText}>🖨️ Print Z-Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setViewingZReport(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 12 },

  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  headerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  posNavBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: 'center',
  },
  posNavBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 11 },

  // Register Banner
  registerBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  registerBannerOpen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  registerBannerClosed: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  registerBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  registerStatusTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  registerStatusDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  registerBannerActions: {},
  openRegBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openRegBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  closeRegBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeRegBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },

  // Main Tabs - Horizontal Scrollable
  tabScrollWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  mainTabScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  mainTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mainTabBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  mainTabText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  mainTabTextActive: { color: '#ffffff' },

  // Date Filter Card
  dateFilterCard: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  dateFilterLabel: { fontSize: 11, fontWeight: '800', color: '#334155', marginBottom: 8 },
  datePillRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  datePillActive: { backgroundColor: '#0f172a' },
  datePillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  datePillTextActive: { color: '#ffffff' },
  customDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    paddingTop: 8,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    width: 90,
    backgroundColor: '#f8fafc',
  },
  dateRangeBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // KPI Grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
  },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  kpiValue: { fontSize: 18, fontWeight: '900', marginVertical: 3 },
  kpiSub: { fontSize: 10, color: '#94a3b8' },

  // Split Row
  splitRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  card: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  cardHeaderTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  cardHeaderSub: { fontSize: 11, color: '#64748b', marginTop: 1, marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  // Breakdown Items
  breakdownItem: { marginBottom: 10 },
  breakdownItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  breakdownItemTitle: { fontSize: 11, fontWeight: '700', color: '#334155', flex: 1 },
  breakdownItemVal: { fontSize: 11, fontWeight: '800', color: '#0f172a', marginLeft: 8 },
  progressBarBg: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  // Tables
  tableContainer: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden' },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  th: { fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  td: { fontSize: 11, color: '#334155' },
  tdDate: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  tdSub: { fontSize: 9, color: '#94a3b8' },
  tdItemName: { fontSize: 11, fontWeight: '700', color: '#0f172a' },

  // Best Sellers
  totalUnitsBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  bestSellersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bestSellerCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rankBadgeText: { fontSize: 9, fontWeight: '900', color: '#b45309' },
  bestSellerBody: { marginTop: 2 },
  dishTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 24 },
  foodTypeDot: { width: 7, height: 7, borderRadius: 4 },
  bestSellerName: { fontSize: 12, fontWeight: '800', color: '#0f172a', flex: 1 },
  bestSellerCat: { fontSize: 9, color: '#64748b', marginTop: 1 },
  bestSellerStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 3 },
  bestSellerUnits: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  bestSellerRevenue: { fontSize: 11, fontWeight: '900', color: '#16a34a' },
  shareBarBg: { height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' },
  shareBarFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 3 },
  shareText: { fontSize: 8.5, color: '#94a3b8', marginTop: 2 },

  // Categories
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  catName: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  catRevenue: { fontSize: 13, fontWeight: '900', color: '#16a34a', marginVertical: 2 },
  catUnits: { fontSize: 9, color: '#64748b' },

  // Item Filters
  itemFilterRow: { marginBottom: 10 },
  itemSearchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    backgroundColor: '#f8fafc',
    marginBottom: 6,
  },
  catFilterPills: { gap: 6 },
  catPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  catPillActive: { backgroundColor: '#2563eb' },
  catPillText: { fontSize: 10, fontWeight: '600', color: '#475569' },
  catPillTextActive: { color: '#ffffff' },

  // Register Tab
  activeRegGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  activeRegBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeRegLabel: { fontSize: 9, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  activeRegVal: { fontSize: 14, fontWeight: '900', marginTop: 2 },

  regHistoryList: { gap: 8 },
  regHistoryCard: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  regCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  regCardDate: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  regCardSub: { fontSize: 10, color: '#64748b', marginTop: 1 },
  regStatusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  regStatusBadgeText: { fontSize: 9, fontWeight: '800' },
  viewZReportBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  viewZReportBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 9 },
  regMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    paddingTop: 6,
  },
  regMetricCol: { flex: 1, minWidth: 70 },
  regMetricLabel: { fontSize: 8.5, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  regMetricVal: { fontSize: 11, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  regNotesText: { fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginTop: 4 },

  emptyBox: { padding: 20, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 12, color: '#94a3b8', marginTop: 4 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 440,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  modalDesc: { fontSize: 11, color: '#64748b', marginBottom: 12 },
  formGroup: { marginBottom: 10 },
  formLabel: { fontSize: 10, fontWeight: '700', color: '#334155', marginBottom: 3 },
  formInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    backgroundColor: '#f8fafc',
  },
  quickChipsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  quickChip: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  quickChipText: { fontSize: 10, fontWeight: '700', color: '#334155' },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  submitBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  submitBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },

  // Reconciliation Box
  reconCard: {
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  reconRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  reconLabel: { fontSize: 10, color: '#475569' },
  reconVal: { fontSize: 11, fontWeight: '700' },
  discrepancyBox: { padding: 8, borderRadius: 6, marginBottom: 10, alignItems: 'center' },
  discrepancyText: { fontSize: 11, fontWeight: '800' },

  // Z-Report Receipt View
  receiptContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    borderRadius: 6,
  },
  receiptStoreName: { fontSize: 14, fontWeight: '900', textAlign: 'center', color: '#0f172a' },
  receiptAddress: { fontSize: 9, color: '#64748b', textAlign: 'center' },
  receiptGst: { fontSize: 9, fontWeight: '700', textAlign: 'center', color: '#334155' },
  receiptDivider: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#94a3b8', marginVertical: 6 },
  receiptTitle: { fontSize: 11, fontWeight: '900', textAlign: 'center', color: '#0f172a', marginBottom: 3 },
  receiptMeta: { fontSize: 9.5, color: '#475569', marginBottom: 1.5 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 1.5 },
  receiptText: { fontSize: 10, color: '#0f172a' },
});
