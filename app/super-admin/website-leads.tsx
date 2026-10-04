import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { websiteManagementService, LeadStatsSummary } from '../../src/services/api/websiteManagementService';
import { WebsiteLead, LeadStatus } from '../../src/types/marketing';

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; label: string }> = {
  new: { bg: '#EFF6FF', text: '#2563EB', label: 'New Lead' },
  contacted: { bg: '#FEF3C7', text: '#D97706', label: 'Contacted' },
  qualified: { bg: '#F3E8FF', text: '#9333EA', label: 'Qualified' },
  demo_scheduled: { bg: '#E0E7FF', text: '#4F46E5', label: 'Demo Scheduled' },
  converted: { bg: '#DCFCE7', text: '#16A34A', label: 'Converted' },
  closed_lost: { bg: '#FEE2E2', text: '#DC2626', label: 'Closed / Lost' },
};

export default function SuperAdminWebsiteLeads() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [leads, setLeads] = useState<WebsiteLead[]>([]);
  const [stats, setStats] = useState<LeadStatsSummary>({
    totalLeads: 0,
    newLeads: 0,
    contactedLeads: 0,
    qualifiedLeads: 0,
    demoScheduledLeads: 0,
    convertedLeads: 0,
    closedLostLeads: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedLead, setSelectedLead] = useState<WebsiteLead | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<LeadStatus>('new');
  const [savingLead, setSavingLead] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        websiteManagementService.getLeads({
          status: filterStatus,
          searchQuery,
          limit: 100,
        }),
        websiteManagementService.getLeadStats(),
      ]);

      setLeads(leadsRes.leads);
      setStats(statsRes);
    } catch (e) {
      console.warn('Failed to load leads:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLead = (lead: WebsiteLead) => {
    setSelectedLead(lead);
    setEditStatus(lead.status);
    setEditNotes(lead.internal_notes || '');
  };

  const handleSaveLead = async () => {
    if (!selectedLead) return;
    setSavingLead(true);
    try {
      const res = await websiteManagementService.updateLeadStatus(
        selectedLead.id,
        editStatus,
        editNotes
      );
      if (res.success) {
        setSelectedLead(null);
        loadData();
      }
    } finally {
      setSavingLead(false);
    }
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleWhatsApp = (phone: string, name: string) => {
    const cleanDigits = phone.replace(/\D/g, '');
    const formatted = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
    const msg = encodeURIComponent(`Hi ${name}, thank you for your inquiry on RestroZ restaurant management software!`);
    Linking.openURL(`https://wa.me/${formatted}?text=${msg}`).catch(() => {});
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Website Leads & Demo Requests</Text>
          <Text style={styles.pageSubtitle}>
            Manage incoming sales inquiries, book demo requests, and customer contact leads.
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData} activeOpacity={0.7}>
          <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Leads</Text>
          <Text style={styles.metricVal}>{stats.totalLeads}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#2563EB', borderLeftWidth: 4 }]}>
          <Text style={styles.metricLabel}>New Inquiries</Text>
          <Text style={[styles.metricVal, { color: '#2563EB' }]}>{stats.newLeads}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#D97706', borderLeftWidth: 4 }]}>
          <Text style={styles.metricLabel}>Contacted</Text>
          <Text style={[styles.metricVal, { color: '#D97706' }]}>{stats.contactedLeads}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#4F46E5', borderLeftWidth: 4 }]}>
          <Text style={styles.metricLabel}>Demo Scheduled</Text>
          <Text style={[styles.metricVal, { color: '#4F46E5' }]}>{stats.demoScheduledLeads}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#16A34A', borderLeftWidth: 4 }]}>
          <Text style={styles.metricLabel}>Converted</Text>
          <Text style={[styles.metricVal, { color: '#16A34A' }]}>{stats.convertedLeads}</Text>
        </View>
      </View>

      {/* Filter & Search Bar */}
      <View style={styles.filterRow}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, restaurant, city, phone or email..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={loadData}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPillsScroll}>
          {(['all', 'new', 'contacted', 'qualified', 'demo_scheduled', 'converted', 'closed_lost'] as const).map(
            (st) => (
              <TouchableOpacity
                key={st}
                style={[styles.filterPill, filterStatus === st && styles.filterPillActive]}
                onPress={() => setFilterStatus(st)}
              >
                <Text style={[styles.filterPillText, filterStatus === st && styles.filterPillTextActive]}>
                  {st === 'all' ? 'All Leads' : STATUS_COLORS[st].label}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </View>

      {/* Leads Table */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading inquiries from Supabase...</Text>
        </View>
      ) : leads.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={styles.emptyTitle}>No Website Leads Found</Text>
          <Text style={styles.emptySub}>Inquiries submitted through the website forms will appear here.</Text>
        </View>
      ) : (
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 1.2 }]}>DATE / TYPE</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>NAME & RESTAURANT</Text>
            <Text style={[styles.th, { flex: 1.3 }]}>CONTACT</Text>
            <Text style={[styles.th, { flex: 1.1 }]}>LOCATION / OUTLETS</Text>
            <Text style={[styles.th, { flex: 1 }]}>STATUS</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>ACTION</Text>
          </View>

          {leads.map((lead) => {
            const dateStr = new Date(lead.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            const statusConfig = STATUS_COLORS[lead.status] || STATUS_COLORS.new;

            return (
              <TouchableOpacity
                key={lead.id}
                style={styles.tableRow}
                onPress={() => handleOpenLead(lead)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1.2, gap: 2 }}>
                  <Text style={styles.dateText}>{dateStr}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{lead.lead_type.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={styles.nameText}>{lead.full_name}</Text>
                  <Text style={styles.bizText}>{lead.business_name}</Text>
                </View>

                <View style={{ flex: 1.3 }}>
                  <Text style={styles.phoneText}>📞 {lead.phone}</Text>
                  <Text style={styles.emailText}>✉️ {lead.email}</Text>
                </View>

                <View style={{ flex: 1.1 }}>
                  <Text style={styles.cityText}>{lead.city}</Text>
                  <Text style={styles.outletsText}>{lead.number_of_outlets} Outlet(s)</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                    <Text style={[styles.statusText, { color: statusConfig.text }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>

                <View style={{ width: 100, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => handleWhatsApp(lead.phone, lead.full_name)}
                  >
                    <Text style={{ fontSize: 16 }}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => handleCall(lead.phone)}
                  >
                    <Text style={{ fontSize: 16 }}>📞</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Lead Detail & Update Modal */}
      {selectedLead && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedLead(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedLead.full_name}</Text>
                  <Text style={styles.modalBiz}>{selectedLead.business_name} • {selectedLead.city}</Text>
                </View>
                <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedLead(null)}>
                  <Text style={{ fontSize: 18, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Contact Actions Bar */}
                <View style={styles.quickContactBar}>
                  <TouchableOpacity
                    style={[styles.quickBtn, { backgroundColor: '#25D366' }]}
                    onPress={() => handleWhatsApp(selectedLead.phone, selectedLead.full_name)}
                  >
                    <Text style={styles.quickBtnText}>💬 WhatsApp Lead</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quickBtn, { backgroundColor: '#2563EB' }]}
                    onPress={() => handleCall(selectedLead.phone)}
                  >
                    <Text style={styles.quickBtnText}>📞 Call {selectedLead.phone}</Text>
                  </TouchableOpacity>
                </View>

                {/* Info Fields Grid */}
                <View style={styles.infoGrid}>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoKey}>Email Address</Text>
                    <Text style={styles.infoVal}>{selectedLead.email}</Text>
                  </View>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoKey}>Number of Outlets</Text>
                    <Text style={styles.infoVal}>{selectedLead.number_of_outlets}</Text>
                  </View>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoKey}>Preferred Contact</Text>
                    <Text style={styles.infoVal}>{selectedLead.preferred_contact_method.toUpperCase()}</Text>
                  </View>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoKey}>Source Page</Text>
                    <Text style={styles.infoVal}>{selectedLead.source_page || '/info'}</Text>
                  </View>
                </View>

                {/* Features of Interest */}
                {selectedLead.interested_features && selectedLead.interested_features.length > 0 && (
                  <View style={styles.sectionWrap}>
                    <Text style={styles.infoKey}>Interested Features</Text>
                    <View style={styles.chipsRow}>
                      {selectedLead.interested_features.map((f, i) => (
                        <View key={`chip-${i}`} style={styles.chipItem}>
                          <Text style={styles.chipText}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Message */}
                {selectedLead.message ? (
                  <View style={styles.sectionWrap}>
                    <Text style={styles.infoKey}>Inquiry Message</Text>
                    <View style={styles.msgBox}>
                      <Text style={styles.msgText}>{selectedLead.message}</Text>
                    </View>
                  </View>
                ) : null}

                {/* Status Picker */}
                <View style={styles.sectionWrap}>
                  <Text style={styles.infoKey}>Update Lead Status</Text>
                  <View style={styles.statusGrid}>
                    {(['new', 'contacted', 'qualified', 'demo_scheduled', 'converted', 'closed_lost'] as LeadStatus[]).map(
                      (st) => {
                        const isCur = editStatus === st;
                        return (
                          <TouchableOpacity
                            key={st}
                            style={[styles.statusOption, isCur && styles.statusOptionActive]}
                            onPress={() => setEditStatus(st)}
                          >
                            <Text style={[styles.statusOptionText, isCur && styles.statusOptionTextActive]}>
                              {STATUS_COLORS[st].label}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </View>

                {/* Internal Notes */}
                <View style={styles.sectionWrap}>
                  <Text style={styles.infoKey}>Internal Notes & Next Steps</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Add notes about call discussion, scheduled demo time, pricing offered..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={4}
                    value={editNotes}
                    onChangeText={setEditNotes}
                  />
                </View>
              </ScrollView>

              {/* Modal Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelModalBtn}
                  onPress={() => setSelectedLead(null)}
                >
                  <Text style={styles.cancelModalText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveModalBtn, savingLead && { opacity: 0.6 }]}
                  onPress={handleSaveLead}
                  disabled={savingLead}
                >
                  {savingLead ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveModalText}>Save Lead Updates</Text>
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
  refreshBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  metricVal: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  searchWrap: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
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
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  th: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  bizText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  phoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  emailText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  outletsText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBiz: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  modalClose: {
    padding: 6,
  },
  modalBody: {
    gap: 16,
  },
  quickContactBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  infoBox: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoKey: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  sectionWrap: {
    gap: 6,
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipItem: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  msgBox: {
    backgroundColor: '#FAF9F6',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  msgText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusOptionActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  statusOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  statusOptionTextActive: {
    color: '#FFFFFF',
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelModalText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  saveModalBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveModalText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
