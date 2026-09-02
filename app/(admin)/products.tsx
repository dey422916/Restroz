import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { productService } from '../../src/services/api/productService';
import { categoryService } from '../../src/services/api/categoryService';
import { storageService } from '../../src/services/api/storageService';
import { useAuth } from '../../src/context/AuthContext';
import { Product, Category, FoodType } from '../../src/types';
import { formatCurrency } from '../../src/utils/currency';
import { DEFAULT_RESTAURANT_ID } from '../../src/services/api/restaurantService';

export default function ProductsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeRestaurantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'outofstock' | 'inactive'>('all');

  // Add / Edit Modal
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [savingProduct, setSavingProduct] = useState<boolean>(false);

  // Quick Stock Adjustment Modal
  const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
  const [quickStockInput, setQuickStockInput] = useState<string>('0');
  const [savingStock, setSavingStock] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Product Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formSku, setFormSku] = useState<string>('');
  const [formCatId, setFormCatId] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formDiscountedPrice, setFormDiscountedPrice] = useState<string>('');
  const [formStock, setFormStock] = useState<string>('100');
  const [formFoodType, setFormFoodType] = useState<FoodType>('veg');
  const [formUnit, setFormUnit] = useState<string>('portion');
  const [formTaxRate, setFormTaxRate] = useState<string>('5');
  const [formHsn, setFormHsn] = useState<string>('996331');
  const [formPrepTime, setFormPrepTime] = useState<string>('15');
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formIsAvailable, setFormIsAvailable] = useState<boolean>(true);

  const { height: windowHeight } = useWindowDimensions();

  const loadData = async () => {
    try {
      setLoading(true);
      const targetRestId = activeRestaurantId || DEFAULT_RESTAURANT_ID;
      const [prods, cats] = await Promise.all([
        productService.getProducts(targetRestId),
        categoryService.getCategories(targetRestId),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRestaurantId]);

  const resetForm = () => {
    setEditingProduct(null);
    setFormName('');
    setFormSku('');
    setFormCatId(categories[0]?.id || '');
    setFormPrice('250');
    setFormDiscountedPrice('');
    setFormStock('50');
    setFormFoodType('veg');
    setFormUnit('portion');
    setFormTaxRate('5');
    setFormHsn('996331');
    setFormPrepTime('15');
    setFormImageUrl('');
    setFormDesc('');
    setFormIsActive(true);
    setFormIsAvailable(true);
    setModalError(null);
  };

  const openAddModal = () => {
    resetForm();
    setFormSku(`SKU-${Date.now().toString().slice(-6)}`);
    setShowProductModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormCatId(p.category_id || categories[0]?.id || '');
    setFormPrice(String(p.price));
    setFormDiscountedPrice(p.discounted_price ? String(p.discounted_price) : '');
    setFormStock(String(p.stock_quantity));
    setFormFoodType(p.food_type);
    setFormUnit(p.unit || 'portion');
    setFormTaxRate(String(p.tax_rate || 5));
    setFormHsn(p.hsn_code || '996331');
    setFormPrepTime(String(p.preparation_time_mins || 15));
    setFormImageUrl(p.image_url || '');
    setFormDesc(p.description || '');
    setFormIsActive(p.is_active);
    setFormIsAvailable(p.is_available);
    setModalError(null);
    setShowProductModal(true);
  };

  const handlePickImage = async () => {
    setUploadingImage(true);
    try {
      const res = await storageService.pickAndUploadProductImage();
      if (res && res.url) {
        setFormImageUrl(res.url);
        Alert.alert('Photo Selected', 'Product image uploaded and attached.');
      }
    } catch (err: any) {
      Alert.alert('Image Error', err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setModalError('Please enter a valid Product Name.');
      return;
    }
    const trimmedSku = formSku.trim().toUpperCase();
    if (!trimmedSku) {
      setModalError('Please enter a valid SKU code.');
      return;
    }
    const priceNum = parseFloat(formPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setModalError('Product price must be a valid number greater than 0.');
      return;
    }
    const stockNum = parseInt(formStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setModalError('Stock quantity cannot be negative.');
      return;
    }
    const effectiveCatId = formCatId || categories[0]?.id;
    if (!effectiveCatId) {
      setModalError('Please select a valid Category for this dish.');
      return;
    }

    setModalError(null);
    setSavingProduct(true);
    const targetRestId = activeRestaurantId || DEFAULT_RESTAURANT_ID;

    try {
      console.log('Submitting product to Supabase for restaurant:', targetRestId, {
        name: trimmedName,
        sku: trimmedSku,
        categoryId: formCatId,
        price: priceNum,
      });

      const saved = await productService.saveProduct({
        id: editingProduct?.id,
        restaurant_id: targetRestId,
        name: trimmedName,
        sku: trimmedSku,
        category_id: effectiveCatId,
        price: priceNum,
        discounted_price: formDiscountedPrice ? parseFloat(formDiscountedPrice) : undefined,
        stock_quantity: stockNum,
        food_type: formFoodType,
        unit: formUnit.trim() || 'portion',
        tax_rate: parseFloat(formTaxRate) || 5,
        hsn_code: formHsn.trim() || '996331',
        preparation_time_mins: parseInt(formPrepTime, 10) || 15,
        image_url: formImageUrl.trim() || undefined,
        description: formDesc.trim(),
        is_active: formIsActive,
        is_available: formIsAvailable && stockNum > 0,
      }, targetRestId);

      console.log('✅ Product saved in Supabase successfully:', saved.id, saved.name, saved.restaurant_id);

      // Close modal and reset form
      setShowProductModal(false);
      resetForm();

      // Clear any search & category filter so the newly added product is visible immediately
      setSearch('');
      setSelectedCatId(null);
      setStockFilter('all');

      // Re-fetch products from Supabase immediately
      await loadData();

      Alert.alert(
        'Success',
        editingProduct ? `Updated "${trimmedName}" successfully.` : `Added "${trimmedName}" to catalog.`
      );
    } catch (err: any) {
      console.error('Failed to save product:', err);
      setModalError(err.message || 'Failed to save product in database.');
      Alert.alert('Save Failed', err.message || 'Failed to save product in database.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = (p: Product) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to remove "${p.name}" (${p.sku}) from the catalog?\n\nNote: If this dish was ordered in historical invoices, it will be safely deactivated to preserve past audit reports.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete / Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              const targetRestId = activeRestaurantId || DEFAULT_RESTAURANT_ID;
              const res = await productService.deleteProduct(p.id, targetRestId);
              if (res.deactivated) {
                Alert.alert('Deactivated', `"${p.name}" is referenced in past orders and was safely deactivated.`);
              } else {
                Alert.alert('Deleted', `"${p.name}" was permanently removed.`);
              }
              await loadData();
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message);
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (p: Product) => {
    try {
      const targetRestId = activeRestaurantId || DEFAULT_RESTAURANT_ID;
      await productService.toggleProductActive(p.id, !p.is_active, targetRestId);
      await loadData();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    }
  };

  const openStockModal = (p: Product) => {
    setStockModalProduct(p);
    setQuickStockInput(String(p.stock_quantity));
  };

  const handleSaveStock = async () => {
    if (!stockModalProduct) return;
    const newQty = parseInt(quickStockInput, 10);
    if (isNaN(newQty) || newQty < 0) {
      Alert.alert('Invalid Stock', 'Stock quantity must be a non-negative number (0 or higher).');
      return;
    }

    setSavingStock(true);
    try {
      const targetRestId = activeRestaurantId || DEFAULT_RESTAURANT_ID;
      await productService.updateStock(stockModalProduct.id, newQty, targetRestId);
      Alert.alert('Stock Updated', `Stock for "${stockModalProduct.name}" set to ${newQty}.`);
      setStockModalProduct(null);
      await loadData();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    } finally {
      setSavingStock(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (selectedCatId && p.category_id !== selectedCatId) return false;
    if (stockFilter === 'instock' && (p.stock_quantity <= 0 || !p.is_active)) return false;
    if (stockFilter === 'outofstock' && p.stock_quantity > 0) return false;
    if (stockFilter === 'inactive' && p.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.title}>Product Catalog ({products.length})</Text>
          <Text style={styles.subtitle}>Manage dishes, pricing, inventory stock, and food categories</Text>
        </View>

        {/* Primary Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.addMainBtn} onPress={openAddModal} testID="add-product-btn">
            <Text style={styles.addMainBtnText}>+ ADD PRODUCT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.csvBtn}
            onPress={() => router.push('/(admin)/bulk-import' as any)}
          >
            <Text style={styles.csvBtnText}>📂 CSV IMPORT</Text>
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <TextInput
          style={styles.search}
          placeholder="Search products by dish name or SKU..."
          value={search}
          onChangeText={setSearch}
        />

        {/* Stock Status Filter Tabs */}
        <View style={styles.filterRow}>
          {(
            [
              { id: 'all', label: 'All Items' },
              { id: 'instock', label: '🟢 In Stock' },
              { id: 'outofstock', label: '🔴 Out of Stock' },
              { id: 'inactive', label: '⏸️ Inactive' },
            ] as const
          ).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, stockFilter === f.id && styles.filterChipActive]}
              onPress={() => setStockFilter(f.id)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  stockFilter === f.id && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Categories Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={styles.catScrollContent}
        >
          <TouchableOpacity
            style={[styles.catPill, selectedCatId === null && styles.catPillActive]}
            onPress={() => setSelectedCatId(null)}
          >
            <Text
              style={[
                styles.catPillText,
                selectedCatId === null && styles.catPillTextActive,
              ]}
            >
              All Categories ({products.length})
            </Text>
          </TouchableOpacity>

          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.catPill, selectedCatId === c.id && styles.catPillActive]}
              onPress={() => setSelectedCatId(c.id)}
            >
              <Text
                style={[
                  styles.catPillText,
                  selectedCatId === c.id && styles.catPillTextActive,
                ]}
              >
                {c.name} ({products.filter((p) => p.category_id === c.id).length})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Product List Content */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading menu catalog from Supabase...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={true}
        >
          {filteredProducts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 36 }}>🍲</Text>
              <Text style={styles.emptyTitle}>No Products Found</Text>
              <Text style={styles.emptySub}>
                {search
                  ? 'No items matched your search query.'
                  : 'Tap "+ ADD NEW PRODUCT" to add your first menu item.'}
              </Text>
            </View>
          ) : (
            filteredProducts.map((prod) => {
              const isOutOfStock = prod.stock_quantity <= 0;
              const isVeg = prod.food_type === 'veg';
              const isDrink =
                prod.sku.startsWith('BEV') ||
                prod.sku.startsWith('CSR') ||
                prod.sku.startsWith('KPL') ||
                prod.name.toLowerCase().includes('wine') ||
                prod.name.toLowerCase().includes('beer') ||
                prod.name.toLowerCase().includes('lassi');

              return (
                <View
                  key={prod.id}
                  style={[
                    styles.card,
                    (!prod.is_active || isOutOfStock) && styles.cardDimmed,
                  ]}
                >
                  {/* Image & Indicators */}
                  <View style={styles.imgContainer}>
                    <Image
                      source={{
                        uri:
                          prod.image_url ||
                          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
                      }}
                      style={styles.img}
                      resizeMode="cover"
                    />

                    {/* Food Type Indicator Badge */}
                    <View style={styles.badgeContainer}>
                      {isDrink ? (
                        <Text style={{ fontSize: 11 }}>
                          {prod.name.toLowerCase().includes('wine')
                            ? '🍷'
                            : prod.name.toLowerCase().includes('beer')
                            ? '🍺'
                            : '🥤'}
                        </Text>
                      ) : (
                        <View
                          style={[
                            styles.vegSquareBadge,
                            { borderColor: isVeg ? '#16a34a' : '#dc2626' },
                          ]}
                        >
                          <View
                            style={[
                              styles.vegCircleDot,
                              { backgroundColor: isVeg ? '#16a34a' : '#dc2626' },
                            ]}
                          />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Body Content */}
                  <View style={styles.bodyDetails}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.skuText}>SKU: {prod.sku}</Text>
                      <View
                        style={[
                          styles.stockPill,
                          isOutOfStock
                            ? styles.stockPillOut
                            : prod.stock_quantity < 10
                            ? styles.stockPillLow
                            : styles.stockPillGood,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stockPillText,
                            isOutOfStock
                              ? styles.stockPillTextOut
                              : prod.stock_quantity < 10
                              ? styles.stockPillTextLow
                              : styles.stockPillTextGood,
                          ]}
                        >
                          {isOutOfStock
                            ? 'OUT OF STOCK'
                            : `${prod.stock_quantity} in stock`}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.name} numberOfLines={2}>
                      {prod.name}
                    </Text>

                    <Text style={styles.categoryMeta}>
                      📁 {prod.category_name || 'General'} • {prod.unit || 'portion'} • Tax: {prod.tax_rate}%
                    </Text>

                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{formatCurrency(prod.price)}</Text>
                      {prod.discounted_price && (
                        <Text style={styles.discPrice}>
                          {formatCurrency(prod.discounted_price)}
                        </Text>
                      )}
                      {!prod.is_active && (
                        <View style={styles.inactiveTag}>
                          <Text style={styles.inactiveTagText}>INACTIVE</Text>
                        </View>
                      )}
                    </View>

                    {/* Action Buttons Row */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => openEditModal(prod)}
                        testID="edit-product-btn"
                      >
                        <Text style={styles.editBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.stockAdjBtn}
                        onPress={() => openStockModal(prod)}
                      >
                        <Text style={styles.stockAdjBtnText}>📦 Stock</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.toggleBtn}
                        onPress={() => handleToggleActive(prod)}
                      >
                        <Text style={styles.toggleBtnText}>
                          {prod.is_active ? 'Deactivate' : 'Activate'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteProduct(prod)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ============================================================ */}
      {/* 1. ADD / EDIT PRODUCT FULL MODAL                             */}
      {/* ============================================================ */}
      <Modal visible={showProductModal} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
              paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 8,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {editingProduct ? `Edit "${editingProduct.name}"` : 'Add New Product'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowProductModal(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={[
                  styles.modalScroll,
                  Platform.OS === 'web' && ({ overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as any),
                ]}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                {/* Modal Error Banner */}
                {modalError && (
                  <View style={styles.modalErrorBanner}>
                    <Text style={styles.modalErrorIcon}>⚠️</Text>
                    <Text style={styles.modalErrorText}>{modalError}</Text>
                  </View>
                )}

                {/* Image Upload / Preview Area */}
                <View style={styles.imageUploadSection}>
                  {formImageUrl ? (
                    <Image source={{ uri: formImageUrl }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.placeholderImgBox}>
                      <Text style={{ fontSize: 28 }}>📷</Text>
                      <Text style={styles.placeholderImgText}>No Photo Selected</Text>
                    </View>
                  )}

                  <View style={{ flex: 1, gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.uploadPhotoBtn, uploadingImage && styles.btnDisabled]}
                      onPress={handlePickImage}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Text style={styles.uploadPhotoBtnText}>📸 Choose Device Photo</Text>
                      )}
                    </TouchableOpacity>

                    <TextInput
                      style={styles.imageUrlInput}
                      placeholder="Or enter direct image URL..."
                      value={formImageUrl}
                      onChangeText={setFormImageUrl}
                    />
                  </View>
                </View>

                {/* Product Name */}
                <Text style={styles.fieldLabel}>Product Name *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Special Chicken Biryani"
                  value={formName}
                  onChangeText={setFormName}
                  testID="product-form-name-input"
                />

                {/* SKU Code */}
                <Text style={styles.fieldLabel}>SKU Code * (Unique Identifier)</Text>
                <TextInput
                  style={[styles.fieldInput, { textTransform: 'uppercase' } as any]}
                  placeholder="e.g. CB-9R9MOX"
                  value={formSku}
                  onChangeText={setFormSku}
                  testID="product-form-sku-input"
                />

                {/* Category Selector */}
                <Text style={styles.fieldLabel}>Category *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {categories.map((c, idx) => {
                    const isSelected = formCatId ? formCatId === c.id : idx === 0;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.catChoicePill,
                          isSelected && styles.catChoicePillActive,
                        ]}
                        onPress={() => setFormCatId(c.id)}
                      >
                        <Text
                          style={[
                            styles.catChoicePillText,
                            isSelected && styles.catChoicePillTextActive,
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Food Type Selector */}
                <Text style={styles.fieldLabel}>Food Type *</Text>
                <View style={styles.foodTypeRow}>
                  {(
                    [
                      { type: 'veg', label: '🟢 Veg' },
                      { type: 'non-veg', label: '🔴 Non-Veg' },
                      { type: 'egg', label: '🟡 Egg' },
                    ] as const
                  ).map((ft) => (
                    <TouchableOpacity
                      key={ft.type}
                      style={[
                        styles.foodTypeBtn,
                        formFoodType === ft.type && styles.foodTypeBtnActive,
                      ]}
                      onPress={() => setFormFoodType(ft.type)}
                    >
                      <Text
                        style={[
                          styles.foodTypeBtnText,
                          formFoodType === ft.type && styles.foodTypeBtnTextActive,
                        ]}
                      >
                        {ft.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Price and Discounted Price Row */}
                <View style={styles.dualFieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Selling Price (₹) *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="250"
                      keyboardType="numeric"
                      value={formPrice}
                      onChangeText={setFormPrice}
                      testID="product-form-price-input"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Discounted Price (₹)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Optional"
                      keyboardType="numeric"
                      value={formDiscountedPrice}
                      onChangeText={setFormDiscountedPrice}
                    />
                  </View>
                </View>

                {/* Stock and Unit Row */}
                <View style={styles.dualFieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Stock Quantity *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="50"
                      keyboardType="numeric"
                      value={formStock}
                      onChangeText={setFormStock}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Serving Unit *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="portion / plate / bottle"
                      value={formUnit}
                      onChangeText={setFormUnit}
                    />
                  </View>
                </View>

                {/* Tax Rate & HSN Code Row */}
                <View style={styles.dualFieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>GST Tax Rate (%)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="5"
                      keyboardType="numeric"
                      value={formTaxRate}
                      onChangeText={setFormTaxRate}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>HSN / SAC Code</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="996331"
                      value={formHsn}
                      onChangeText={setFormHsn}
                    />
                  </View>
                </View>

                {/* Preparation Time */}
                <Text style={styles.fieldLabel}>Preparation Time (Minutes)</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="15"
                  keyboardType="numeric"
                  value={formPrepTime}
                  onChangeText={setFormPrepTime}
                />

                {/* Description */}
                <Text style={styles.fieldLabel}>Description (Optional)</Text>
                <TextInput
                  style={[styles.fieldInput, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Describe ingredients, flavor profile, and spice level..."
                  multiline
                  numberOfLines={3}
                  value={formDesc}
                  onChangeText={setFormDesc}
                />

                {/* Active Checkbox */}
                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => setFormIsActive(!formIsActive)}
                >
                  <View style={[styles.checkbox, formIsActive && styles.checkboxChecked]}>
                    {formIsActive && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkText}>Active Product (Show on POS & Customer Menu)</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Docked Modal Action Footer - Always visible on mobile & web */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.saveMainBtn, savingProduct && styles.btnDisabled]}
                  onPress={handleSaveProduct}
                  disabled={savingProduct}
                  activeOpacity={0.85}
                  testID="save-product-modal-btn"
                >
                  {savingProduct ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveMainBtnText}>
                      {editingProduct ? 'SAVE PRODUCT CHANGES' : 'CREATE PRODUCT IN DATABASE'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 2. QUICK STOCK ADJUSTMENT MODAL                              */}
      {/* ============================================================ */}
      {stockModalProduct && (
        <Modal visible={Boolean(stockModalProduct)} transparent animationType="fade">
          <View style={[styles.modalOverlay, { paddingHorizontal: 20 }]}>
            <View style={styles.stockModalContent}>
              <Text style={styles.stockModalTitle}>Update Stock Level</Text>
              <Text style={styles.stockModalSub}>{stockModalProduct.name}</Text>

              <Text style={styles.fieldLabel}>Current Stock Units:</Text>
              <TextInput
                style={[styles.fieldInput, { fontSize: 18, textAlign: 'center' }]}
                keyboardType="numeric"
                value={quickStockInput}
                onChangeText={setQuickStockInput}
              />

              <View style={styles.quickStepRow}>
                {[-10, -1, +1, +5, +10, +25].map((delta) => (
                  <TouchableOpacity
                    key={delta}
                    style={styles.quickStepBtn}
                    onPress={() => {
                      const cur = parseInt(quickStockInput, 10) || 0;
                      setQuickStockInput(String(Math.max(0, cur + delta)));
                    }}
                  >
                    <Text style={styles.quickStepBtnText}>
                      {delta > 0 ? `+${delta}` : delta}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setStockModalProduct(null)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalConfirmBtn, savingStock && styles.btnDisabled]}
                  onPress={handleSaveStock}
                  disabled={savingStock}
                >
                  {savingStock ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmBtnText}>SAVE STOCK</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  headerTitleBox: {
    marginBottom: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  addMainBtn: {
    flex: 1.6,
    minHeight: 40,
    backgroundColor: '#16a34a',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMainBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  csvBtn: {
    flex: 1,
    minHeight: 40,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  csvBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  search: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  catScroll: {
    maxHeight: 38,
  },
  catScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  catPillActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  catPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  catPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  list: {
    padding: 14,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardDimmed: {
    opacity: 0.7,
    backgroundColor: '#f8fafc',
  },
  imgContainer: {
    width: 85,
    height: 85,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#ffffff',
    padding: 2.5,
    borderRadius: 4,
    elevation: 2,
  },
  vegSquareBadge: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  vegCircleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  bodyDetails: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skuText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  stockPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockPillGood: {
    backgroundColor: '#dcfce7',
  },
  stockPillLow: {
    backgroundColor: '#fef3c7',
  },
  stockPillOut: {
    backgroundColor: '#fee2e2',
  },
  stockPillText: {
    fontSize: 9,
    fontWeight: '900',
  },
  stockPillTextGood: {
    color: '#15803d',
  },
  stockPillTextLow: {
    color: '#b45309',
  },
  stockPillTextOut: {
    color: '#b91c1c',
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 2,
  },
  categoryMeta: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  price: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2563eb',
  },
  discPrice: {
    fontSize: 12,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  inactiveTag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inactiveTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  editBtn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  editBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  stockAdjBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  stockAdjBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  deleteBtn: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  deleteBtnText: {
    fontSize: 11,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 4,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 16 : 8,
  },
  keyboardAvoidingView: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '92%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 10,
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  modalScroll: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  modalScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    flexGrow: 1,
  },
  modalFooter: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  },
  modalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  modalErrorIcon: {
    fontSize: 16,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: '600',
    flex: 1,
  },
  imageUploadSection: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  previewImage: {
    width: 75,
    height: 75,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  placeholderImgBox: {
    width: 75,
    height: 75,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderImgText: {
    fontSize: 8,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  uploadPhotoBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadPhotoBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  imageUrlInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
    marginTop: 6,
  },
  fieldInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  catChoicePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 6,
  },
  catChoicePillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  catChoicePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  catChoicePillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  foodTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  foodTypeBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  foodTypeBtnActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  foodTypeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  foodTypeBtnTextActive: {
    color: '#ffffff',
  },
  dualFieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  checkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  saveMainBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveMainBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
  },

  // Stock Modal Styles
  stockModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 8,
  },
  stockModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  stockModalSub: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '700',
    marginBottom: 10,
  },
  quickStepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  quickStepBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  quickStepBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});
