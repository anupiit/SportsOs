import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { Button, Card, Field, Loading, Muted, Row, Screen, SectionTitle } from '../../src/components/ui';
import { parseQr, type QrPayload } from '../../src/qr';
import { colors, radius, space } from '../../src/theme';

interface Notice {
  title: string;
  body: string;
}

export default function ScanScreen() {
  const { can } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [manual, setManual] = useState('');
  // A ref, not state: onBarcodeScanned fires many times per second and must lock synchronously.
  const locked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      locked.current = false;
      return () => setFocused(false);
    }, []),
  );

  const canCheckInPasses = can('booking.verify');

  const route = useCallback(
    (payload: QrPayload) => {
      switch (payload.kind) {
        case 'session':
          router.navigate({ pathname: '/checkin', params: { session: payload.sessionId } });
          return;
        case 'equipment':
          router.push({ pathname: '/equipment/[code]', params: { code: payload.code } });
          return;
        case 'pass':
          if (canCheckInPasses) {
            router.push({ pathname: '/pass/[token]', params: { token: payload.token, auto: '1' } });
          } else {
            setNotice({
              title: 'Booking gate pass',
              body: 'Only security and ground staff can check in booking passes. Show your pass from the Bookings tab at the facility gate.',
            });
          }
          return;
        case 'unknown':
          setNotice({ title: 'Not a SportsOS code', body: `This QR code isn't from SportsOS:\n${payload.raw.slice(0, 120)}` });
      }
    },
    [canCheckInPasses],
  );

  const onScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (locked.current) return;
      locked.current = true;
      route(parseQr(data));
    },
    [route],
  );

  const scanAgain = () => {
    setNotice(null);
    locked.current = false;
  };

  const manualPayload = parseQr(manual);
  const manualCode = manual.trim();

  return (
    <Screen>
      {!permission ? (
        <Loading />
      ) : permission.granted ? (
        <View style={styles.cameraWrap}>
          {focused && !notice ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.cameraPaused]} />
          )}
          <View style={styles.frame} pointerEvents="none" />
          {notice ? (
            <View style={styles.noticeOverlay}>
              <Ionicons name="alert-circle" size={28} color={colors.terracotta} />
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeBody}>{notice.body}</Text>
              <Button title="Scan again" icon="scan-outline" onPress={scanAgain} />
            </View>
          ) : null}
        </View>
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <Ionicons name="camera-outline" size={36} color={colors.muted} />
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Muted style={{ textAlign: 'center' }}>
            SportsOS scans equipment labels, booking passes and session QR codes. You can also type a code below.
          </Muted>
          {permission.canAskAgain ? (
            <Button title="Allow camera" icon="camera" onPress={() => void requestPermission()} style={{ alignSelf: 'stretch' }} />
          ) : (
            <Button title="Open Settings" icon="settings-outline" variant="secondary" onPress={() => void Linking.openSettings()} style={{ alignSelf: 'stretch' }} />
          )}
        </Card>
      )}

      <Card>
        <Row>
          <Ionicons name="information-circle-outline" size={18} color={colors.blue} />
          <Text style={styles.hintTitle}>What can I scan?</Text>
        </Row>
        <Muted>• Equipment labels — see stock{can('inventory.issue') ? ', issue and receive returns' : ' and your borrowings'}</Muted>
        <Muted>• Session QR on your coach's screen — opens verified check-in</Muted>
        <Muted>• Booking gate passes{canCheckInPasses ? ' — checks the booking in' : ' (staff only)'}</Muted>
      </Card>

      <SectionTitle>Enter a code manually</SectionTitle>
      <Card>
        <Field
          label="Code or sportsos:// link"
          value={manual}
          onChangeText={setManual}
          placeholder="sportsos://equipment/…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {manualPayload.kind !== 'unknown' ? (
          <Button title="Open" icon="arrow-forward" onPress={() => route(manualPayload)} />
        ) : (
          <Row>
            <Button
              title="Equipment"
              icon="basketball-outline"
              variant="secondary"
              disabled={!manualCode}
              onPress={() => route({ kind: 'equipment', code: manualCode })}
              style={{ flex: 1 }}
            />
            {canCheckInPasses ? (
              <Button
                title="Gate pass"
                icon="ticket-outline"
                variant="secondary"
                disabled={!manualCode}
                onPress={() => route({ kind: 'pass', token: manualCode })}
                style={{ flex: 1 }}
              />
            ) : null}
          </Row>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraWrap: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.navyDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPaused: { backgroundColor: colors.navyDark },
  frame: {
    width: '62%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: radius.lg,
  },
  noticeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,28,61,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  noticeTitle: { color: colors.white, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  noticeBody: { color: '#d5dbf0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  permTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  hintTitle: { fontSize: 15, fontWeight: '700', color: colors.navy },
});
