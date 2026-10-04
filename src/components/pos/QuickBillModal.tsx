import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Category, Product, RestaurantSettings } from '../../types';
import { formatCurrency, roundToTwoDecimals } from '../../utils/currency';
import { productService } from '../../services/api/productService';
import { subscriptionGuardService } from '../../services/api/subscriptionGuardService';

export const QUICK_BILL_DRAFT_KEY_PREFIX = 'restroz_quick_bill_draft_';

export interface QuickBillDraftData {
  name: string;
  priceInput: string;
  quantity: number;
  taxRate: number;
  customTaxInput: string;
  isCustomTax: boolean;
  taxMode: 'exclusive' | 'inclusive';
  selectedCategoryId: string;
  saveToMenu: boolean;
  itemNotes: string;
  restaurantId: string;
}

export const loadQuickBillDraft = (restaurantId?: string): QuickBillDraftData | null => {
  if (Platform.OS !== 'web' || !restaurantId || typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(`${QUICK_BILL_DRAFT_KEY_PREFIX}${restaurantId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as QuickBillDraftData;
      if (parsed && parsed.restaurantId === restaurantId) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[QuickBillModal] Error reading sessionStorage draft:', err);
  }
  return null;
};

export const saveQuickBillDraft = (
  restaurantId: string | undefined,
  draft: Omit<QuickBillDraftData, 'restaurantId'>
) => {
  if (Platform.OS !== 'web' || !restaurantId || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      `${QUICK_BILL_DRAFT_KEY_PREFIX}${restaurantId}`,
      JSON.stringify({ ...draft, restaurantId })
    );
  } catch (err) {
    console.warn('[QuickBillModal] Error saving sessionStorage draft:', err);
  }
};

export const clearQuickBillDraft = (restaurantId?: string) => {
  if (Platform.OS !== 'web' || !restaurantId || typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(`${QUICK_BILL_DRAFT_KEY_PREFIX}${restaurantId}`);
  } catch (err) {
    console.warn('[QuickBillModal] Error clearing sessionStorage draft:', err);
  }
};

interface QuickBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  activeRestaurantId?: string;
  settings?: RestaurantSettings;
  canManageProducts?: boolean;
  onAddToCart: (params: {
    name: string;
    price: number;
    quantity: number;
    taxRate: number;
    categoryId: string;
    categoryName?: string;
    isTaxInclusive?: boolean;
    notes?: string;
    savedProduct?: Product;
  }) => void;
  onProductCreated?: (newProduct: Product) => void;
}

const COMMON_GST_RATES = [0, 5, 12, 18, 28];

export const QuickBillModal: React.FC<QuickBillModalProps> = ({
  isOpen,
  onClose,
  categories = [],
  activeRestaurantId,
  settings,
  canManageProducts = false,
  onAddToCart,
  onProductCreated,
}) => {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  // Form State
  const [name, setName] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [customTaxInput, setCustomTaxInput] = useState<string>('');
  const [isCustomTax, setIsCustomTax] = useState<boolean>(false);
  const [taxMode, setTaxMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [saveToMenu, setSaveToMenu] = useState<boolean>(false);
  const [itemNotes, setItemNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const prevIsOpenRef = useRef<boolean>(false);
  const currentRestaurantRef = useRef<string | undefined>(activeRestaurantId);

  // Helper to persist current form values to session draft
  const persistDraft = (updates?: Partial<QuickBillDraftData>) => {
    if (!activeRestaurantId) return;
    const draft: Omit<QuickBillDraftData, 'restaurantId'> = {
      name: updates?.name !== undefined ? updates.name : name,
      priceInput: updates?.priceInput !== undefined ? updates.priceInput : priceInput,
      quantity: updates?.quantity !== undefined ? updates.quantity : quantity,
      taxRate: updates?.taxRate !== undefined ? updates.taxRate : taxRate,
      customTaxInput: updates?.customTaxInput !== undefined ? updates.customTaxInput : customTaxInput,
      isCustomTax: updates?.isCustomTax !== undefined ? updates.isCustomTax : isCustomTax,
      taxMode: updates?.taxMode !== undefined ? updates.taxMode : taxMode,
      selectedCategoryId: updates?.selectedCategoryId !== undefined ? updates.selectedCategoryId : selectedCategoryId,
      saveToMenu: updates?.saveToMenu !== undefined ? updates.saveToMenu : saveToMenu,
      itemNotes: updates?.itemNotes !== undefined ? updates.itemNotes : itemNotes,
    };
    saveQuickBillDraft(activeRestaurantId, draft);
  };

  // Reset local state fields
  const resetFormFields = () => {
    const defaultTax = settings?.is_gst_enabled && Number(settings.default_tax_rate || 0) > 0
      ? Number(settings.default_tax_rate)
      : 0;

    setName('');
    setPriceInput('');
    setQuantity(1);
    setTaxRate(defaultTax);
    setCustomTaxInput('');
    setIsCustomTax(!COMMON_GST_RATES.includes(defaultTax));
    setTaxMode('exclusive');
    setSelectedCategoryId(categories.length > 0 ? categories[0].id : '');
    setSaveToMenu(false);
    setItemNotes('');
    setErrorMessage('');
  };

  // Load draft or initialize ONLY on modal open transition (false -> true) or restaurant change
  useEffect(() => {
    const isOpening = !prevIsOpenRef.current && isOpen;
    const restaurantChanged = currentRestaurantRef.current !== activeRestaurantId;

    if (restaurantChanged) {
      currentRestaurantRef.current = activeRestaurantId;
    }

    if (isOpen && (isOpening || restaurantChanged)) {
      const existingDraft = loadQuickBillDraft(activeRestaurantId);

      if (existingDraft) {
        setName(existingDraft.name || '');
        setPriceInput(existingDraft.priceInput || '');
        setQuantity(existingDraft.quantity || 1);
        setTaxRate(existingDraft.taxRate ?? 0);
        setCustomTaxInput(existingDraft.customTaxInput || '');
        setIsCustomTax(Boolean(existingDraft.isCustomTax));
        setTaxMode(existingDraft.taxMode || 'exclusive');
        setSelectedCategoryId(
          existingDraft.selectedCategoryId || (categories.length > 0 ? categories[0].id : '')
        );
        setSaveToMenu(Boolean(existingDraft.saveToMenu));
        setItemNotes(existingDraft.itemNotes || '');
        setErrorMessage('');
      } else if (isOpening) {
        resetFormFields();
      }
    }

    prevIsOpenRef.current = isOpen;
  }, [isOpen, activeRestaurantId]);

  // Fallback category assignment if categories load after modal was opened with empty categories
  useEffect(() => {
    if (isOpen && !selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
      persistDraft({ selectedCategoryId: categories[0].id });
    }
  }, [isOpen, categories, selectedCategoryId]);

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCategoryId) || null;
  }, [categories, selectedCategoryId]);

  // Derived calculations
  const numericPrice = parseFloat(priceInput) || 0;
  const effectiveTaxRate = isCustomTax ? (parseFloat(customTaxInput) || 0) : taxRate;

  const { baseUnitPrice, itemTaxAmount, itemTotal, lineSubtotal, lineTaxTotal, lineGrandTotal } = useMemo(() => {
    if (numericPrice <= 0) {
      return {
        baseUnitPrice: 0,
        itemTaxAmount: 0,
        itemTotal: 0,
        lineSubtotal: 0,
        lineTaxTotal: 0,
        lineGrandTotal: 0,
      };
    }

    let basePrice = numericPrice;
    if (taxMode === 'inclusive' && effectiveTaxRate > 0) {
      basePrice = roundToTwoDecimals(numericPrice / (1 + effectiveTaxRate / 100));
    }

    const itemTax = roundToTwoDecimals((basePrice * effectiveTaxRate) / 100);
    const singleTotal = taxMode === 'inclusive' ? numericPrice : roundToTwoDecimals(basePrice + itemTax);

    const sub = roundToTwoDecimals(basePrice * quantity);
    const taxTot = roundToTwoDecimals((sub * effectiveTaxRate) / 100);
    const grand = taxMode === 'inclusive'
      ? roundToTwoDecimals(numericPrice * quantity)
      : roundToTwoDecimals(sub + taxTot);

    return {
      baseUnitPrice: basePrice,
      itemTaxAmount: itemTax,
      itemTotal: singleTotal,
      lineSubtotal: sub,
      lineTaxTotal: taxTot,
      lineGrandTotal: grand,
    };
  }, [numericPrice, effectiveTaxRate, taxMode, quantity]);

  const handleSelectGstRate = (rate: number) => {
    setIsCustomTax(false);
    setTaxRate(rate);
    setCustomTaxInput('');
    persistDraft({ taxRate: rate, isCustomTax: false, customTaxInput: '' });
  };

  const handleCustomTaxChange = (text: string) => {
    const clean = text.replace(/[^0-9.]/g, '');
    setCustomTaxInput(clean);
    setIsCustomTax(true);
    persistDraft({ customTaxInput: clean, isCustomTax: true });
  };

  const handleQuantityStep = (delta: number) => {
    const newQty = Math.max(1, quantity + delta);
    setQuantity(newQty);
    persistDraft({ quantity: newQty });
  };

  const handleCancelAndDiscard = () => {
    clearQuickBillDraft(activeRestaurantId);
    resetFormFields();
    onClose();
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a product or item name.');
      return;
    }

    if (isNaN(numericPrice) || numericPrice <= 0) {
      setErrorMessage('Please enter a valid price greater than ₹0.');
      return;
    }

    if (quantity <= 0) {
      setErrorMessage('Quantity must be at least 1.');
      return;
    }

    const categoryId = selectedCategoryId || (categories.length > 0 ? categories[0].id : '');
    const categoryName = selectedCategory?.name || 'General';

    if (saveToMenu && !categoryId) {
      setErrorMessage('Please select a valid Category to save this product to the menu.');
      return;
    }

    setIsSubmitting(true);
    let savedProduct: Product | undefined = undefined;

    try {
      if (saveToMenu && activeRestaurantId) {
        // 1. Plan Limit Check
        const limitCheck = await subscriptionGuardService.checkPlanLimit(activeRestaurantId, 'PRODUCTS', 1);
        if (!limitCheck.allowed) {
          throw new Error(limitCheck.message || 'Product limit reached for your current subscription plan. You can still add this item to cart without saving to menu.');
        }

        // 2. Duplicate Check Scoped to Restaurant
        const existingProducts = await productService.getProducts(activeRestaurantId);
        const duplicate = existingProducts.find(
          (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase()
        );

        if (duplicate) {
          savedProduct = duplicate;
        } else {
          // 3. Generate SKU and Save New Product
          const cleanCode = trimmedName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'ITEM';
          const randomSuffix = Math.floor(100 + Math.random() * 900);
          const generatedSku = `QB-${cleanCode}-${randomSuffix}`;

          const newProdPayload: Partial<Product> = {
            restaurant_id: activeRestaurantId,
            name: trimmedName,
            sku: generatedSku,
            category_id: categoryId,
            category_name: categoryName,
            price: numericPrice,
            tax_rate: effectiveTaxRate,
            food_type: 'veg',
            stock_quantity: 100,
            unit: 'portion',
            preparation_time_mins: 15,
            is_available: true,
            is_active: true,
            hsn_code: '996331',
          };

          const created = await productService.saveProduct(newProdPayload, activeRestaurantId);
          savedProduct = created;
          if (onProductCreated) {
            onProductCreated(created);
          }
        }
      }

      // Add to Cart
      onAddToCart({
        name: trimmedName,
        price: numericPrice,
        quantity,
        taxRate: effectiveTaxRate,
        categoryId,
        categoryName,
        isTaxInclusive: taxMode === 'inclusive',
        notes: itemNotes.trim() || undefined,
        savedProduct,
      });

      // Clear draft on successful Add to Cart
      clearQuickBillDraft(activeRestaurantId);
      resetFormFields();
      onClose();
    } catch (err: any) {
      console.error('[QuickBillModal] Submit error:', err);
      setErrorMessage(err.message || 'Failed to add Quick Bill item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="fade" transparent onRequestClose={handleCancelAndDiscard}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { paddingBottom: insets.bottom + 12, paddingTop: insets.top + 12 }]}
      >
        <View style={[styles.content, { maxHeight: Math.min(windowHeight * 0.92, 700) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerIcon}>⚡</Text>
              <View>
                <Text style={styles.title}>Quick Bill</Text>
                <Text style={styles.subTitle}>Add on-the-go custom item to order</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleCancelAndDiscard} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Inline Error */}
          {Boolean(errorMessage) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 1. Product Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Product / Item Name <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Special Thali, Extra Butter Roti..."
                placeholderTextColor="#64748b"
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  persistDraft({ name: t });
                  if (errorMessage) setErrorMessage('');
                }}
                autoFocus
              />
            </View>

            {/* 2. Price & Quantity in 2-column row */}
            <View style={styles.twoColRow}>
              {/* Price */}
              <View style={[styles.fieldGroup, styles.twoColField]}>
                <Text style={styles.fieldLabel}>
                  Price (₹) <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.priceInputWrapper}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0.00"
                    placeholderTextColor="#64748b"
                    keyboardType="decimal-pad"
                    value={priceInput}
                    onChangeText={(t) => {
                      const clean = t.replace(/[^0-9.]/g, '');
                      setPriceInput(clean);
                      persistDraft({ priceInput: clean });
                      if (errorMessage) setErrorMessage('');
                    }}
                  />
                </View>
              </View>

              {/* Quantity Stepper */}
              <View style={[styles.fieldGroup, styles.twoColField]}>
                <Text style={styles.fieldLabel}>
                  Quantity <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.stepperWrapper}>
                  <TouchableOpacity
                    style={[styles.stepperBtn, quantity <= 1 && styles.stepperBtnDisabled]}
                    onPress={() => handleQuantityStep(-1)}
                    disabled={quantity <= 1}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.stepperBtnText, quantity <= 1 && styles.stepperBtnTextDisabled]}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.stepperValueInput}
                    keyboardType="number-pad"
                    value={String(quantity)}
                    onChangeText={(t) => {
                      const num = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      const safeNum = isNaN(num) ? 1 : Math.max(1, num);
                      setQuantity(safeNum);
                      persistDraft({ quantity: safeNum });
                    }}
                  />
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleQuantityStep(1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 3. Tax Mode (Exclusive vs Inclusive) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tax Calculation Mode</Text>
              <View style={styles.taxModeRow}>
                <TouchableOpacity
                  style={[styles.taxModeBtn, taxMode === 'exclusive' && styles.taxModeBtnActive]}
                  onPress={() => {
                    setTaxMode('exclusive');
                    persistDraft({ taxMode: 'exclusive' });
                  }}
                >
                  <Text style={[styles.taxModeText, taxMode === 'exclusive' && styles.taxModeTextActive]}>
                    + GST (Exclusive)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.taxModeBtn, taxMode === 'inclusive' && styles.taxModeBtnActive]}
                  onPress={() => {
                    setTaxMode('inclusive');
                    persistDraft({ taxMode: 'inclusive' });
                  }}
                >
                  <Text style={[styles.taxModeText, taxMode === 'inclusive' && styles.taxModeTextActive]}>
                    Incl. GST (Inclusive)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. GST Rates */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>GST Rate (%)</Text>
                <Text style={styles.fieldHelper}>Selected: {effectiveTaxRate}%</Text>
              </View>
              <View style={styles.gstPillRow}>
                {COMMON_GST_RATES.map((rate) => {
                  const isSelected = !isCustomTax && taxRate === rate;
                  return (
                    <TouchableOpacity
                      key={rate}
                      style={[styles.gstPill, isSelected && styles.gstPillActive]}
                      onPress={() => handleSelectGstRate(rate)}
                    >
                      <Text style={[styles.gstPillText, isSelected && styles.gstPillTextActive]}>
                        {rate}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom GST Rate input */}
                <View style={[styles.customGstWrapper, isCustomTax && styles.customGstWrapperActive]}>
                  <TextInput
                    style={[styles.customGstInput, isCustomTax && styles.customGstInputActive]}
                    placeholder="Custom %"
                    placeholderTextColor="#64748b"
                    keyboardType="decimal-pad"
                    value={customTaxInput}
                    onChangeText={handleCustomTaxChange}
                    onFocus={() => setIsCustomTax(true)}
                  />
                  <Text style={[styles.customGstSymbol, isCustomTax && styles.customGstSymbolActive]}>%</Text>
                </View>
              </View>
            </View>

            {/* 5. Category / KOT Category */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>
                  Category / KOT Category <Text style={styles.requiredStar}>*</Text>
                </Text>
                {selectedCategory && (
                  <Text style={styles.fieldHelper}>Selected: {selectedCategory.name}</Text>
                )}
              </View>

              {categories.length === 0 ? (
                <View style={styles.noCategoriesBox}>
                  <Text style={styles.noCategoriesText}>General Category (Default)</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPillsScroll}>
                  {categories.map((c) => {
                    const isSelected = selectedCategoryId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catChip, isSelected && styles.catChipActive]}
                        onPress={() => {
                          setSelectedCategoryId(c.id);
                          persistDraft({ selectedCategoryId: c.id });
                        }}
                      >
                        <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* 6. Item Notes (Optional) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Kitchen / Item Notes (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 36 }]}
                placeholder="e.g. Less spicy, Extra crispy..."
                placeholderTextColor="#64748b"
                value={itemNotes}
                onChangeText={(t) => {
                  setItemNotes(t);
                  persistDraft({ itemNotes: t });
                }}
              />
            </View>

            {/* 7. Save to Product Menu Checkbox */}
            <View style={styles.saveMenuSection}>
              <TouchableOpacity
                style={[
                  styles.saveMenuCheckboxRow,
                  !canManageProducts && styles.saveMenuCheckboxRowDisabled,
                ]}
                disabled={!canManageProducts}
                onPress={() => {
                  const nextVal = !saveToMenu;
                  setSaveToMenu(nextVal);
                  persistDraft({ saveToMenu: nextVal });
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkboxSquare, saveToMenu && styles.checkboxSquareChecked]}>
                  {saveToMenu && <Text style={styles.checkmarkText}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.saveMenuTitle, !canManageProducts && { color: '#94a3b8' }]}>
                    Add this product to Product Menu
                  </Text>
                  <Text style={styles.saveMenuSub}>
                    {canManageProducts
                      ? 'Permanently saves this item in the restaurant catalog for future orders'
                      : 'Requires product-management permission to save permanently to menu'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* 8. Live Calculation Summary Card */}
            {numericPrice > 0 && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Base Unit Price:</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(baseUnitPrice)}</Text>
                </View>
                {effectiveTaxRate > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>GST ({effectiveTaxRate}% {taxMode === 'inclusive' ? 'Incl.' : 'Excl.'}):</Text>
                    <Text style={styles.summaryValue}>+{formatCurrency(lineTaxTotal)}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.summaryGrandRow]}>
                  <Text style={styles.summaryGrandLabel}>Total ({quantity} item{quantity > 1 ? 's' : ''}):</Text>
                  <Text style={styles.summaryGrandValue}>{formatCurrency(lineGrandTotal)}</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelAndDiscard}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addBtn, (!name.trim() || numericPrice <= 0 || isSubmitting) && styles.addBtnDisabled]}
              onPress={handleSubmit}
              disabled={!name.trim() || numericPrice <= 0 || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.addBtnText}>
                  + Add to Cart {numericPrice > 0 ? `(${formatCurrency(lineGrandTotal)})` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 540,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 22,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  errorBox: {
    marginHorizontal: 18,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 11.5,
    color: '#dc2626',
    fontWeight: '600',
  },
  formScroll: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  fieldHelper: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '600',
  },
  requiredStar: {
    color: '#dc2626',
    fontWeight: '900',
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    width: '100%',
  },
  twoColField: {
    flex: 1,
    minWidth: 0,
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 10,
    width: '100%',
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  stepperWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    height: 40,
    width: '100%',
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 44,
    height: 40,
    flexShrink: 0,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    backgroundColor: '#f1f5f9',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 20,
  },
  stepperBtnTextDisabled: {
    color: '#cbd5e1',
  },
  stepperValueInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    paddingHorizontal: 0,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  taxModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  taxModeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxModeBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  taxModeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
  },
  taxModeTextActive: {
    color: '#2563eb',
    fontWeight: '900',
  },
  gstPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  gstPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    minWidth: 46,
    alignItems: 'center',
  },
  gstPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  gstPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  gstPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  customGstWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    height: 33,
    minWidth: 84,
  },
  customGstWrapperActive: {
    backgroundColor: '#ffffff',
    borderColor: '#2563eb',
  },
  customGstInput: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    width: 54,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  customGstInputActive: {
    color: '#0f172a',
    fontWeight: '800',
  },
  customGstSymbol: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748b',
  },
  customGstSymbolActive: {
    color: '#2563eb',
  },
  categoryPillsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  catChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  catChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  catChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  noCategoriesBox: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  noCategoriesText: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '600',
  },
  saveMenuSection: {
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  saveMenuCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  saveMenuCheckboxRowDisabled: {
    opacity: 0.65,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxSquareChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  saveMenuTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  saveMenuSub: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 10,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11.5,
    color: '#166534',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 11.5,
    color: '#166534',
    fontWeight: '700',
  },
  summaryGrandRow: {
    borderTopWidth: 1,
    borderTopColor: '#86efac',
    paddingTop: 5,
    marginTop: 2,
    marginBottom: 0,
  },
  summaryGrandLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#14532d',
  },
  summaryGrandValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#14532d',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  addBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },
});
