import { router } from 'expo-router';
import { useMemo } from 'react';
import { Badge, Button, Card, EmptyState, ErrorBanner, ListItem, Loading, Screen, SectionTitle } from '../../src/components/ui';
import { bookingTone, formatRange, titleCase } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import type { Booking } from '../../src/types';

export default function BookingsScreen() {
  const { data, error, loading, refreshing, refresh } = useApi<Booking[]>('/bookings?scope=mine');

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const all = data ?? [];
    const isUpcoming = (b: Booking) => (b.status === 'PENDING' || b.status === 'APPROVED') && new Date(b.end).getTime() > now;
    return {
      upcoming: all.filter(isUpcoming).sort((a, b) => a.start.localeCompare(b.start)),
      past: all
        .filter((b) => !isUpcoming(b))
        .sort((a, b) => b.start.localeCompare(a.start))
        .slice(0, 25),
    };
  }, [data]);

  if (loading) return <Loading />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Button title="Book a facility" icon="add-circle-outline" onPress={() => router.push('/book')} />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      <SectionTitle>Upcoming</SectionTitle>
      <Card>
        {upcoming.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No upcoming bookings" body="Courts and grounds can be booked up to a week ahead." />
        ) : (
          upcoming.map((b) => <BookingRow key={b.id} booking={b} />)
        )}
      </Card>

      {past.length > 0 ? (
        <>
          <SectionTitle>History</SectionTitle>
          <Card>
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function BookingRow({ booking: b }: { booking: Booking }) {
  return (
    <ListItem
      icon={b.type === 'CLUB_PRACTICE' ? 'people' : b.type === 'EVENT' ? 'trophy' : 'calendar'}
      tone={bookingTone(b.status)}
      title={b.facility?.name ?? 'Facility'}
      subtitle={`${formatRange(b.start, b.end)}${b.club ? ` · ${b.club.name}` : ''}`}
      right={<Badge label={titleCase(b.status)} tone={bookingTone(b.status)} />}
      onPress={() => router.push(`/booking/${b.id}`)}
    />
  );
}
