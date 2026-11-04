import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, API_URL, errorMessage } from '../../src/api';
import { useAuth } from '../../src/auth';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, KeyValue, Loading, Muted, Row, Screen } from '../../src/components/ui';
import { firstName, formatDateTime, metres, timeAgo } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import { colors, radius, space } from '../../src/theme';
import { ROLE_LABELS, type AttendanceRecord, type Notification } from '../../src/types';

type Tab = 'attendance' | 'notifications';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('attendance');
  const attendance = useApi<AttendanceRecord[]>('/attendance/me');
  const notifications = useApi<Notification[]>('/notifications');
  const [actionError, setActionError] = useState<string | null>(null);

  if (!user) return null;

  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;
  const records = [...(attendance.data ?? [])].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
  const thisMonth = records.filter((r) => {
    const d = new Date(r.checkedInAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  async function markRead(n: Notification) {
    if (n.readAt) return;
    try {
      const updated = await api<Notification>(`/notifications/${n.id}/read`, { method: 'POST' });
      notifications.setData(notifications.data?.map((x) => (x.id === n.id ? updated : x)));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function markAllRead() {
    try {
      await api<{ updated: number }>('/notifications/read-all', { method: 'POST' });
      await notifications.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  function confirmLogout() {
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  const refreshing = attendance.refreshing || notifications.refreshing;
  const onRefresh = () => {
    void attendance.refresh();
    void notifications.refresh();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Card>
        <Row>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{firstName(user.name).charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.name}</Text>
            <Muted>{user.email}</Muted>
          </View>
        </Row>
        <Badge label={ROLE_LABELS[user.role]} tone="info" />
        {user.admissionNo ? <KeyValue label="Admission no." value={user.admissionNo.toUpperCase()} /> : null}
        {user.hostel ? <KeyValue label="Hostel" value={user.hostel} /> : null}
        {user.phone ? <KeyValue label="Phone" value={user.phone} /> : null}
      </Card>

      <View style={styles.tabs}>
        <Chip label={`Attendance (${records.length})`} selected={tab === 'attendance'} onPress={() => setTab('attendance')} />
        <Chip label={`Notifications${unread ? ` · ${unread} new` : ''}`} selected={tab === 'notifications'} onPress={() => setTab('notifications')} />
      </View>

      {actionError ? <ErrorBanner message={actionError} /> : null}

      {tab === 'attendance' ? (
        <Card>
          {attendance.loading ? (
            <Loading />
          ) : attendance.error ? (
            <ErrorBanner message={attendance.error} onRetry={attendance.refresh} />
          ) : records.length === 0 ? (
            <EmptyState icon="footsteps-outline" title="No check-ins yet" body="Verified practice sessions you attend appear here." />
          ) : (
            <>
              <Row style={styles.stats}>
                <Stat label="Total" value={records.length} />
                <Stat label="This month" value={thisMonth} />
              </Row>
              {records.map((r) => (
                <View key={r.id} style={styles.record}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordTitle}>{r.session?.title ?? 'Practice session'}</Text>
                    <Muted>
                      {formatDateTime(r.checkedInAt)} · {r.distanceM === null ? 'manual entry by staff' : `${metres(r.distanceM)} from centre`}
                    </Muted>
                  </View>
                </View>
              ))}
            </>
          )}
        </Card>
      ) : (
        <Card>
          {notifications.loading ? (
            <Loading />
          ) : notifications.error ? (
            <ErrorBanner message={notifications.error} onRetry={notifications.refresh} />
          ) : (notifications.data ?? []).length === 0 ? (
            <EmptyState icon="notifications-off-outline" title="No notifications" />
          ) : (
            <>
              {unread > 0 ? <Button title="Mark all as read" variant="ghost" compact onPress={() => void markAllRead()} style={{ alignSelf: 'flex-end' }} /> : null}
              {(notifications.data ?? []).map((n) => (
                <Pressable key={n.id} onPress={() => void markRead(n)} style={styles.notification} accessibilityRole="button">
                  <View style={[styles.dot, { backgroundColor: n.readAt ? 'transparent' : n.type === 'ALERT' ? colors.terracotta : colors.blue }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, !n.readAt && { fontWeight: '800' }]}>{n.title}</Text>
                    <Text style={styles.notifBody}>{n.body}</Text>
                    <Text style={styles.notifTime}>{timeAgo(n.createdAt)}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </Card>
      )}

      <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={confirmLogout} />
      <Text style={styles.footer}>
        SportsOS v{Constants.expoConfig?.version ?? '0.1.0'} · {API_URL}
      </Text>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 20, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.navy },
  tabs: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  stats: { gap: space.sm, marginBottom: space.xs },
  stat: { flex: 1, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: space.md },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.navy },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  record: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.sm },
  recordTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  notification: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  notifTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  notifBody: { fontSize: 14, color: colors.muted, marginTop: 2, lineHeight: 20 },
  notifTime: { fontSize: 12, color: colors.faint, marginTop: 4 },
  footer: { textAlign: 'center', fontSize: 11, color: colors.faint, marginTop: space.sm },
});
