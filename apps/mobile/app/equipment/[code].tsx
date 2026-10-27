import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { useAuth } from '../../src/auth';
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorBanner,
  Field,
  KeyValue,
  Loading,
  Muted,
  Row,
  Screen,
  SectionTitle,
} from '../../src/components/ui';
import { formatDate, formatDateTime, issueTone, titleCase } from '../../src/format';
import { useApi } from '../../src/hooks/useApi';
import { colors, radius, space } from '../../src/theme';
import type { EquipmentIssue, EquipmentItem } from '../../src/types';

type ItemDetail = EquipmentItem & { issues: EquipmentIssue[] };

const DUE_OPTIONS: { label: string; due: () => Date }[] = [
  {
    label: 'Today 9 PM',
    due: () => {
      const d = new Date();
      d.setHours(21, 0, 0, 0);
      return d.getTime() > Date.now() ? d : new Date(Date.now() + 2 * 3600_000);
    },
  },
  { label: 'Tomorrow', due: () => endOfDayIn(1) },
  { label: '3 days', due: () => endOfDayIn(3) },
  { label: '1 week', due: () => endOfDayIn(7) },
];

function endOfDayIn(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(21, 0, 0, 0);
  return d;
}

export default function EquipmentScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, can } = useAuth();
  const canIssue = can('inventory:issue');

  const lookup = useApi<EquipmentItem>(code ? `/inventory/items/by-qr/${encodeURIComponent(code)}` : null);
  const detail = useApi<ItemDetail>(lookup.data ? `/inventory/items/${lookup.data.id}` : null);
  const item: EquipmentItem | undefined = detail.data ?? lookup.data;

  const refreshAll = async () => {
    await lookup.refresh();
    await detail.reload();
  };

  if (lookup.loading) return <Loading label="Looking up equipment…" />;
  if (lookup.error || !item) {
    return (
      <Screen>
        <ErrorBanner message={lookup.error ?? 'Equipment not found.'} onRetry={lookup.refresh} />
        <Muted>Code: {code}</Muted>
      </Screen>
    );
  }

  const openIssues = (detail.data?.issues ?? []).filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE');
  const myIssues = (detail.data?.issues ?? []).filter((i) => i.borrowerId === user?.id);
  const pctAvailable = item.totalQty > 0 ? item.availableQty / item.totalQty : 0;

  return (
    <Screen refreshing={lookup.refreshing} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: item.name }} />

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Muted>
              {item.sport} · {item.category}
            </Muted>
          </View>
          {item.lowStock ? <Badge label="Low stock" tone="danger" /> : <Badge label="In stock" tone="success" />}
        </Row>
        <View style={styles.stockBar}>
          <View style={[styles.stockFill, { width: `${Math.round(pctAvailable * 100)}%` }, item.lowStock && { backgroundColor: colors.terracotta }]} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label="Available" value={item.availableQty} />
          <Stat label="Issued" value={item.issuedQty} />
          <Stat label="Damaged" value={item.damagedQty} />
          <Stat label="Total" value={item.totalQty} />
        </Row>
        <Divider />
        <KeyValue label="Location" value={item.location ?? '—'} />
        <KeyValue label="Minimum stock" value={String(item.minStock)} />
      </Card>

      {canIssue ? (
        <>
          <IssueForm item={item} onIssued={refreshAll} />
          <SectionTitle>Out on loan ({openIssues.length})</SectionTitle>
          {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
          {openIssues.length === 0 ? (
            <Card>
              <EmptyState icon="checkmark-done-outline" title="Nothing outstanding" body="Every unit of this item is back in the store." />
            </Card>
          ) : (
            openIssues.map((issue) => <OpenIssueCard key={issue.id} issue={issue} onReturned={refreshAll} />)
          )}
        </>
      ) : (
        <>
          <Card>
            <Row>
              <Ionicons name="information-circle-outline" size={18} color={colors.blue} />
              <Text style={styles.cardTitle}>Want to borrow this?</Text>
            </Row>
            <Muted>
              Ask the equipment manager{item.location ? ` at ${item.location}` : ''} to scan this label and issue it to you. Returns are
              logged against your name.
            </Muted>
          </Card>
          {myIssues.length > 0 ? (
            <>
              <SectionTitle>Your borrowings</SectionTitle>
              <Card>
                {myIssues.map((i) => (
                  <KeyValue
                    key={i.id}
                    label={`${i.quantity} × issued ${formatDate(i.issuedAt)}`}
                    value={<Badge label={i.status === 'ISSUED' ? `Due ${formatDate(i.dueAt)}` : titleCase(i.status)} tone={issueTone(i.status)} />}
                  />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <Row>
      <Pressable
        style={[styles.stepBtn, value <= min && { opacity: 0.4 }]}
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        accessibilityLabel="Decrease"
      >
        <Ionicons name="remove" size={18} color={colors.navy} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        style={[styles.stepBtn, value >= max && { opacity: 0.4 }]}
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
        accessibilityLabel="Increase"
      >
        <Ionicons name="add" size={18} color={colors.navy} />
      </Pressable>
    </Row>
  );
}

function IssueForm({ item, onIssued }: { item: EquipmentItem; onIssued: () => Promise<void> }) {
  const [borrower, setBorrower] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [dueIdx, setDueIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outOfStock = item.availableQty < 1;

  async function issue() {
    if (!borrower.trim()) {
      setError('Enter the borrower’s institute email or admission number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<EquipmentIssue>('/inventory/issues', {
        method: 'POST',
        body: {
          qrCode: item.qrCode,
          borrower: borrower.trim(),
          quantity,
          dueAt: DUE_OPTIONS[dueIdx].due().toISOString(),
        },
      });
      Alert.alert('Issued', `${res.quantity} × ${item.name} to ${res.borrower?.name ?? borrower.trim()}, due ${formatDateTime(res.dueAt)}.`);
      setBorrower('');
      setQuantity(1);
      await onIssued();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.cardTitle}>Issue to a student</Text>
      {outOfStock ? (
        <Muted>No units available to issue right now.</Muted>
      ) : (
        <>
          <Field
            label="Borrower"
            value={borrower}
            onChangeText={setBorrower}
            placeholder="22je0143 or name@iitism.ac.in"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.label}>Quantity</Text>
            <Stepper value={quantity} min={1} max={item.availableQty} onChange={setQuantity} />
          </Row>
          <Text style={styles.label}>Due back</Text>
          <View style={styles.chips}>
            {DUE_OPTIONS.map((o, i) => (
              <Chip key={o.label} label={o.label} selected={i === dueIdx} onPress={() => setDueIdx(i)} />
            ))}
          </View>
          {error ? <ErrorBanner message={error} /> : null}
          <Button title={`Issue ${quantity}`} icon="arrow-up-circle-outline" loading={busy} onPress={() => void issue()} />
        </>
      )}
    </Card>
  );
}

function OpenIssueCard({ issue, onReturned }: { issue: EquipmentIssue; onReturned: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [returned, setReturned] = useState(issue.quantity);
  const [damaged, setDamaged] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overdue = issue.status === 'OVERDUE' || new Date(issue.dueAt).getTime() < Date.now();

  async function receive() {
    setBusy(true);
    setError(null);
    try {
      await api<EquipmentIssue>(`/inventory/issues/${issue.id}/return`, {
        method: 'POST',
        body: { returnedQty: returned, damagedQty: damaged, note: note.trim() || undefined },
      });
      setOpen(false);
      await onReturned();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{issue.borrower?.name ?? 'Borrower'}</Text>
          <Muted>
            {issue.borrower?.admissionNo ? `${issue.borrower.admissionNo.toUpperCase()} · ` : ''}
            {issue.quantity} unit{issue.quantity === 1 ? '' : 's'} · issued {formatDate(issue.issuedAt)}
          </Muted>
        </View>
        <Badge label={overdue ? 'Overdue' : `Due ${formatDate(issue.dueAt)}`} tone={overdue ? 'danger' : 'info'} />
      </Row>
      {open ? (
        <>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.label}>Returned</Text>
            <Stepper
              value={returned}
              min={0}
              max={issue.quantity}
              onChange={(v) => {
                setReturned(v);
                setDamaged((d) => Math.min(d, v));
              }}
            />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.label}>…of which damaged</Text>
            <Stepper value={damaged} min={0} max={returned} onChange={setDamaged} />
          </Row>
          {returned < issue.quantity ? (
            <Muted style={{ color: colors.terracottaDark }}>{issue.quantity - returned} unit(s) will be recorded as not returned.</Muted>
          ) : null}
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. torn net" />
          {error ? <ErrorBanner message={error} /> : null}
          <Row>
            <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button title="Receive" icon="arrow-down-circle-outline" loading={busy} onPress={() => void receive()} style={{ flex: 1 }} />
          </Row>
        </>
      ) : (
        <Button title="Receive return" icon="arrow-down-circle-outline" variant="secondary" compact onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '800', color: colors.navy },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.navy },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  stockBar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.blueSoft, overflow: 'hidden', marginTop: space.xs },
  stockFill: { height: '100%', backgroundColor: colors.blue, borderRadius: radius.pill },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.navy },
  statLabel: { fontSize: 12, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  stepValue: { minWidth: 32, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
});
