import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, errorMessage } from '../src/api';
import { useAuth } from '../src/auth';
import { Button, ErrorBanner, Field } from '../src/components/ui';
import { colors, radius, space } from '../src/theme';

const DEMO = [
  { label: 'Student', email: '22je0143@iitism.ac.in' },
  { label: 'Coach', email: 'coach.football@iitism.ac.in' },
  { label: 'Equipment', email: 'equipment@iitism.ac.in' },
  { label: 'Security', email: 'security@iitism.ac.in' },
  { label: 'PESO', email: 'peso@iitism.ac.in' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your institute email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      // The root navigator's guard switches to the tabs once `user` is set.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Ionicons name="trophy" size={28} color={colors.white} />
            </View>
            <Text style={styles.title}>SportsOS</Text>
            <Text style={styles.subtitle}>Sports ERP for IIT (ISM) Dhanbad</Text>
          </View>

          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Sign in</Text>
            <Field
              label="Institute email"
              value={email}
              onChangeText={setEmail}
              placeholder="22je0143@iitism.ac.in"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              returnKeyType="next"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            {error ? <ErrorBanner message={error} /> : null}
            <Button title="Sign in" icon="log-in-outline" onPress={submit} loading={busy} />

            <View style={styles.demo}>
              <Text style={styles.demoTitle}>Demo accounts · password sportsos123</Text>
              <View style={styles.demoRow}>
                {DEMO.map((d) => (
                  <Text
                    key={d.email}
                    style={styles.demoChip}
                    onPress={() => {
                      setEmail(d.email);
                      setPassword('sportsos123');
                      setError(null);
                    }}
                  >
                    {d.label}
                  </Text>
                ))}
              </View>
            </View>
            <Text style={styles.server}>Server: {API_URL}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  scroll: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingTop: 48, paddingBottom: 36, gap: space.sm },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: '#c3cae6', fontSize: 15 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space.xl,
    gap: space.lg,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.navy },
  demo: { gap: space.sm, marginTop: space.sm },
  demoTitle: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  demoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  demoChip: {
    color: colors.navy,
    backgroundColor: colors.blueSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    fontWeight: '600',
    fontSize: 13,
  },
  server: { fontSize: 11, color: colors.faint, textAlign: 'center', marginTop: 'auto' },
});
