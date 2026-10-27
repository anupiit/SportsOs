import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, toneColors, type Tone } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------- layout

interface ScreenProps {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Scrollable screen body with optional pull-to-refresh. Headers come from the navigator. */
export function Screen({ children, refreshing, onRefresh, contentStyle }: ScreenProps) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

// ---------------------------------------------------------------- text bits

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text style={styles.kvValue}>{value}</Text> : value}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- controls

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, compact }: ButtonProps) {
  const v = buttonVariants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !inactive && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={v.fg} /> : null}
          <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.blue, fg: colors.white, border: colors.blue },
  secondary: { bg: colors.card, fg: colors.navy, border: colors.border },
  danger: { bg: colors.terracottaSoft, fg: colors.terracottaDark, border: colors.terracottaSoft },
  ghost: { bg: 'transparent', fg: colors.blue, border: 'transparent' },
};

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function Field({ label, hint, style, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} style={[styles.input, style]} {...props} />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** A pressable list row with a leading icon and trailing chevron. */
export function ListItem({
  title,
  subtitle,
  icon,
  right,
  onPress,
  tone = 'info',
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  right?: ReactNode;
  onPress?: () => void;
  tone?: Tone;
}) {
  const t = toneColors[tone];
  const body = (
    <View style={styles.listItem}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={18} color={t.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

// ---------------------------------------------------------------- states

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.blue} size="large" />
      {label ? <Text style={[styles.muted, { marginTop: space.sm }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.terracottaDark} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button title="Retry" variant="ghost" compact onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={28} color={colors.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={[styles.muted, { textAlign: 'center' }]}>{body}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: space.lg, gap: space.md, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: space.sm,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: space.md },
  kvLabel: { color: colors.muted, fontSize: 14 },
  kvValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextCompact: { fontSize: 14 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.navy },
  fieldHint: { fontSize: 12, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.navy, fontWeight: '600', fontSize: 14 },
  chipTextSelected: { color: colors.white },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  listIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  listSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: colors.bg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.terracottaSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { flex: 1, color: colors.terracottaDark, fontSize: 14 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.xs },
});
