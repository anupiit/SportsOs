import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { useAuth } from '../../src/auth';
import { Badge, Button, Card, Divider, KeyValue, Muted, Screen } from '../../src/components/ui';
import { bookingTone, formatDateTime, formatRange, titleCase } from '../../src/format';
import { colors, mono, radius, space } from '../../src/theme';
import type { Booking } from '../../src/types';

/**
 * Gate-pass verification for security / ground staff. Opened from the scanner
 * (auto=1 checks in immediately) or from a sportsos://pass/<token> deep link
 * (asks for confirmation first).
 */
export default function PassScreen() {
  const { can } = useAuth();
  const { token, auto } = useLocalSearchParams<{ token: string; auto?: string }>();
  const allowed = can('booking.verify');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const checkIn = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setBooking(await api<Booking>('/bookings/check-in', { method: 'POST', body: { token } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (auto === '1' && allowed && !started.current) {
      started.current = true;
      void checkIn();
    }
  }, [auto, allowed, checkIn]);

  if (!allowed) {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>Staff only</Text>
          <Muted>Booking passes are checked in by security and ground staff at the facility gate.</Muted>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {booking ? (
        <View style={[styles.banner, styles.ok]}>
          <Ionicons name="checkmark-circle" size={44} color={colors.green} />
          <Text style={[styles.bannerTitle, { color: colors.green }]}>Entry allowed</Text>
          <Text style={styles.bannerSub}>Checked in {booking.checkedInAt ? formatDateTime(booking.checkedInAt) : 'now'}</Text>
        </View>
      ) : error ? (
        <View style={[styles.banner, styles.bad]}>
          <Ionicons name="close-circle" size={44} color={colors.terracottaDark} />
          <Text style={[styles.bannerTitle, { color: colors.terracottaDark }]}>Pass not accepted</Text>
          <Text style={styles.bannerSub}>{error}</Text>
        </View>
      ) : (
        <Card>
          <Text style={styles.title}>Verify booking pass</Text>
          <Muted>Confirm the holder is at the facility, then check the booking in.</Muted>
          <Text style={styles.token} selectable>
            {token}
          </Text>
        </Card>
      )}

      {booking ? (
        <Card>
          <KeyValue label="Facility" value={booking.facility?.name ?? '—'} />
          <KeyValue label="When" value={formatRange(booking.start, booking.end)} />
          <Divider />
          <KeyValue label="Booked by" value={booking.user?.name ?? '—'} />
          {booking.user?.admissionNo ? <KeyValue label="Admission no." value={booking.user.admissionNo.toUpperCase()} /> : null}
          {booking.club ? <KeyValue label="Club" value={booking.club.name} /> : null}
          <KeyValue label="Purpose" value={booking.purpose} />
          <KeyValue label="Participants" value={String(booking.participants)} />
          <KeyValue label="Status" value={<Badge label={titleCase(booking.status)} tone={bookingTone(booking.status)} />} />
        </Card>
      ) : null}

      {!booking ? (
        <Button title={error ? 'Try again' : 'Check in booking'} icon="enter-outline" loading={busy} onPress={() => void checkIn()} />
      ) : null}
      <Button title="Scan next pass" icon="scan-outline" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: colors.navy },
  token: { fontSize: 12, color: colors.muted, fontFamily: mono },
  banner: { borderRadius: radius.lg, padding: space.xl, alignItems: 'center', gap: space.sm, borderWidth: 1 },
  ok: { backgroundColor: colors.greenSoft, borderColor: '#bfe3cf' },
  bad: { backgroundColor: colors.terracottaSoft, borderColor: '#f0cfc3' },
  bannerTitle: { fontSize: 22, fontWeight: '800' },
  bannerSub: { fontSize: 14, color: colors.text, textAlign: 'center' },
});
