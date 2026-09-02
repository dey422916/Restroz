import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { superAdminService } from '../../src/services/api/superAdminService';
import { colors } from '../../src/utils/colors';

export default function PlatformAuditLogsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = async () => {
    try {
      const data = await superAdminService.getAuditLogs(100);
      setLogs(data);
    } catch (e) {
      console.warn('Error loading audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const getActionColor = (action: string) => {
    if (action.includes('CREATE') || action.includes('ASSIGN') || action.includes('ACTIVATE'))
      return '#059669';
    if (action.includes('SUSPEND') || action.includes('CANCEL') || action.includes('DEACTIVATE') || action.includes('REMOVE'))
      return '#DC2626';
    if (action.includes('UPDATE') || action.includes('CHANGE')) return '#0284C7';
    return '#64748B';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Platform Audit Trail</Text>
          <Text style={styles.subtitle}>
            Comprehensive immutable log of Super Admin platform actions and tenant events
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.refreshBtn, isMobile && { width: '100%', justifyContent: 'center' }]}
          onPress={loadLogs}
          activeOpacity={0.8}
        >
          <Text style={styles.refreshBtnText}>🔄 Refresh Feed</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.tableScroll} contentContainerStyle={{ paddingBottom: isMobile ? 100 : 40 }}>
          {logs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 36 }}>🛡️</Text>
              <Text style={styles.emptyText}>No platform audit events recorded.</Text>
            </View>
          ) : isMobile ? (
            /* Mobile Cards */
            <View style={styles.mobileCardList}>
              {logs.map((l) => (
                <View key={l.id} style={styles.mobileCard}>
                  <View style={styles.mobileCardTop}>
                    <View
                      style={[
                        styles.actionPill,
                        { backgroundColor: `${getActionColor(l.action)}15` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionPillText,
                          { color: getActionColor(l.action) },
                        ]}
                      >
                        {l.action}
                      </Text>
                    </View>
                    <Text style={styles.mobileTimeText}>
                      {new Date(l.created_at).toLocaleTimeString()} • {new Date(l.created_at).toLocaleDateString()}
                    </Text>
                  </View>

                  <View style={styles.mobileMetaGrid}>
                    <View style={styles.mobileMetaItem}>
                      <Text style={styles.mobileMetaLabel}>TARGET SCOPE</Text>
                      <Text style={styles.mobileMetaValue} numberOfLines={1}>
                        🏢 {l.restaurant?.name || (l.restaurant_id ? `ID: ${l.restaurant_id.slice(0, 8)}...` : 'GLOBAL PLATFORM')}
                      </Text>
                    </View>
                    <View style={styles.mobileMetaItem}>
                      <Text style={styles.mobileMetaLabel}>ACTOR / USER</Text>
                      <Text style={styles.mobileMetaValue} numberOfLines={1}>
                        👤 {l.user_name || l.actor_name || l.user_id?.slice(0, 8) || 'System'}
                      </Text>
                    </View>
                  </View>

                  {l.details && (
                    <View style={styles.detailsBox}>
                      <Text style={styles.detailsText} numberOfLines={2}>
                        {typeof l.details === 'object' ? JSON.stringify(l.details) : l.details}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            /* Desktop Table */
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.5 }]}>ACTION</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>RESTAURANT</Text>
                <Text style={[styles.th, { flex: 1 }]}>ENTITY</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>ACTOR / USER</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>TIMESTAMP</Text>
              </View>

              {logs.map((l) => (
                <View key={l.id} style={styles.tableRow}>
                  <View style={{ flex: 1.5 }}>
                    <View
                      style={[
                        styles.actionPill,
                        { backgroundColor: `${getActionColor(l.action)}15` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionPillText,
                          { color: getActionColor(l.action) },
                        ]}
                      >
                        {l.action}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.tdText, { flex: 1.5, fontWeight: '600' }]} numberOfLines={1}>
                    {l.restaurant?.name || (l.restaurant_id ? `ID: ${l.restaurant_id.slice(0, 8)}` : 'GLOBAL PLATFORM')}
                  </Text>

                  <Text style={[styles.tdText, { flex: 1, color: '#64748B', fontSize: 13 }]} numberOfLines={1}>
                    {l.entity || 'system'}
                  </Text>

                  <Text style={[styles.tdText, { flex: 1.5, color: '#334155' }]} numberOfLines={1}>
                    👤 {l.user_name || l.actor_name || l.user_id?.slice(0, 8) || 'System'}
                  </Text>

                  <Text style={[styles.tdText, { flex: 1.2, textAlign: 'right', fontSize: 12, color: '#64748B' }]}>
                    {new Date(l.created_at).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
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
  refreshBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  refreshBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  // Mobile Cards
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mobileTimeText: {
    fontSize: 11,
    color: '#64748B',
  },
  mobileMetaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 12,
  },
  mobileMetaItem: {
    flex: 1,
  },
  mobileMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
  },
  mobileMetaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  detailsBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailsText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#64748B',
  },
  // Desktop Table
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
  tdText: {
    fontSize: 13,
    color: '#0F172A',
  },
  actionPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    gap: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
