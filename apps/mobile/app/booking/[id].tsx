import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { Badge, Button, Card, Divider, ErrorBanner, KeyValue, Loading, Muted, Row, Screen } from '../../src/components/ui';
import { bookingTone, formatDateTime, formatRange, titleCase } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import { colors, radius, space } from '../../src/theme';
import type { Booking, BookingPass } from '../../src/types';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // There is no GET /bookings/:id; the owner's list is small, so find it there.
  const list = useApi<Booking[]>('/bookings?scope=mine');
  const booking = list.data?.find((b) => b.id === id);

  const showPass = !!booking && booking.status === 'APPROVED' && new Date(booking.end).getTime() > Date.now();
  const pass = useApi<BookingPass>(showPass ? `/bookings/${id}/pass` : null);

  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (list.loading) return <Loading />;
  if (!booking) {
    return (
      <Screen>
        <ErrorBanner message={list.error ?? 'Booking not found.'} onRetry={list.refresh} />
      </Screen>
    );
  }

  const cancellable = (booking.status === 'PENDING' || booking.status === 'APPROVED') && new Date(booking.start).getTime() > Date.now();

  function confirmCancel() {
    Alert.alert('Cancel booking?', `${booking!.facility?.name ?? 'Facility'}\n${formatRange(booking!.start, booking!.end)}`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          setError(null);
          try {
            await api<Booking>(`/bookings/${booking!.id}/cancel`, { method: 'POST' });
            await list.reload();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.title}>{booking.facility?.name ?? 'Facility'}</Text>
          <Badge label={titleCase(booking.status)} tone={bookingTone(booking.status)} />
        </Row>
        <Muted>{formatRange(booking.start, booking.end)}</Muted>
        <Divider />
        <KeyValue label="Purpose" value={booking.purpose} />
        <KeyValue label="Type" value={titleCase(booking.type)} />
        {booking.club ? <KeyValue label="Club" value={booking.club.name} /> : null}
        <KeyValue label="Participants" value={String(booking.participants)} />
        <KeyValue label="Requested" value={formatDateTime(booking.createdAt)} />
        {booking.checkedInAt ? <KeyValue label="Checked in" value={formatDateTime(booking.checkedInAt)} /> : null}
      </Card>

      {booking.status === 'PENDING' ? (
        <Card style={styles.note}>
          <Row>
            <Ionicons name="hourglass-outline" size={18} color={colors.amber} />
            <Text style={styles.noteTitle}>Awaiting approval</Text>
          </Row>
          <Muted>The Sports Office will review this request. You'll get a notification when it's decided.</Muted>
        </Card>
      ) : null}

      {booking.status === 'REJECTED' && booking.rejectionReason ? (
        <Card style={[styles.note, { backgroundColor: colors.terracottaSoft }]}>
          <Text style={[styles.noteTitle, { color: colors.terracottaDark }]}>Rejected</Text>
          <Muted>{booking.rejectionReason}</Muted>
        </Card>
      ) : null}

      {showPass ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={styles.passTitle}>Gate pass</Text>
          {pass.loading ? (
            <Loading />
          ) : pass.error ? (
            <ErrorBanner message={pass.error} onRetry={pass.refresh} />
          ) : pass.data ? (
            <>
              <View style={styles.qrFrame}>
                <Image source={{ uri: pass.data.qrDataUrl }} style={styles.qr} resizeMode="contain" accessibilityLabel="Booking pass QR code" />
              </View>
              <Muted style={{ textAlign: 'center' }}>Show this code to security at the facility entrance.</Muted>
            </>
          ) : null}
        </Card>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      {cancellable ? <Button title="Cancel booking" icon="close-circle-outline" variant="danger" loading={cancelling} onPress={confirmCancel} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: colors.navy, flex: 1 },
  note: { backgroundColor: colors.amberSoft, borderColor: 'transparent' },
  noteTitle: { fontSize: 15, fontWeight: '700', color: colors.amber },
  passTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  qrFrame: { padding: space.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  qr: { width: 240, height: 240 },
});
