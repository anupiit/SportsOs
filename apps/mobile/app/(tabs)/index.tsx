import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { useAuth } from '../../src/auth';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  ListItem,
  Loading,
  Screen,
  SectionTitle,
  type IconName,
} from '../../src/components/ui';
import { bookingTone, firstName, formatRange, formatTime, greeting, timeAgo, titleCase } from '../../src/format';
import { colors, radius, space } from '../../src/theme';
import { ROLE_LABELS, type AttendanceSession, type Booking, type Notification, type OverviewKpis } from '../../src/types';

interface HomeData {
  kpis: OverviewKpis | null;
  sessions: AttendanceSession[];
  bookings: Booking[];
  notifications: Notification[];
  unread: number;
}

export default function HomeScreen() {
  const { user, can } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const showKpis = can('analytics.view');

  const load = useCallback(async () => {
    // Load independently so one failing section doesn't blank the whole screen.
    const [kpis, sessions, bookings, notifications, unread] = await Promise.allSettled([
      showKpis ? api<OverviewKpis>('/analytics/overview') : Promise.resolve(null),
      api<AttendanceSession[]>('/attendance/sessions?status=ACTIVE'),
      api<Booking[]>('/bookings?scope=mine'),
      api<Notification[]>('/notifications'),
      api<{ count: number }>('/notifications/unread-count'),
    ]);
    const now = Date.now();
    setData({
      kpis: kpis.status === 'fulfilled' ? kpis.value : null,
      sessions: sessions.status === 'fulfilled' ? sessions.value : [],
      bookings:
        bookings.status === 'fulfilled'
          ? bookings.value
              .filter((b) => (b.status === 'APPROVED' || b.status === 'PENDING') && new Date(b.end).getTime() > now)
              .sort((a, b) => a.start.localeCompare(b.start))
              .slice(0, 3)
          : [],
      notifications: notifications.status === 'fulfilled' ? notifications.value.filter((n) => !n.readAt).slice(0, 3) : [],
      unread: unread.status === 'fulfilled' ? unread.value.count : 0,
    });
    setErrors(
      [kpis, sessions, bookings, notifications]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => errorMessage(r.reason))
        .filter((m, i, all) => all.indexOf(m) === i),
    );
  }, [showKpis]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!user) return null;
  if (!data) return <Loading />;

  const isManager = can('attendance.manage');

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.hero}>
        <Text style={styles.hello}>
          {greeting()}, {firstName(user.name)}
        </Text>
        <View style={styles.heroMeta}>
          <Badge label={ROLE_LABELS[user.role]} tone="info" />
          {user.hostel ? <Text style={styles.heroSub}>{user.hostel} Hostel</Text> : null}
        </View>
      </View>

      {errors.map((e) => (
        <ErrorBanner key={e} message={e} onRetry={onRefresh} />
      ))}

      <View style={styles.actions}>
        <QuickAction icon="location" label="Check in" onPress={() => router.navigate('/checkin')} />
        <QuickAction icon="qr-code" label="Scan" onPress={() => router.navigate('/scan')} />
        <QuickAction icon="add-circle" label="Book" onPress={() => router.push('/book')} />
      </View>

      {data.kpis ? <KpiGrid kpis={data.kpis} /> : null}

      <SectionTitle>{isManager ? 'My live sessions' : 'Live sessions you can join'}</SectionTitle>
      <Card>
        {data.sessions.length === 0 ? (
          <EmptyState icon="time-outline" title="No active sessions" body="When a coach opens a practice session it shows up here." />
        ) : (
          data.sessions.map((s) => (
            <ListItem
              key={s.id}
              icon="radio-outline"
              tone="success"
              title={s.title}
              subtitle={`${s.facility?.name ?? 'Facility'} · until ${formatTime(s.endsAt)}${isManager ? ` · ${s.attendeeCount} checked in` : ''}`}
              onPress={() => router.navigate({ pathname: '/checkin', params: { session: s.id } })}
            />
          ))
        )}
      </Card>

      <SectionTitle>Upcoming bookings</SectionTitle>
      <Card>
        {data.bookings.length === 0 ? (
          <EmptyState icon="calendar-outline" title="Nothing booked" body="Reserve a court or ground from the Book button above." />
        ) : (
          data.bookings.map((b) => (
            <ListItem
              key={b.id}
              icon="calendar"
              title={b.facility?.name ?? 'Facility'}
              subtitle={formatRange(b.start, b.end)}
              right={<Badge label={titleCase(b.status)} tone={bookingTone(b.status)} />}
              onPress={() => router.push(`/booking/${b.id}`)}
            />
          ))
        )}
      </Card>

      <SectionTitle
        action={
          data.unread > 0 ? (
            <Text style={styles.link} onPress={() => router.navigate('/profile')}>
              {data.unread} unread
            </Text>
          ) : undefined
        }
      >
        Notifications
      </SectionTitle>
      <Card>
        {data.notifications.length === 0 ? (
          <EmptyState icon="notifications-outline" title="You're all caught up" />
        ) : (
          data.notifications.map((n) => (
            <ListItem
              key={n.id}
              icon={n.type === 'ALERT' ? 'warning' : n.type === 'APPROVAL' ? 'checkmark-done' : 'notifications'}
              tone={n.type === 'ALERT' ? 'danger' : 'info'}
              title={n.title}
              subtitle={`${n.body} · ${timeAgo(n.createdAt)}`}
              onPress={() => router.navigate('/profile')}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.blue} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function KpiGrid({ kpis }: { kpis: OverviewKpis }) {
  const change = kpis.attendanceChangePct;
  const tiles: { label: string; value: string; note?: string; warn?: boolean }[] = [
    { label: 'Bookings today', value: String(kpis.bookingsToday) },
    { label: 'Pending approvals', value: String(kpis.pendingApprovals), warn: kpis.pendingApprovals > 0 },
    {
      label: 'Check-ins this week',
      value: String(kpis.attendanceThisWeek),
      note: change === null ? undefined : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}% vs last week`,
    },
    {
      label: 'Facilities open',
      value: `${kpis.facilities.open}/${kpis.facilities.total}`,
      note: kpis.facilities.maintenance ? `${kpis.facilities.maintenance} in maintenance` : undefined,
    },
    { label: 'Low-stock items', value: String(kpis.lowStockItems), warn: kpis.lowStockItems > 0 },
    { label: 'Overdue returns', value: String(kpis.overdueIssues), warn: kpis.overdueIssues > 0 },
    { label: 'Open complaints', value: String(kpis.openComplaints) },
    { label: 'Rejected check-ins', value: String(kpis.rejectedCheckInsThisWeek), note: 'this week' },
  ];
  return (
    <>
      <SectionTitle>Today at a glance</SectionTitle>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={[styles.tileValue, t.warn && { color: colors.terracottaDark }]}>{t.value}</Text>
            {t.note ? <Text style={styles.tileNote}>{t.note}</Text> : null}
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.sm, marginBottom: space.xs },
  hello: { fontSize: 24, fontWeight: '800', color: colors.navy },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  heroSub: { color: colors.muted, fontSize: 13 },
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: space.md,
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.navy },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    gap: 2,
  },
  tileLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.navy },
  tileNote: { fontSize: 11, color: colors.muted },
  link: { color: colors.blue, fontWeight: '700', fontSize: 13 },
});
