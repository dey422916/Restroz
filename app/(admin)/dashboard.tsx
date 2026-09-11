import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { orderService } from '../../src/services/api/orderService';
import { productService } from '../../src/services/api/productService';
import { categoryService } from '../../src/services/api/categoryService';
import { settingsService } from '../../src/services/api/settingsService';
import { dayRegisterService, getLocalRestaurantDate } from '../../src/services/api/dayRegisterService';
import { analyticsService } from '../../src/services/api/analyticsService';
import { reportExportService, ReportType } from '../../src/services/api/reportExportService';
import { printService } from '../../src/services/printService';
import { useAuth } from '../../src/context/AuthContext';
import { formatCurrency } from '../../src/utils/currency';
import { supabase, isSupabaseConfigured } from '../../src/services/supabase';
import { Order, Product, Category, DayRegister, RestaurantSettings, ItemSalesSummary } from '../../src/types';

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { activeRestaurantId, activeRestaurant } = useAuth();
  const isMobile = width < 768;

  // Primary navigation tabs
  const [activeTab, setActiveTab] = useState<'sales' | 'items' | 'register' | 'reports'>('sales');

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

  // Live Register Open Elapsed Timer (HH:MM:SS) derived from Supabase opened_at
  const [elapsedTimeStr, setElapsedTimeStr] = useState<string>('00:00:00');

  useEffect(() => {
    if (!activeRegister || !activeRegister.opened_at || activeRegister.status !== 'open') {
      setElapsedTimeStr('00:00:00');
      return;
    }

    const updateTimer = () => {
      const openedTimestamp = new Date(activeRegister.opened_at).getTime();
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - openedTimestamp) / 1000));
      const hours = Math.floor(diffSecs / 3600);
      const minutes = Math.floor((diffSecs % 3600) / 60);
      const seconds = diffSecs % 60;
      const pad = (n: number) => n.toString().padStart(2, '0');
      setElapsedTimeStr(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [activeRegister]);

  // Formatted Opened Since timestamp string: e.g. 03 Sep 2026, 09:15 AM
  const formatOpenedSince = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      const day = d.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      const formattedHours = hours.toString().padStart(2, '0');
      return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
    } catch {
      return isoString;
    }
  };

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

    // 1. Live Realtime Orders subscription for instant dashboard metrics updates
    let channel: any = null;
    if (isSupabaseConfigured && activeRestaurantId) {
      const channelName = `sub_dash_orders_${activeRestaurantId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `restaurant_id=eq.${activeRestaurantId}`,
          },
          async () => {
            const refreshedOrders = await orderService.getOrders(activeRestaurantId);
            setOrders(refreshedOrders);
            const curReg = await dayRegisterService.getCurrentRegister(activeRestaurantId);
            setActiveRegister(curReg && curReg.status === 'open' ? curReg : null);
            if (curReg && curReg.status === 'open') {
              const recon = await dayRegisterService.calculateRegisterReconciliation(curReg);
              setLiveReconciliation(recon);
            }
          }
        )
        .subscribe();
    }

    // 2. Low-frequency 60s background reconciliation fallback (reduced from 6s to eliminate 90% redundant egress)
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
    }, 60000);

    return () => {
      clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
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

  const [unsettledOrdersForClose, setUnsettledOrdersForClose] = useState<Order[]>([]);

  // Open Close Register Dialog (Restricted until all orders are settled)
  const handleInitiateCloseRegister = async () => {
    try {
      let reg = activeRegister;
      if (!reg || reg.status !== 'open') {
        reg = await dayRegisterService.getCurrentRegister(activeRestaurantId);
        if (reg && reg.status === 'open') {
          setActiveRegister(reg);
        }
      }

      if (!reg || reg.status !== 'open') {
        const msg = 'No open register shift found for this restaurant.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Register Closed', msg);
        return;
      }

      const [unsettled, recon] = await Promise.all([
        dayRegisterService.getUnsettledOrders(activeRestaurantId),
        dayRegisterService.calculateRegisterReconciliation(reg, activeRestaurantId),
      ]);

      setUnsettledOrdersForClose(unsettled);
      setLiveReconciliation(recon);
      setCountedCashInput(recon.expected_cash ? recon.expected_cash.toString() : '0');
      setShowCloseModal(true);
    } catch (err: any) {
      console.warn('handleInitiateCloseRegister error:', err);
      if (Platform.OS === 'web') window.alert(err?.message || 'Failed to initiate register closing.');
      else Alert.alert('Error', err?.message || 'Failed to initiate register closing.');
    }
  };

  // Handle Close Register Submit
  const handleCloseRegisterSubmit = async () => {
    let reg = activeRegister;
    if (!reg || reg.status !== 'open') {
      reg = await dayRegisterService.getCurrentRegister(activeRestaurantId);
    }
    if (!reg || reg.status !== 'open') {
      const msg = 'No active open register found.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    const counted = parseFloat(countedCashInput);
    if (isNaN(counted) || counted < 0) {
      const msg = 'Please enter the physical counted cash drawer amount.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid Cash', msg);
      return;
    }

    setSubmittingClose(true);
    try {
      const unsettled = await dayRegisterService.getUnsettledOrders(activeRestaurantId);
      if (unsettled.length > 0) {
        setUnsettledOrdersForClose(unsettled);
        const orderListPreview = unsettled
          .slice(0, 5)
          .map((o) => `#${o.order_number}`)
          .join(', ');
        const moreCount = unsettled.length > 5 ? ` and ${unsettled.length - 5} more` : '';
        const msg = `Cannot close register: There are ${unsettled.length} unsettled order(s) (${orderListPreview}${moreCount}). Please settle or cancel all orders before closing the register.`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Unsettled Orders Pending', msg);
        return;
      }

      const closed = await dayRegisterService.closeRegister({
        register_id: reg.id,
        actual_cash_counted: counted,
        closed_by: closeStaffName.trim() || 'Admin',
        closing_notes: closeNotes.trim() || undefined,
        restaurant_id: activeRestaurantId,
      });

      setActiveRegister(null);
      setShowCloseModal(false);
      setUnsettledOrdersForClose([]);
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
      if (Platform.OS === 'web') window.alert(err?.message || 'Failed to close register.');
      else Alert.alert('Close Register Error', err?.message || 'Failed to close register.');
    } finally {
      setSubmittingClose(false);
    }
  };

  // Report Export State & Handlers
  const [exportingReport, setExportingReport] = useState<string | null>(null);

  const handleExportReportCsv = async (type: ReportType) => {
    const effectiveSettings: RestaurantSettings = settings || {
      id: activeRestaurantId || 'default',
      name: activeRestaurant?.name || 'Restaurant POS',
      legal_name: (activeRestaurant as any)?.legal_name || activeRestaurant?.name || 'Restaurant POS',
      address: activeRestaurant?.address || '',
      phone: activeRestaurant?.phone || '',
      email: '',
      gstin: (activeRestaurant as any)?.gstin || '22AAAAA0000A1Z5',
      state: 'West Bengal',
      invoice_prefix: 'INV-',
      kot_prefix: 'KOT-',
      default_tax_rate: 5,
      currency: 'INR',
      currency_symbol: '₹',
      service_charge_rate: 0,
    };

    setExportingReport(`${type}_csv`);
    try {
      await reportExportService.downloadReportCsv(
        type,
        orders,
        startDate,
        endDate,
        effectiveSettings
      );
      const msg = `Excel/CSV report exported successfully for ${startDate} to ${endDate}.`;
      if (Platform.OS === 'web') {
        // file downloaded via browser
      } else {
        Alert.alert('Report Exported', msg);
      }
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Export Failed: ${err.message}`);
      else Alert.alert('Export Failed', err.message);
    } finally {
      setExportingReport(null);
    }
  };

  const handleExportReportPdf = async (type: ReportType) => {
    const effectiveSettings: RestaurantSettings = settings || {
      id: activeRestaurantId || 'default',
      name: activeRestaurant?.name || 'Restaurant POS',
      legal_name: (activeRestaurant as any)?.legal_name || activeRestaurant?.name || 'Restaurant POS',
      address: activeRestaurant?.address || '',
      phone: activeRestaurant?.phone || '',
      email: '',
      gstin: (activeRestaurant as any)?.gstin || '22AAAAA0000A1Z5',
      state: 'West Bengal',
      invoice_prefix: 'INV-',
      kot_prefix: 'KOT-',
      default_tax_rate: 5,
      currency: 'INR',
      currency_symbol: '₹',
      service_charge_rate: 0,
    };

    setExportingReport(`${type}_pdf`);
    try {
      await reportExportService.printOrExportReportPdf(
        type,
        orders,
        startDate,
        endDate,
        effectiveSettings
      );
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`PDF / Print Failed: ${err.message}`);
      else Alert.alert('PDF / Print Failed', err.message);
    } finally {
      setExportingReport(null);
    }
  };

  return (
    <View style={styles.container}>
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

      {/* ========================================================================= */}
      {/* SIMPLIFIED DASHBOARD REGISTER SECTION                                      */}
      {/* ========================================================================= */}
      {activeRegister ? (
        <View style={[styles.compactRegisterCard, isMobile && styles.compactRegisterCardMobile]}>
          <View style={styles.compactRegisterLeft}>
            <Text style={styles.compactRegisterTitle}>REGISTER OPEN FOR</Text>
            <Text style={styles.compactRegisterTimer}>{elapsedTimeStr}</Text>
          </View>

          <TouchableOpacity
            testID="dashboard-close-register-btn"
            style={styles.compactCloseBtn}
            onPress={handleInitiateCloseRegister}
            activeOpacity={0.85}
          >
            <Text style={styles.compactCloseBtnText}>Close Register</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.compactRegisterCardClosed, isMobile && styles.compactRegisterCardMobile]}>
          <View style={styles.compactRegisterLeft}>
            <Text style={styles.compactRegisterClosedTitle}>REGISTER CLOSED</Text>
            <Text style={styles.compactRegisterClosedSubtitle}>Open register shift to start POS orders</Text>
          </View>

          <TouchableOpacity
            testID="dashboard-open-register-btn"
            style={styles.compactOpenBtn}
            onPress={() => setShowOpenModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.compactOpenBtnText}>Open Register</Text>
          </TouchableOpacity>
        </View>
      )}

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

          <TouchableOpacity
            accessibilityRole="button"
            testID="tab-reports"
            style={[styles.mainTabBtn, activeTab === 'reports' && styles.mainTabBtnActive]}
            onPress={() => setActiveTab('reports')}
          >
            <Text style={[styles.mainTabText, activeTab === 'reports' && styles.mainTabTextActive]}>
              📑 Reports & Tax Center (6)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Content Container */}
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 }]}>
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
                    placeholderTextColor="#64748b"
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
                    placeholderTextColor="#64748b"
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
                  placeholderTextColor="#64748b"
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
                    style={styles.compactCloseBtn}
                    onPress={handleInitiateCloseRegister}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.compactCloseBtnText}>🔒 Close Shift & Reconcile</Text>
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

        {/* ========================================================================= */}
        {/* TAB 4: REPORTS & TAX EXPORT CENTER (6 STANDARD POS REPORTS)               */}
        {/* ========================================================================= */}
        {activeTab === 'reports' && (
          <View>
            {/* Date Range Selector for Reports */}
            <View style={styles.dateFilterCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <Text style={styles.dateFilterLabel}>📊 Report Timeframe Filter (Local Restaurant Date):</Text>
                <Text style={styles.dateRangeBadge}>
                  📅 {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
                </Text>
              </View>

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
                    placeholderTextColor="#64748b"
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
                    placeholderTextColor="#64748b"
                  />
                </View>

                <Text style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                  Calculations follow: Subtotal → Discount/Coupon → Taxable → CGST + SGST → Charges → Grand Total
                </Text>
              </View>
            </View>

            {/* Grid / List of 6 POS Reports */}
            <View style={styles.reportCardsContainer}>
              {/* Report 1: Daily Sales Report */}
              <View style={styles.reportCard}>
                <View style={styles.reportCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reportCardTitle}>1. Daily Sales Report</Text>
                      <View style={styles.reportBadge}><Text style={styles.reportBadgeText}>Channel Breakdown</Text></View>
                    </View>
                    <Text style={styles.reportCardDesc}>
                      Day-by-day sales aggregated across Dine-In, Takeaway, Online Delivery, and QR Digital Menu orders with complete tax and discount reconciliation.
                    </Text>
                  </View>
                </View>

                {/* Column Badges */}
                <View style={styles.colTagsContainer}>
                  <Text style={styles.colTagsLabel}>COLUMNS INCLUDED:</Text>
                  <View style={styles.colTagsRow}>
                    {[
                      'Date', 'Total Orders', 'Dine-In Orders', 'Takeaway Orders', 'Delivery Orders',
                      'QR Orders', 'Gross Sales', 'Discount', 'Coupon Discount', 'Taxable Amount',
                      'CGST', 'SGST', 'Other/Delivery Charges', 'Net Sales'
                    ].map((col) => (
                      <View key={col} style={styles.colTag}><Text style={styles.colTagText}>{col}</Text></View>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.reportActionRow}>
                  <TouchableOpacity
                    testID="export-csv-daily_sales"
                    style={[styles.exportBtn, styles.exportBtnCsv]}
                    onPress={() => handleExportReportCsv('daily_sales')}
                    disabled={exportingReport === 'daily_sales_csv'}
                  >
                    {exportingReport === 'daily_sales_csv' ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Text style={styles.exportBtnCsvText}>📥 Download Excel / CSV</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="export-pdf-daily_sales"
                    style={[styles.exportBtn, styles.exportBtnPdf]}
                    onPress={() => handleExportReportPdf('daily_sales')}
                    disabled={exportingReport === 'daily_sales_pdf'}
                  >
                    {exportingReport === 'daily_sales_pdf' ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.exportBtnPdfText}>📄 Download PDF / Print</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Report 2: Daily Order Report */}
              <View style={styles.reportCard}>
                <View style={styles.reportCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reportCardTitle}>2. Daily Order Report</Text>
                      <View style={[styles.reportBadge, { backgroundColor: '#eff6ff' }]}><Text style={[styles.reportBadgeText, { color: '#2563eb' }]}>Detailed Invoices</Text></View>
                    </View>
                    <Text style={styles.reportCardDesc}>
                      Order-by-order itemized log with exact order timestamps, table number/customer name, item quantities, taxable base, taxes, and status.
                    </Text>
                  </View>
                </View>

                {/* Column Badges */}
                <View style={styles.colTagsContainer}>
                  <Text style={styles.colTagsLabel}>COLUMNS INCLUDED:</Text>
                  <View style={styles.colTagsRow}>
                    {[
                      'Date', 'Order Time', 'Order ID', 'Order Type', 'Table No./Customer',
                      'Item Qty', 'Subtotal', 'Discount', 'Coupon Discount', 'Taxable Amount',
                      'CGST', 'SGST', 'Charges', 'Grand Total', 'Order Status'
                    ].map((col) => (
                      <View key={col} style={styles.colTag}><Text style={styles.colTagText}>{col}</Text></View>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.reportActionRow}>
                  <TouchableOpacity
                    testID="export-csv-daily_order"
                    style={[styles.exportBtn, styles.exportBtnCsv]}
                    onPress={() => handleExportReportCsv('daily_order')}
                    disabled={exportingReport === 'daily_order_csv'}
                  >
                    {exportingReport === 'daily_order_csv' ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Text style={styles.exportBtnCsvText}>📥 Download Excel / CSV</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="export-pdf-daily_order"
                    style={[styles.exportBtn, styles.exportBtnPdf]}
                    onPress={() => handleExportReportPdf('daily_order')}
                    disabled={exportingReport === 'daily_order_pdf'}
                  >
                    {exportingReport === 'daily_order_pdf' ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.exportBtnPdfText}>📄 Download PDF / Print</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Report 3: Daily Revenue Report */}
              <View style={styles.reportCard}>
                <View style={styles.reportCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reportCardTitle}>3. Daily Revenue Report</Text>
                      <View style={[styles.reportBadge, { backgroundColor: '#fef3c7' }]}><Text style={[styles.reportBadgeText, { color: '#d97706' }]}>Executive Summary</Text></View>
                    </View>
                    <Text style={styles.reportCardDesc}>
                      Executive day-by-day revenue audit showing Gross Revenue, Promo Deductions, Taxable Turnover, Taxes Collected, and Net Realized Revenue.
                    </Text>
                  </View>
                </View>

                {/* Column Badges */}
                <View style={styles.colTagsContainer}>
                  <Text style={styles.colTagsLabel}>COLUMNS INCLUDED:</Text>
                  <View style={styles.colTagsRow}>
                    {[
                      'Date', 'Gross Revenue', 'Discount', 'Coupon Discount', 'Taxable Revenue',
                      'CGST', 'SGST', 'Delivery/Other Charges', 'Net Revenue', 'Total Orders'
                    ].map((col) => (
                      <View key={col} style={styles.colTag}><Text style={styles.colTagText}>{col}</Text></View>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.reportActionRow}>
                  <TouchableOpacity
                    testID="export-csv-daily_revenue"
                    style={[styles.exportBtn, styles.exportBtnCsv]}
                    onPress={() => handleExportReportCsv('daily_revenue')}
                    disabled={exportingReport === 'daily_revenue_csv'}
                  >
                    {exportingReport === 'daily_revenue_csv' ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Text style={styles.exportBtnCsvText}>📥 Download Excel / CSV</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="export-pdf-daily_revenue"
                    style={[styles.exportBtn, styles.exportBtnPdf]}
                    onPress={() => handleExportReportPdf('daily_revenue')}
                    disabled={exportingReport === 'daily_revenue_pdf'}
                  >
                    {exportingReport === 'daily_revenue_pdf' ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.exportBtnPdfText}>📄 Download PDF / Print</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Report 4: Monthly Revenue Report */}
              <View style={styles.reportCard}>
                <View style={styles.reportCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reportCardTitle}>4. Monthly Revenue Report</Text>
                      <View style={[styles.reportBadge, { backgroundColor: '#f3e8ff' }]}><Text style={[styles.reportBadgeText, { color: '#7c3aed' }]}>Monthly Rollup</Text></View>
                    </View>
                    <Text style={styles.reportCardDesc}>
                      Aggregated monthly breakdown (YYYY-MM) with total orders count, gross collections, taxable revenue, taxes, and net business earnings.
                    </Text>
                  </View>
                </View>

                {/* Column Badges */}
                <View style={styles.colTagsContainer}>
                  <Text style={styles.colTagsLabel}>COLUMNS INCLUDED:</Text>
                  <View style={styles.colTagsRow}>
                    {[
                      'Month (Date)', 'Total Orders', 'Gross Revenue', 'Discount', 'Coupon Discount',
                      'Taxable Revenue', 'CGST', 'SGST', 'Other Charges', 'Net Revenue'
                    ].map((col) => (
                      <View key={col} style={styles.colTag}><Text style={styles.colTagText}>{col}</Text></View>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.reportActionRow}>
                  <TouchableOpacity
                    testID="export-csv-monthly_revenue"
                    style={[styles.exportBtn, styles.exportBtnCsv]}
                    onPress={() => handleExportReportCsv('monthly_revenue')}
                    disabled={exportingReport === 'monthly_revenue_csv'}
                  >
                    {exportingReport === 'monthly_revenue_csv' ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Text style={styles.exportBtnCsvText}>📥 Download Excel / CSV</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="export-pdf-monthly_revenue"
                    style={[styles.exportBtn, styles.exportBtnPdf]}
                    onPress={() => handleExportReportPdf('monthly_revenue')}
                    disabled={exportingReport === 'monthly_revenue_pdf'}
                  >
                    {exportingReport === 'monthly_revenue_pdf' ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.exportBtnPdfText}>📄 Download PDF / Print</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Report 5: Custom Date Range Sales Report */}
              <View style={styles.reportCard}>
                <View style={styles.reportCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reportCardTitle}>5. Custom Date Range Sales Report</Text>
                      <View style={[styles.reportBadge, { backgroundColor: '#e0f2fe' }]}><Text style={[styles.reportBadgeText, { color: '#0369a1' }]}>Audit Log</Text></View>
                    </View>
                    <Text style={styles.reportCardDesc}>
                      Transaction-level sales ledger for any custom date span, maintaining complete historical invoice data and status tracking.
                    </Text>
                  </View>
                </View>

                {/* Column Badges */}
                <View style={styles.colTagsContainer}>
                  <Text style={styles.colTagsLabel}>COLUMNS INCLUDED:</Text>
                  <View style={styles.colTagsRow}>
                    {[
                      'Date', 'Order ID', 'Order Type', 'Subtotal', 'Discount',
                      'Coupon Discount', 'Taxable Amount', 'CGST', 'SGST', 'Other Charges',
                      'Grand Total', 'Status'
                    ].map((col) => (
                      <View key={col} style={styles.colTag}><Text style={styles.colTagText}>{col}</Text></View>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.reportActionRow}>
                  <TouchableOpacity
                    testID="export-csv-custom_sales"
                    style={[styles.exportBtn, styles.exportBtnCsv]}
                    onPress={() => handleExportReportCsv('custom_sales')}
                    disabled={exportingReport === 'custom_sales_csv'}
                  >
                    {exportingReport === 'custom_sales_csv' ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Text style={styles.exportBtnCsvText}>📥 Download Excel / CSV</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="export-pdf-custom_sales"
                    style={[styles.exportBtn, styles.exportBtnPdf]}
                    onPress={() => handleExportReportPdf('custom_sales')}
                    disabled={exportingReport === 'custom_sales_pdf'}
                  >
                    {exportingReport === 'custom_sales_pdf' ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.exportBtnPdfText}>📄 Download PDF / Print</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Report 6: GST / Tax Report */}
              <View style={[styles.reportCard, { borderColor: '#7c3aed', borderWidth: 1.5 }]}>
                <View style={styles.reportCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.reportCardTitle, { color: '#6d28d9' }]}>6. GST / Tax Sales Report</Text>
                      <View style={[styles.reportBadge, { backgroundColor: '#f3e8ff' }]}><Text style={[styles.reportBadgeText, { color: '#7c3aed' }]}>Tax & B2B Audit</Text></View>
                    </View>
                    <Text style={styles.reportCardDesc}>
                      Official GST and tax compliance report with invoice numbering, Customer GSTIN for B2B, Restaurant GSTIN, Taxable Base, CGST, SGST, IGST rate breakdowns, Total GST, and Payment Mode.
                    </Text>
                  </View>
                </View>

                {/* Column Badges */}
                <View style={styles.colTagsContainer}>
                  <Text style={styles.colTagsLabel}>COLUMNS INCLUDED (17 COLUMNS):</Text>
                  <View style={styles.colTagsRow}>
                    {[
                      'Invoice Date & Time', 'Invoice No.', 'Order ID', 'Order Type', 'Customer Name',
                      'Customer GSTIN', 'Restaurant GSTIN', 'Taxable Amount', 'GST Rate', 'CGST Rate',
                      'CGST Amount', 'SGST Rate', 'SGST Amount', 'IGST Rate', 'IGST Amount',
                      'Total GST', 'Invoice Grand Total', 'Payment Mode'
                    ].map((col) => (
                      <View key={col} style={[styles.colTag, { backgroundColor: '#ede9fe' }]}><Text style={[styles.colTagText, { color: '#5b21b6' }]}>{col}</Text></View>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.reportActionRow}>
                  <TouchableOpacity
                    testID="export-csv-gst_tax"
                    style={[styles.exportBtn, styles.exportBtnCsv, { borderColor: '#7c3aed' }]}
                    onPress={() => handleExportReportCsv('gst_tax')}
                    disabled={exportingReport === 'gst_tax_csv'}
                  >
                    {exportingReport === 'gst_tax_csv' ? (
                      <ActivityIndicator size="small" color="#16a34a" />
                    ) : (
                      <Text style={styles.exportBtnCsvText}>📥 Download Excel / CSV</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="export-pdf-gst_tax"
                    style={[styles.exportBtn, styles.exportBtnPdf, { backgroundColor: '#6d28d9' }]}
                    onPress={() => handleExportReportPdf('gst_tax')}
                    disabled={exportingReport === 'gst_tax_pdf'}
                  >
                    {exportingReport === 'gst_tax_pdf' ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={[styles.exportBtnPdfText, { color: '#ffffff' }]}>📄 Download PDF / Print</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
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
                placeholderTextColor="#64748b"
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
                placeholderTextColor="#64748b"
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
                placeholderTextColor="#64748b"
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
      {/* MODAL 2: CLOSE REGISTER & RECONCILIATION FLOW                             */}
      {/* ========================================================================= */}
      <Modal visible={showCloseModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔒 Close Register & Shift Reconciliation</Text>
              <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                <Text style={{ fontSize: 20, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Complete physical cash count and verify shift sales before generating the official Z-Report.
            </Text>

            {unsettledOrdersForClose.length > 0 && (
              <View
                style={{
                  backgroundColor: '#fee2e2',
                  borderWidth: 1.5,
                  borderColor: '#ef4444',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: '#b91c1c', fontWeight: '800', fontSize: 13, marginBottom: 4 }}>
                  ⚠️ Cannot Close Register: {unsettledOrdersForClose.length} Unsettled Order(s) Pending
                </Text>
                <Text style={{ color: '#7f1d1d', fontSize: 12, lineHeight: 16 }}>
                  Orders: {unsettledOrdersForClose.slice(0, 5).map((o) => `#${o.order_number}`).join(', ')}
                  {unsettledOrdersForClose.length > 5 ? ` and ${unsettledOrdersForClose.length - 5} more` : ''}.
                  All orders must be settled or cancelled before closing the shift.
                </Text>
                <TouchableOpacity
                  style={{
                    marginTop: 8,
                    backgroundColor: '#b91c1c',
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 6,
                    alignSelf: 'flex-start',
                  }}
                  onPress={() => {
                    setShowCloseModal(false);
                    router.push('/(admin)/orders' as any);
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                    ➡️ Go to Orders to Settle
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Complete Reconciliation Snapshot Grid */}
            <View style={styles.reconCard}>
              {/* 1. Opening Cash */}
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>1. Opening Cash:</Text>
                <Text style={styles.reconVal}>{formatCurrency(activeRegister?.opening_cash_float || 0)}</Text>
              </View>

              {/* 2. Cash Sales */}
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>2. Cash Sales:</Text>
                <Text style={[styles.reconVal, { color: '#16a34a', fontWeight: '800' }]}>
                  +{formatCurrency(liveReconciliation?.cash_sales || 0)}
                </Text>
              </View>

              {/* 3. Card Sales */}
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>3. Card Sales:</Text>
                <Text style={[styles.reconVal, { color: '#2563eb' }]}>
                  {formatCurrency(liveReconciliation?.card_sales || 0)}
                </Text>
              </View>

              {/* 4. UPI Sales */}
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>4. UPI Sales:</Text>
                <Text style={[styles.reconVal, { color: '#7c3aed' }]}>
                  {formatCurrency(liveReconciliation?.upi_sales || 0)}
                </Text>
              </View>

              {/* 5. Refunds */}
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>5. Refunds:</Text>
                <Text style={[styles.reconVal, { color: '#dc2626' }]}>
                  -{formatCurrency(liveReconciliation?.refunds || 0)}
                </Text>
              </View>

              {/* 6. Cash Out / Expenses */}
              <View style={styles.reconRow}>
                <Text style={styles.reconLabel}>6. Cash Out / Expenses:</Text>
                <Text style={[styles.reconVal, { color: '#d97706' }]}>
                  -{formatCurrency(liveReconciliation?.cash_out || 0)}
                </Text>
              </View>

              {/* 7. Expected Cash */}
              <View style={[styles.reconRow, { borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 6, marginTop: 4 }]}>
                <Text style={[styles.reconLabel, { fontWeight: '900', color: '#0f172a', fontSize: 13 }]}>
                  7. Expected Cash:
                </Text>
                <Text style={[styles.reconVal, { fontWeight: '900', color: '#0f172a', fontSize: 15 }]}>
                  {formatCurrency(liveReconciliation?.expected_cash || 0)}
                </Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Staff / Manager Closing Shift</Text>
              <TextInput
                style={styles.formInput}
                value={closeStaffName}
                onChangeText={setCloseStaffName}
                placeholder="e.g. Admin / Cashier"
                placeholderTextColor="#64748b"
              />
            </View>

            {/* 8. Actual Cash Counted Input */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { fontWeight: '800', color: '#0f172a' }]}>
                8. Actual Cash Counted (₹)
              </Text>
              <TextInput
                testID="close-register-actual-cash"
                style={[styles.formInput, { borderColor: '#2563eb', borderWidth: 1.5, backgroundColor: '#ffffff' }]}
                value={countedCashInput}
                onChangeText={setCountedCashInput}
                keyboardType="numeric"
                placeholder="Enter physical cash counted in drawer"
                placeholderTextColor="#64748b"
              />
            </View>

            {/* 9. Difference (Discrepancy) */}
            {(() => {
              const counted = parseFloat(countedCashInput) || 0;
              const expected = liveReconciliation?.expected_cash || 0;
              const diff = Math.round((counted - expected) * 100) / 100;

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
                      ? '9. Difference: ₹0.00 (Balanced Perfectly ✓)'
                      : diff > 0
                      ? `9. Difference: +${formatCurrency(diff)} (Cash Over / Excess)`
                      : `9. Difference: -${formatCurrency(Math.abs(diff))} (Cash Shortage)`}
                  </Text>
                </View>
              );
            })()}

            {/* 10. Notes */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>10. Notes / Handover Details</Text>
              <TextInput
                style={styles.formInput}
                value={closeNotes}
                onChangeText={setCloseNotes}
                placeholder="e.g. Handed over to night manager / cash audited"
                placeholderTextColor="#64748b"
              />
            </View>

            {/* 11. Confirm & Close Register Button */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCloseModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-close-register-btn"
                style={[
                  styles.submitBtn,
                  { backgroundColor: '#dc2626' },
                  (submittingClose || unsettledOrdersForClose.length > 0) && { opacity: 0.5 },
                ]}
                onPress={handleCloseRegisterSubmit}
                disabled={submittingClose || unsettledOrdersForClose.length > 0}
              >
                {submittingClose ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {unsettledOrdersForClose.length > 0 ? '⚠️ Settle All Orders First' : 'Confirm & Close Register'}
                  </Text>
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
                onPress={async () => {
                  if (viewingZReport) {
                    try {
                      await printService.printZReportA4(
                        viewingZReport,
                        settings || undefined,
                        activeRestaurant?.name,
                        activeRestaurant?.address
                      );
                    } catch (e: any) {
                      Alert.alert('Print Error', e?.message || 'Failed to print Z-Report');
                    }
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
    </View>
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

  // Simplified Compact Register Section Styles
  compactRegisterCard: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactRegisterCardClosed: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactRegisterCardMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  compactRegisterLeft: {
    justifyContent: 'center',
  },
  compactRegisterTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  compactRegisterTimer: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  compactRegisterClosedTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  compactRegisterClosedSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  compactCloseBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCloseBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  compactOpenBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactOpenBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },

  // Legacy Banner helpers (retained if referenced)
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
    color: '#0f172a',
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
    color: '#0f172a',
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
    color: '#0f172a',
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
  
  // Reports & Tax Center
  reportCardsContainer: { gap: 12, marginTop: 4 },
  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reportCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reportCardTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  reportCardDesc: { fontSize: 11, color: '#475569', marginTop: 3, lineHeight: 16 },
  reportBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reportBadgeText: { fontSize: 9, fontWeight: '800', color: '#16a34a', textTransform: 'uppercase' },
  colTagsContainer: {
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  colTagsLabel: { fontSize: 8.5, fontWeight: '800', color: '#64748b', marginBottom: 4, letterSpacing: 0.5 },
  colTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  colTag: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  colTagText: { fontSize: 9.5, fontWeight: '600', color: '#334155' },
  reportActionRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
  },
  exportBtnCsv: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  exportBtnCsvText: { color: '#16a34a', fontWeight: '800', fontSize: 11 },
  exportBtnPdf: {
    backgroundColor: '#2563eb',
  },
  exportBtnPdfText: { color: '#ffffff', fontWeight: '800', fontSize: 11 },
});
