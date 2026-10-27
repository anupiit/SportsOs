import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { useAuth } from '../../src/auth';
import { Badge, Button, Card, EmptyState, ErrorBanner, Loading, Muted, Row, Screen } from '../../src/components/ui';
import { getDeviceId } from '../../src/device';
import { distanceMetres, formatTime, metres, outcomeExplanation, outcomeTitle } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import { colors, mono, radius, space, type Tone } from '../../src/theme';
import type { AttendanceSession, CheckInRequest, CheckInResult } from '../../src/types';

interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number;
  at: number;
}

/** A fix older than this is refreshed before submitting. */
const FIX_MAX_AGE_MS = 30_000;

function accuracyTone(acc: number): { tone: Tone; label: string } {
  if (acc <= 25) return { tone: 'success', label: 'Precise' };
  if (acc <= 100) return { tone: 'warning', label: 'Fair' };
  return { tone: 'danger', label: 'Too imprecise' };
}

export default function CheckInScreen() {
  const { can } = useAuth();
  const params = useLocalSearchParams<{ session?: string }>();
  const sessions = useApi<AttendanceSession[]>('/attendance/sessions?status=ACTIVE');

  const [selectedId, setSelectedId] = useState<string | null>(params.session ?? null);
  const [extraSession, setExtraSession] = useState<AttendanceSession | null>(null);
  const [otp, setOtp] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [resultAccuracy, setResultAccuracy] = useState<number | null>(null);

  // A deep link or a scanned session QR selects that session.
  useEffect(() => {
    if (params.session) {
      setSelectedId(params.session);
      setResult(null);
      setOtp('');
    }
  }, [params.session]);

  const listed = useMemo(() => sessions.data ?? [], [sessions.data]);
  const fetchedId = useRef<string | null>(null);
  const selected = useMemo(
    () => listed.find((s) => s.id === selectedId) ?? (extraSession?.id === selectedId ? extraSession : null),
    [listed, selectedId, extraSession],
  );

  // A session that isn't in the list (e.g. opened from a QR) is fetched directly.
  useEffect(() => {
    if (!selectedId || sessions.loading || listed.some((s) => s.id === selectedId) || fetchedId.current === selectedId) return;
    fetchedId.current = selectedId;
    let cancelled = false;
    api<AttendanceSession>(`/attendance/sessions/${encodeURIComponent(selectedId)}`)
      .then((s) => !cancelled && setExtraSession(s))
      .catch((err) => !cancelled && setSubmitError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [selectedId, sessions.loading, listed]);

  async function locate(): Promise<Fix | null> {
    setLocating(true);
    setLocError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocError('SportsOS needs location access to verify you are at the facility. Enable it in Settings.');
        return null;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocError('Location services are off. Turn on GPS and try again.');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const next: Fix = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 9999,
        at: Date.now(),
      };
      setFix(next);
      return next;
    } catch (err) {
      setLocError(`Couldn't get your location: ${errorMessage(err)}`);
      return null;
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    if (!selected || otp.length !== 6) return;
    setSubmitError(null);
    setResult(null);
    let current = fix;
    if (!current || Date.now() - current.at > FIX_MAX_AGE_MS) current = await locate();
    if (!current) return;

    setSubmitting(true);
    try {
      const body: CheckInRequest = {
        sessionId: selected.id,
        otp,
        latitude: current.latitude,
        longitude: current.longitude,
        accuracyM: current.accuracy,
        deviceId: await getDeviceId(),
      };
      const res = await api<CheckInResult>('/attendance/check-in', { method: 'POST', body });
      setResult(res);
      setResultAccuracy(current.accuracy);
      if (res.outcome === 'ACCEPTED' || res.outcome === 'BAD_OTP') setOtp('');
      if (res.outcome === 'ACCEPTED') void sessions.reload();
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const preview =
    fix && selected?.facility
      ? distanceMetres(fix.latitude, fix.longitude, selected.facility.latitude, selected.facility.longitude)
      : null;
  const insideZone = preview !== null && selected?.facility ? preview <= selected.facility.geofenceRadiusM : null;

  if (sessions.loading && !sessions.data) return <Loading />;

  return (
    <Screen refreshing={sessions.refreshing} onRefresh={sessions.refresh}>
      {sessions.error ? <ErrorBanner message={sessions.error} onRetry={sessions.refresh} /> : null}

      {result ? <ResultCard result={result} accuracy={resultAccuracy} onDismiss={() => setResult(null)} /> : null}

      <Card>
        <StepTitle n={1} title="Session" />
        {listed.length === 0 && !selected ? (
          <EmptyState
            icon="time-outline"
            title="No live sessions"
            body="Scan the QR code on your coach's screen, or pull down to refresh."
          />
        ) : null}
        {[...listed, ...(selected && !listed.some((s) => s.id === selected.id) ? [selected] : [])].map((s) => {
          const active = s.id === selectedId;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                setSelectedId(s.id);
                setResult(null);
              }}
              style={[styles.session, active && styles.sessionActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.blue : colors.faint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionTitle}>{s.title}</Text>
                <Text style={styles.sessionSub}>
                  {s.facility?.name ?? 'Facility'}
                  {s.club ? ` · ${s.club.name}` : ''} · until {formatTime(s.endsAt)}
                </Text>
              </View>
              {s.status === 'CLOSED' ? <Badge label="Closed" /> : null}
            </Pressable>
          );
        })}
        <Button title="Scan session QR" icon="qr-code-outline" variant="secondary" onPress={() => router.navigate('/scan')} />
      </Card>

      <Card>
        <StepTitle n={2} title="Code from your coach" />
        <TextInput
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          placeholderTextColor={colors.border}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          style={styles.otp}
          accessibilityLabel="Six digit session code"
        />
        <Muted>The code on the coach's screen changes every 30 seconds.</Muted>
      </Card>

      <Card>
        <StepTitle n={3} title="Your location" />
        {fix ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.coords}>
                {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}
              </Text>
              <Badge label={`±${metres(fix.accuracy)} · ${accuracyTone(fix.accuracy).label}`} tone={accuracyTone(fix.accuracy).tone} />
            </Row>
            {preview !== null && selected?.facility ? (
              <Muted>
                About {metres(preview)} from {selected.facility.name} (check-in zone {selected.facility.geofenceRadiusM} m)
                {insideZone ? ' — looks good.' : ' — move closer before checking in.'}
              </Muted>
            ) : null}
          </>
        ) : (
          <Muted>A precise GPS fix is taken when you check in. You can preview it first.</Muted>
        )}
        {locError ? <ErrorBanner message={locError} /> : null}
        <Button
          title={fix ? 'Refresh location' : 'Get my location'}
          icon="navigate-outline"
          variant="secondary"
          loading={locating && !submitting}
          onPress={() => void locate()}
        />
      </Card>

      {submitError ? <ErrorBanner message={submitError} /> : null}

      <Button
        title={locating ? 'Getting a GPS fix…' : submitting ? 'Verifying…' : 'Check in'}
        icon="checkmark-circle-outline"
        onPress={() => void submit()}
        loading={submitting}
        disabled={!selected || otp.length !== 6 || locating}
      />

      <View style={styles.how}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.muted} />
        <Muted style={{ flex: 1 }}>
          SportsOS verifies the rotating code, your GPS position against the facility's geofence, and that this phone hasn't
          checked in anyone else for the session.
          {can('attendance:manage') ? ' Open sessions and show the code from the SportsOS web dashboard.' : ''}
        </Muted>
      </View>
    </Screen>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <Row>
      <View style={styles.step}>
        <Text style={styles.stepText}>{n}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </Row>
  );
}

