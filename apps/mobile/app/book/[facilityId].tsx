import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, ApiError, errorMessage } from '../../src/api';
import { Button, Card, Chip, EmptyState, ErrorBanner, Field, Loading, Muted, Row, Screen, SectionTitle } from '../../src/components/ui';
import { formatDate, formatTime, localDateKey } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import { colors, radius, space } from '../../src/theme';
import type { AvailabilitySlot, Booking, BookingType, Club, FacilityAvailability } from '../../src/types';

const DAYS_AHEAD = 7;

function dayLabel(d: Date, offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return formatDate(d).replace(',', '');
}

export default function BookSlotScreen() {
  const { facilityId } = useLocalSearchParams<{ facilityId: string }>();
  const days = useMemo(
    () =>
      Array.from({ length: DAYS_AHEAD }, (_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return { key: localDateKey(d), label: dayLabel(d, i) };
      }),
    [],
  );
  const [dateKey, setDateKey] = useState(days[0].key);
  const availability = useApi<FacilityAvailability>(`/facilities/${facilityId}/availability?date=${dateKey}`);
  const clubs = useApi<Club[]>('/clubs');
  const myClubs = (clubs.data ?? []).filter((c) => c.myMembership?.status === 'ACTIVE');

  // Selected contiguous slot range [from, to] (indexes into slots).
  const [range, setRange] = useState<[number, number] | null>(null);
  const [purpose, setPurpose] = useState('');
  const [participants, setParticipants] = useState('1');
  const [type, setType] = useState<BookingType>('CASUAL');
  const [clubId, setClubId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slots = availability.data?.slots ?? [];
  const facility = availability.data?.facility;
  const now = Date.now();
  const selectable = (s: AvailabilitySlot) => s.available && new Date(s.start).getTime() > now;

  function tapSlot(i: number) {
    setError(null);
    if (!selectable(slots[i])) return;
    if (range && i === range[1] + 1) setRange([range[0], i]);
    else if (range && i === range[0] - 1) setRange([i, range[1]]);
    else if (range && range[0] === i && range[1] === i) setRange(null);
    else setRange([i, i]);
  }

  function pickDate(key: string) {
    setDateKey(key);
    setRange(null);
    setError(null);
  }

  async function confirm() {
    if (!range || !facility) return;
    if (type === 'CLUB_PRACTICE' && !clubId) {
      setError('Choose which club this practice is for.');
      return;
    }
    const count = Math.max(1, Math.min(facility.capacity, parseInt(participants, 10) || 1));
    setBusy(true);
    setError(null);
    try {
      const booking = await api<Booking>('/bookings', {
        method: 'POST',
        body: {
          facilityId: facility.id,
          start: slots[range[0]].start,
          end: slots[range[1]].end,
          purpose: purpose.trim() || (type === 'CLUB_PRACTICE' ? 'Club practice' : 'Casual play'),
          type,
          clubId: type === 'CLUB_PRACTICE' ? clubId : undefined,
          participants: count,
        },
      });
      router.replace(`/booking/${booking.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Someone just booked part of that time. Pick another slot.');
        setRange(null);
        void availability.reload();
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const needsApproval = !!facility && (facility.requiresApproval || type !== 'CASUAL');

  return (
    <Screen refreshing={availability.refreshing} onRefresh={availability.refresh}>
      {facility ? <Stack.Screen options={{ title: facility.name }} /> : null}

      <View style={styles.days}>
        {days.map((d) => (
          <Chip key={d.key} label={d.label} selected={d.key === dateKey} onPress={() => pickDate(d.key)} />
        ))}
      </View>

      {facility && facility.status !== 'OPEN' ? (
        <ErrorBanner message={`${facility.name} is ${facility.status.toLowerCase()}${facility.statusNote ? ` — ${facility.statusNote}` : ''}.`} />
      ) : null}
      {availability.error ? <ErrorBanner message={availability.error} onRetry={availability.refresh} /> : null}

      <SectionTitle>Slots</SectionTitle>
      <Card>
        {availability.loading ? (
          <Loading />
        ) : slots.length === 0 ? (
          <EmptyState icon="time-outline" title="No slots on this day" />
        ) : (
          <>
            <View style={styles.grid}>
              {slots.map((s, i) => {
                const inRange = !!range && i >= range[0] && i <= range[1];
                const ok = selectable(s);
                return (
                  <Text
                    key={s.start}
                    onPress={() => tapSlot(i)}
                    style={[styles.slot, !ok && styles.slotTaken, inRange && styles.slotSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !ok, selected: inRange }}
                  >
                    {formatTime(s.start)}
                  </Text>
                );
              })}
            </View>
            <Row style={{ gap: space.lg }}>
              <Legend color={colors.white} label="Free" border />
              <Legend color={colors.navy} label="Selected" />
              <Legend color="#eceef4" label="Taken / past" />
            </Row>
            <Muted>Tap a slot, then tap the next one to extend.</Muted>
          </>
        )}
      </Card>

      {range ? (
        <>
          <SectionTitle>Details</SectionTitle>
          <Card>
            <Text style={styles.summary}>
              {formatDate(slots[range[0]].start)} · {formatTime(slots[range[0]].start)}–{formatTime(slots[range[1]].end)}
            </Text>
            {myClubs.length > 0 ? (
              <View style={styles.days}>
                <Chip label="Casual" selected={type === 'CASUAL'} onPress={() => setType('CASUAL')} />
                <Chip label="Club practice" selected={type === 'CLUB_PRACTICE'} onPress={() => setType('CLUB_PRACTICE')} />
              </View>
            ) : null}
            {type === 'CLUB_PRACTICE' ? (
              <View style={styles.days}>
                {myClubs.map((c) => (
                  <Chip key={c.id} label={c.name} selected={c.id === clubId} onPress={() => setClubId(c.id)} />
                ))}
              </View>
            ) : null}
            <Field label="Purpose" value={purpose} onChangeText={setPurpose} placeholder={type === 'CLUB_PRACTICE' ? 'Club practice' : 'Casual play'} />
            <Field
              label="Participants"
              value={participants}
              onChangeText={(t) => setParticipants(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              hint={facility ? `Up to ${facility.capacity}` : undefined}
            />
            {error ? <ErrorBanner message={error} /> : null}
            <Button
              title={needsApproval ? 'Request booking' : 'Book now'}
              icon="checkmark-circle-outline"
              loading={busy}
              disabled={facility?.status !== 'OPEN'}
              onPress={() => void confirm()}
            />
            {needsApproval ? <Muted>This booking needs approval from the Sports Office.</Muted> : null}
          </Card>
        </>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : null}
    </Screen>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <Row style={{ gap: 6 }}>
      <View style={[styles.legendDot, { backgroundColor: color }, border && { borderWidth: 1, borderColor: colors.border }]} />
      <Text style={styles.legendText}>{label}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: {
    width: 72,
    textAlign: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.navy,
    fontWeight: '700',
    overflow: 'hidden',
  },
  slotTaken: { backgroundColor: '#eceef4', color: colors.faint, borderColor: '#eceef4', textDecorationLine: 'line-through' },
  slotSelected: { backgroundColor: colors.navy, borderColor: colors.navy, color: colors.white },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 12, color: colors.muted },
  summary: { fontSize: 16, fontWeight: '700', color: colors.navy },
});
