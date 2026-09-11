import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { categoryService } from '../../src/services/api/categoryService';
import { productService } from '../../src/services/api/productService';
import { useAuth } from '../../src/context/AuthContext';
import { Category, Product } from '../../src/types';

export default function CategoriesScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 600;
  const { activeRestaurantId } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  // Modals
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [savingCategory, setSavingCategory] = useState<boolean>(false);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formSlug, setFormSlug] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formDisplayOrder, setFormDisplayOrder] = useState<string>('1');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  const windowHeight = Dimensions.get('window').height;

  const loadData = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const [cats, prods] = await Promise.all([
        categoryService.getCategories(activeRestaurantId),
        productService.getProducts(activeRestaurantId),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadData(true);
  };

  useEffect(() => {
    loadData();
  }, [activeRestaurantId]);

  const openAddModal = () => {
    setEditingCategory(null);
    setFormName('');
    setFormSlug('');
    setFormDesc('');
    setFormDisplayOrder(String(categories.length + 1));
    setFormIsActive(true);
    setShowCategoryModal(true);
  };

  const openEditModal = (c: Category) => {
    setEditingCategory(c);
    setFormName(c.name);
    setFormSlug(c.slug);
    setFormDesc(c.description || '');
    setFormDisplayOrder(String(c.display_order || 1));
    setFormIsActive(c.is_active);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      Alert.alert('Missing Field', 'Please enter a valid Category Name.');
      return;
    }
    const orderNum = parseInt(formDisplayOrder, 10);
    if (isNaN(orderNum) || orderNum <= 0) {
      Alert.alert('Invalid Order', 'Display order must be a positive integer.');
      return;
    }

    setSavingCategory(true);
    try {
      const targetRestId = activeRestaurantId;
      await categoryService.saveCategory({
        id: editingCategory?.id,
        restaurant_id: targetRestId,
        name: trimmedName,
        slug: formSlug.trim() || undefined,
        description: formDesc.trim(),
        display_order: orderNum,
        is_active: formIsActive,
      }, targetRestId);

      Alert.alert(
        'Success',
        editingCategory ? `Updated "${trimmedName}" successfully.` : `Created "${trimmedName}" category.`
      );
      setShowCategoryModal(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = (c: Category) => {
    const prodsInCat = products.filter((p) => p.category_id === c.id);
    if (prodsInCat.length > 0) {
      Alert.alert(
        'Cannot Delete Category',
        `There are ${prodsInCat.length} dishes assigned to "${c.name}". Please reassign or delete those products before deleting this category.`
      );
      return;
    }

    const message = `Are you sure you want to permanently delete "${c.name}"?`;

    const doDelete = async () => {
      try {
        await categoryService.deleteCategory(c.id, activeRestaurantId);
        Alert.alert('Deleted', `"${c.name}" has been deleted.`);
        await loadData();
      } catch (err: any) {
        Alert.alert('Delete Failed', err.message);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(message) : true;
      if (confirmed) {
        doDelete();
      }
      return;
    }

    Alert.alert(
      'Delete Category',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: doDelete,
        },
      ]
    );
  };

  const handleToggleActive = async (c: Category) => {
    try {
      await categoryService.toggleCategoryActive(c.id, !c.is_active);
      await loadData();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    }
  };

  const filteredCategories = categories.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Food Categories ({categories.length})</Text>
            <Text style={styles.subtitle}>Organize and group menu catalog items</Text>
          </View>

          <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
            <Text style={styles.addBtnText}>+ ADD CATEGORY</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search categories by name or slug..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading categories from Supabase...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredCategories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 32 }}>📁</Text>
              <Text style={styles.emptyTitle}>No Categories Found</Text>
              <Text style={styles.emptySub}>Tap "+ ADD CATEGORY" above to create your first menu category.</Text>
            </View>
          ) : (
            filteredCategories.map((cat) => {
              const count = products.filter((p) => p.category_id === cat.id).length;

              const responsiveCardStyle =
                Platform.OS === 'web'
                  ? windowWidth >= 1280
                    ? styles.cardWeb5Col
                    : windowWidth >= 1024
                    ? styles.cardWeb4Col
                    : windowWidth >= 768
                    ? styles.cardWeb3Col
                    : windowWidth >= 520
                    ? styles.cardWeb2Col
                    : styles.cardWeb1Col
                  : undefined;

              return (
                <View
                  key={cat.id}
                  style={[
                    styles.card,
                    responsiveCardStyle,
                    !cat.is_active && styles.cardInactive,
                  ]}
                >
                  <View>
                    <View style={styles.cardHeader}>
                      <Text style={styles.catName} numberOfLines={1}>
                        {cat.name}
                      </Text>
                      <View
                        style={[
                          styles.activeBadge,
                          cat.is_active ? styles.activeBadgeOn : styles.activeBadgeOff,
                        ]}
                      >
                        <Text
                          style={[
                            styles.activeBadgeText,
                            cat.is_active ? styles.activeBadgeTextOn : styles.activeBadgeTextOff,
                          ]}
                        >
                          {cat.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.catDesc} numberOfLines={2}>
                      {cat.description || 'No description provided.'}
                    </Text>
                    
                    <View style={styles.metaRow}>
                      <Text style={styles.catCount}>🍲 {count} Dishes</Text>
                      <Text style={styles.catOrder}>Order: #{cat.display_order}</Text>
                    </View>
                    <Text style={styles.catSlug} numberOfLines={1}>
                      slug: {cat.slug}
                    </Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.editActionBtn}
                      onPress={() => openEditModal(cat)}
                    >
                      <Text style={styles.editActionBtnText}>✏️ Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.toggleActionBtn}
                      onPress={() => handleToggleActive(cat)}
                    >
                      <Text style={styles.toggleActionBtnText} numberOfLines={1}>
                        {cat.is_active ? 'Deactivate' : 'Activate'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteActionBtn}
                      onPress={() => handleDeleteCategory(cat)}
                    >
                      <Text style={styles.deleteActionBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ============================================================ */}
      {/* ADD / EDIT CATEGORY MODAL                                     */}
      {/* ============================================================ */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: 16,
              paddingBottom: 16,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', maxWidth: 400 }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingCategory ? `Edit "${editingCategory.name}"` : 'Add New Category'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowCategoryModal(false)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Category Name */}
                <Text style={styles.fieldLabel}>Category Name *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Biryani, Starters, Chinese"
                  placeholderTextColor="#64748b"
                  value={formName}
                  onChangeText={(v) => {
                    setFormName(v);
                    if (!editingCategory) {
                      setFormSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                    }
                  }}
                />

                {/* Slug */}
                <Text style={styles.fieldLabel}>URL Slug</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. biryani"
                  placeholderTextColor="#64748b"
                  value={formSlug}
                  onChangeText={setFormSlug}
                />

                {/* Display Order */}
                <Text style={styles.fieldLabel}>Display Priority / Order *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="1"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  value={formDisplayOrder}
                  onChangeText={setFormDisplayOrder}
                />

                {/* Description */}
                <Text style={styles.fieldLabel}>Description (Optional)</Text>
                <TextInput
                  style={[styles.fieldInput, { height: 50 }]}
                  placeholder="Category description..."
                  placeholderTextColor="#64748b"
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
                  <Text style={styles.checkText}>Active (Visible on POS and Customer Menus)</Text>
                </TouchableOpacity>

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.saveModalBtn, savingCategory && styles.btnDisabled]}
                  onPress={handleSaveCategory}
                  disabled={savingCategory}
                >
                  {savingCategory ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveModalBtnText}>
                      {editingCategory ? 'SAVE CATEGORY CHANGES' : 'CREATE CATEGORY'}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
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
  addBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  search: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
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
    gap: 12,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    flexWrap: Platform.OS === 'web' ? 'wrap' : 'nowrap',
    alignItems: 'stretch',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    justifyContent: 'space-between',
  },
  cardWeb5Col: {
    width: 'calc(20% - 10px)' as any,
    flexBasis: 'calc(20% - 10px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWeb4Col: {
    width: 'calc(25% - 9px)' as any,
    flexBasis: 'calc(25% - 9px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWeb3Col: {
    width: 'calc(33.333% - 8px)' as any,
    flexBasis: 'calc(33.333% - 8px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWeb2Col: {
    width: 'calc(50% - 6px)' as any,
    flexBasis: 'calc(50% - 6px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWeb1Col: {
    width: '100%',
    flexBasis: '100%',
    flexGrow: 1,
    flexShrink: 0,
  },
  cardInactive: {
    opacity: 0.65,
    backgroundColor: '#f8fafc',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  catName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  activeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadgeOn: {
    backgroundColor: '#dcfce7',
  },
  activeBadgeOff: {
    backgroundColor: '#f1f5f9',
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  activeBadgeTextOn: {
    color: '#15803d',
  },
  activeBadgeTextOff: {
    color: '#64748b',
  },
  catDesc: {
    fontSize: 11,
    color: '#64748b',
    marginVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  catSlug: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
  },
  catCount: {
    fontSize: 10,
    color: '#2563eb',
    fontWeight: '800',
  },
  catOrder: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  editActionBtn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    minHeight: 34,
  },
  editActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  toggleActionBtn: {
    flex: 1.2,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 34,
  },
  toggleActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  deleteActionBtn: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
    minHeight: 34,
  },
  deleteActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#e11d48',
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
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
    color: '#0f172a',
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
  saveModalBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  saveModalBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
  },
});
