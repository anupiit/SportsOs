import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, EmptyState, ErrorBanner, Loading, Muted, Row, Screen } from '../../src/components/ui';
import { facilityTone, minutesToHHMM, titleCase } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import { colors } from '../../src/theme';
import type { Facility } from '../../src/types';

export default function FacilityListScreen() {
  const { data, error, loading, refreshing, refresh } = useApi<Facility[]>('/facilities');

  if (loading) return <Loading />;

  const facilities = [...(data ?? [])].sort((a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN') || a.name.localeCompare(b.name));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {facilities.length === 0 && !error ? <EmptyState icon="business-outline" title="No facilities listed" /> : null}
      {facilities.map((f) => {
        const bookable = f.status === 'OPEN';
        return (
          <Pressable
            key={f.id}
            disabled={!bookable}
            onPress={() => router.push({ pathname: '/book/[facilityId]', params: { facilityId: f.id } })}
            style={({ pressed }) => pressed && { opacity: 0.8 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !bookable }}
          >
            <Card style={!bookable && { opacity: 0.7 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{f.name}</Text>
                  <Muted>
                    {titleCase(f.type)} · {f.sports.join(', ')}
                  </Muted>
                </View>
                <Badge label={titleCase(f.status)} tone={facilityTone(f.status)} />
              </Row>
              {f.statusNote ? (
                <Row>
                  <Ionicons name="information-circle-outline" size={16} color={colors.amber} />
                  <Text style={styles.note}>{f.statusNote}</Text>
                </Row>
              ) : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <Muted>
                  {minutesToHHMM(f.openMinute)}–{minutesToHHMM(f.closeMinute)} · up to {f.capacity}
                </Muted>
                {f.requiresApproval ? <Badge label="Needs approval" tone="warning" /> : <Badge label="Instant" tone="info" />}
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 17, fontWeight: '700', color: colors.navy },
  note: { flex: 1, fontSize: 13, color: colors.amber },
});