function ResultCard({ result, accuracy, onDismiss }: { result: CheckInResult; accuracy: number | null; onDismiss: () => void }) {
  const ok = result.outcome === 'ACCEPTED';
  const explanation = outcomeExplanation(result.outcome, result.distanceM, accuracy);
  return (
    <View style={[styles.result, ok ? styles.resultOk : styles.resultBad]} accessibilityLiveRegion="polite">
      <Row>
        <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={28} color={ok ? colors.green : colors.terracottaDark} />
        <Text style={[styles.resultTitle, { color: ok ? colors.green : colors.terracottaDark }]}>{outcomeTitle(result.outcome)}</Text>
      </Row>
      <Text style={styles.resultBody}>{explanation}</Text>
      {ok && result.record ? <Text style={styles.resultMeta}>Recorded at {formatTime(result.record.checkedInAt)}</Text> : null}
      {result.message && result.message !== explanation ? <Text style={styles.resultMeta}>{result.message}</Text> : null}
      <Button title={ok ? 'Done' : 'Dismiss'} variant="ghost" compact onPress={onDismiss} style={{ alignSelf: 'flex-end' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  sessionSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  otp: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 14,
    textAlign: 'center',
    color: colors.navy,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    backgroundColor: colors.white,
    fontFamily: mono,
  },
  coords: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  step: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.navy },
  how: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xs, marginTop: space.sm },
  result: { borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1 },
  resultOk: { backgroundColor: colors.greenSoft, borderColor: '#bfe3cf' },
  resultBad: { backgroundColor: colors.terracottaSoft, borderColor: '#f0cfc3' },
  resultTitle: { fontSize: 18, fontWeight: '800' },
  resultBody: { fontSize: 15, color: colors.text, lineHeight: 21 },
  resultMeta: { fontSize: 13, color: colors.muted },
});
