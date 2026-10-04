import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Image,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { websiteManagementService } from '../../src/services/api/websiteManagementService';
import { WebsiteBanner, CreateWebsiteBannerPayload } from '../../src/types/marketing';
import { pickFileFromWeb } from '../../src/services/api/storageService';

export default function SuperAdminWebsiteBanners() {
  const [banners, setBanners] = useState<WebsiteBanner[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State for Add/Edit Banner
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [desktopImageUrl, setDesktopImageUrl] = useState('');
  const [mobileImageUrl, setMobileImageUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Explore Offer');
  const [ctaUrl, setCtaUrl] = useState('/info/book-demo');
  const [isExternalLink, setIsExternalLink] = useState(false);
  const [badgeText, setBadgeText] = useState('Special Offer');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    setLoading(true);
    try {
      const data = await websiteManagementService.getAllBanners();
      setBanners(data);
    } catch (e) {
      console.warn('Failed to load banners:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingBannerId(null);
    setTitle('');
    setHeadline('');
    setSubheadline('');
    setDesktopImageUrl('');
    setMobileImageUrl('');
    setCtaLabel('Explore Offer');
    setCtaUrl('/info/book-demo');
    setIsExternalLink(false);
    setBadgeText('Special Offer');
    setDisplayOrder('0');
    setIsActive(true);
    setStartDate('');
    setEndDate('');
    setModalOpen(true);
  };

  const handleOpenEdit = (b: WebsiteBanner) => {
    setEditingBannerId(b.id);
    setTitle(b.title);
    setHeadline(b.headline);
    setSubheadline(b.subheadline || '');
    setDesktopImageUrl(b.desktop_image_url);
    setMobileImageUrl(b.mobile_image_url || '');
    setCtaLabel(b.cta_label || '');
    setCtaUrl(b.cta_url || '');
    setIsExternalLink(b.is_external_link);
    setBadgeText(b.badge_text || '');
    setDisplayOrder(String(b.display_order));
    setIsActive(b.is_active);
    setStartDate(b.start_date ? b.start_date.substring(0, 10) : '');
    setEndDate(b.end_date ? b.end_date.substring(0, 10) : '');
    setModalOpen(true);
  };

  const handleUpload = async (type: 'desktop' | 'mobile') => {
    const file = await pickFileFromWeb();
    if (!file) return;

    if (type === 'desktop') setUploadingDesktop(true);
    else setUploadingMobile(true);

    try {
      const res = await websiteManagementService.uploadBannerImage(file, type);
      if (res.success && res.publicUrl) {
        if (type === 'desktop') setDesktopImageUrl(res.publicUrl);
        else setMobileImageUrl(res.publicUrl);
      } else {
        alert(res.error || 'Failed to upload image.');
      }
    } finally {
      if (type === 'desktop') setUploadingDesktop(false);
      else setUploadingMobile(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !headline.trim() || !desktopImageUrl.trim()) {
      alert('Please provide at least a Title, Headline, and Desktop Image URL.');
      return;
    }

    setSaving(true);
    try {
      const payload: CreateWebsiteBannerPayload = {
        title,
        headline,
        subheadline,
        desktop_image_url: desktopImageUrl,
        mobile_image_url: mobileImageUrl || undefined,
        cta_label: ctaLabel,
        cta_url: ctaUrl,
        is_external_link: isExternalLink,
        badge_text: badgeText,
        display_order: parseInt(displayOrder, 10) || 0,
        is_active: isActive,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
      };

      if (editingBannerId) {
        await websiteManagementService.updateBanner(editingBannerId, payload);
      } else {
        await websiteManagementService.createBanner(payload);
      }

      setModalOpen(false);
      loadBanners();
    } catch (e: any) {
      alert(e.message || 'Failed to save banner.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bannerId: string) => {
    if (confirm('Are you sure you want to delete this promotional banner?')) {
      await websiteManagementService.deleteBanner(bannerId);
      loadBanners();
    }
  };

  const handleToggleActive = async (banner: WebsiteBanner) => {
    await websiteManagementService.updateBanner(banner.id, { is_active: !banner.is_active });
    loadBanners();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Website Promotional Banners</Text>
          <Text style={styles.pageSubtitle}>
            Manage hero carousel promotional banners displayed on the marketing website.
          </Text>
        </View>
        <TouchableOpacity style={styles.newBannerBtn} onPress={handleOpenNew} activeOpacity={0.85}>
          <Text style={styles.newBannerText}>+ Add Promotional Banner</Text>
        </TouchableOpacity>
      </View>

      {/* Banners List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading banners...</Text>
        </View>
      ) : banners.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 40 }}>🎨</Text>
          <Text style={styles.emptyTitle}>No Promotional Banners Created</Text>
          <Text style={styles.emptySub}>
            Click "+ Add Promotional Banner" to publish launch offers, discounts, or new feature announcements.
          </Text>
        </View>
      ) : (
        <View style={styles.bannersGrid}>
          {banners.map((b) => (
            <View key={b.id} style={styles.bannerCard}>
              {/* Preview Thumbnail */}
              <View style={styles.previewWrap}>
                {b.desktop_image_url ? (
                  <Image source={{ uri: b.desktop_image_url }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.noImage}>
                    <Text style={{ color: '#94A3B8' }}>No Image</Text>
                  </View>
                )}
                <View style={styles.previewOverlay}>
                  {b.badge_text && (
                    <View style={styles.previewBadge}>
                      <Text style={styles.previewBadgeText}>{b.badge_text}</Text>
                    </View>
                  )}
                  <Text style={styles.previewHeadline} numberOfLines={1}>{b.headline}</Text>
                </View>
              </View>

              {/* Banner Details */}
              <View style={styles.bannerDetails}>
                <View style={styles.titleRow}>
                  <Text style={styles.bannerTitleText}>{b.title}</Text>
                  <View style={styles.switchWrap}>
                    <Text style={[styles.statusLabel, { color: b.is_active ? '#16A34A' : '#94A3B8' }]}>
                      {b.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                    <Switch
                      value={b.is_active}
                      onValueChange={() => handleToggleActive(b)}
                      trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                      thumbColor={b.is_active ? '#16A34A' : '#F8FAFC'}
                    />
                  </View>
                </View>

                {b.subheadline ? <Text style={styles.bannerSubText}>{b.subheadline}</Text> : null}

                <View style={styles.metaRow}>
                  <Text style={styles.metaItem}>Order: #{b.display_order}</Text>
                  {b.cta_label && <Text style={styles.metaItem}>CTA: "{b.cta_label}"</Text>}
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(b)}>
                    <Text style={styles.editBtnText}>✏️ Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(b.id)}>
                    <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add / Edit Banner Modal */}
      {modalOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingBannerId ? 'Edit Promotional Banner' : 'Create New Promotional Banner'}
                </Text>
                <TouchableOpacity onPress={() => setModalOpen(false)}>
                  <Text style={{ fontSize: 18, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.formGrid}>
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>Internal Title (Campaign Name) *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Festival Launch Offer 2026"
                      value={title}
                      onChangeText={setTitle}
                    />
                  </View>

                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>Badge Text</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Special Launch Offer"
                      value={badgeText}
                      onChangeText={setBadgeText}
                    />
                  </View>

                  <View style={[styles.inputWrap, { width: '100%' }]}>
                    <Text style={styles.inputLabel}>Main Headline *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Switch to RestroZ and Get 2 Months Free"
                      value={headline}
                      onChangeText={setHeadline}
                    />
                  </View>

                  <View style={[styles.inputWrap, { width: '100%' }]}>
                    <Text style={styles.inputLabel}>Subheadline</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Simplify your billing, waiter ordering, and KOT management today."
                      value={subheadline}
                      onChangeText={setSubheadline}
                    />
                  </View>

                  {/* Desktop Image */}
                  <View style={[styles.inputWrap, { width: '100%' }]}>
                    <Text style={styles.inputLabel}>Desktop Background Image URL *</Text>
                    <View style={styles.uploadRow}>
                      <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        placeholder="https://... or upload image"
                        value={desktopImageUrl}
                        onChangeText={setDesktopImageUrl}
                      />
                      <TouchableOpacity
                        style={styles.uploadBtn}
                        onPress={() => handleUpload('desktop')}
                        disabled={uploadingDesktop}
                      >
                        {uploadingDesktop ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.uploadBtnText}>Upload Image</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Mobile Image */}
                  <View style={[styles.inputWrap, { width: '100%' }]}>
                    <Text style={styles.inputLabel}>Mobile Background Image URL (Optional)</Text>
                    <View style={styles.uploadRow}>
                      <TextInput
                        style={[styles.textInput, { flex: 1 }]}
                        placeholder="https://... or upload image"
                        value={mobileImageUrl}
                        onChangeText={setMobileImageUrl}
                      />
                      <TouchableOpacity
                        style={styles.uploadBtn}
                        onPress={() => handleUpload('mobile')}
                        disabled={uploadingMobile}
                      >
                        {uploadingMobile ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.uploadBtnText}>Upload Image</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* CTA Label & URL */}
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>CTA Button Label</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Book a Free Demo"
                      value={ctaLabel}
                      onChangeText={setCtaLabel}
                    />
                  </View>

                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>CTA Target URL</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="/info/book-demo"
                      value={ctaUrl}
                      onChangeText={setCtaUrl}
                    />
                  </View>

                  {/* Display Order & Active */}
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>Display Order (Sequence)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="0"
                      keyboardType="numeric"
                      value={displayOrder}
                      onChangeText={setDisplayOrder}
                    />
                  </View>

                  <View style={[styles.inputWrap, { justifyContent: 'center' }]}>
                    <Text style={styles.inputLabel}>Published / Active</Text>
                    <Switch
                      value={isActive}
                      onValueChange={setIsActive}
                      trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                      thumbColor={isActive ? '#16A34A' : '#F8FAFC'}
                    />
                  </View>
                </View>
              </ScrollView>

              {/* Modal Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save & Publish Banner</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  newBannerBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  newBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingBox: {
    padding: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 500,
  },
  bannersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  bannerCard: {
    width: '48%',
    minWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  previewWrap: {
    height: 140,
    backgroundColor: '#1E293B',
    position: 'relative' as any,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 16,
    justifyContent: 'flex-end',
    gap: 6,
  },
  previewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FC8019',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  previewHeadline: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  bannerDetails: {
    padding: 16,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  switchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  bannerSubText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
  },
  metaItem: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    marginTop: 4,
  },
  editBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxWidth: 680,
    width: '100%',
    maxHeight: '90%',
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalScroll: {
    marginTop: 8,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  inputWrap: {
    width: '48%',
    minWidth: 200,
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
