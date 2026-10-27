'use client';

import type { Facility, FacilityStatus, FacilityType } from '@sportsos/shared';
import { LocateFixed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { getPosition } from '@/lib/device';
import { FACILITY_TYPE_LABEL, SPORTS } from '@/lib/constants';
import { minutesToHHMM } from '@/lib/format';
import { revalidate } from '@/lib/hooks';

function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const EMPTY = {
  name: '',
  code: '',
  type: 'COURT' as FacilityType,
  sports: [] as string[],
  latitude: '23.8143',
  longitude: '86.4412',
  geofenceRadiusM: '60',
  open: '06:00',
  close: '21:00',
  slotMinutes: '60',
  capacity: '20',
  requiresApproval: false,
};

export function FacilityFormModal({
  open,
  onClose,
  facility,
}: {
  open: boolean;
  onClose: () => void;
  facility?: Facility | null;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fixAccuracy, setFixAccuracy] = useState<number | null>(null);

  async function fillFromGps() {
    setLocating(true);
    try {
      const fix = await getPosition();
      setForm((f) => ({ ...f, latitude: fix.latitude.toFixed(6), longitude: fix.longitude.toFixed(6) }));
      setFixAccuracy(fix.accuracyM);
      if (fix.accuracyM > 30) toast.warning('Weak GPS fix', `Accuracy ±${Math.round(fix.accuracyM)} m — stand in the open and retry for a tighter geofence.`);
    } catch (err) {
      toast.error('Could not get your location', errorMessage(err));
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setFixAccuracy(null);
    if (facility) {
      setForm({
        name: facility.name,
        code: facility.code,
        type: facility.type,
        sports: facility.sports,
        latitude: String(facility.latitude),
        longitude: String(facility.longitude),
        geofenceRadiusM: String(facility.geofenceRadiusM),
        open: minutesToHHMM(facility.openMinute),
        close: minutesToHHMM(facility.closeMinute),
        slotMinutes: String(facility.slotMinutes),
        capacity: String(facility.capacity),
        requiresApproval: facility.requiresApproval,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, facility]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const openMinute = hhmmToMinutes(form.open);
    const closeMinute = hhmmToMinutes(form.close);
    if (!form.name.trim() || !form.code.trim()) return toast.warning('Name and code are required');
    if (closeMinute <= openMinute) return toast.warning('Closing time must be after opening time');
    if (!form.sports.length) return toast.warning('Pick at least one sport');
    if (!/^[A-Z0-9-]{2,20}$/.test(form.code.trim().toUpperCase())) return toast.warning('Code must be 2–20 upper-case letters, digits or dashes');
    const body = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      type: form.type,
      sports: form.sports,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      geofenceRadiusM: Number(form.geofenceRadiusM),
      openMinute,
      closeMinute,
      slotMinutes: Number(form.slotMinutes),
      capacity: Number(form.capacity),
      requiresApproval: form.requiresApproval,
    };
    setBusy(true);
    try {
      if (facility) {
        const { code: _code, ...patch } = body; // code is immutable once created
        void _code;
        await api.patch(`/facilities/${facility.id}`, patch);
      } else await api.post('/facilities', body);
      toast.success(facility ? 'Facility updated' : 'Facility created', body.name);
      await revalidate('/facilities');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={facility ? `Edit ${facility.name}` : 'New facility'}
      description="Coordinates and radius define the attendance geofence."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {facility ? 'Save changes' : 'Create facility'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="f-name" required>
          <Input id="f-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Code" htmlFor="f-code" hint={facility ? 'Codes cannot be changed' : 'Upper-case letters, digits, dashes — e.g. BBALL-A'} required>
          <Input id="f-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} disabled={!!facility} maxLength={20} />
        </Field>
        <Field label="Type" htmlFor="f-type">
          <Select id="f-type" value={form.type} onChange={(e) => set('type', e.target.value as FacilityType)}>
            {(Object.keys(FACILITY_TYPE_LABEL) as FacilityType[]).map((t) => (
              <option key={t} value={t}>
                {FACILITY_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Capacity" htmlFor="f-cap">
          <Input id="f-cap" type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
        </Field>
        <Field label="Sports" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map((s) => {
              const on = form.sports.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('sports', on ? form.sports.filter((x) => x !== s) : [...form.sports, s])}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on ? 'border-accent bg-accent text-white' : 'border-border text-text-2 hover:bg-surface-2'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 sm:col-span-2">
          <Button size="sm" icon={<LocateFixed className="size-3.5" />} loading={locating} onClick={fillFromGps}>
            Use my current location
          </Button>
          <p className="text-xs text-muted">
            {fixAccuracy !== null
              ? `Filled from your device GPS · accuracy ±${Math.round(fixAccuracy)} m`
              : 'Stand at the centre of the ground to survey its geofence.'}
          </p>
        </div>
        <Field label="Latitude" htmlFor="f-lat">
          <Input id="f-lat" type="number" step="0.000001" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />
        </Field>
        <Field label="Longitude" htmlFor="f-lng">
          <Input id="f-lng" type="number" step="0.000001" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />
        </Field>
        <Field label="Geofence radius (m)" htmlFor="f-rad" hint="Check-ins beyond this distance are rejected">
          <Input id="f-rad" type="number" min={10} max={500} value={form.geofenceRadiusM} onChange={(e) => set('geofenceRadiusM', e.target.value)} />
        </Field>
        <Field label="Slot length" htmlFor="f-slot">
          <Select id="f-slot" value={form.slotMinutes} onChange={(e) => set('slotMinutes', e.target.value)}>
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Opens" htmlFor="f-open">
          <Input id="f-open" type="time" value={form.open} onChange={(e) => set('open', e.target.value)} />
        </Field>
        <Field label="Closes" htmlFor="f-close">
          <Input id="f-close" type="time" value={form.close} onChange={(e) => set('close', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            checked={form.requiresApproval}
            onChange={(v) => set('requiresApproval', v)}
            label="Casual bookings need approval"
            description="When off, casual slots on this facility are approved instantly."
          />
        </div>
      </div>
    </Modal>
  );
}

export function FacilityStatusModal({ facility, onClose }: { facility: Facility | null; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<FacilityStatus>('OPEN');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (facility) {
      setStatus(facility.status);
      setNote(facility.statusNote ?? '');
    }
  }, [facility]);

  async function submit() {
    if (!facility) return;
    setBusy(true);
    try {
      await api.patch(`/facilities/${facility.id}/status`, { status, note: note.trim() || undefined });
      toast.success('Status updated', `${facility.name} is now ${status.toLowerCase()}`);
      await revalidate('/facilities', '/analytics');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const options: { value: FacilityStatus; label: string; help: string }[] = [
    { value: 'OPEN', label: 'Open', help: 'Available for play and bookings' },
    { value: 'MAINTENANCE', label: 'Maintenance', help: 'Temporarily unavailable — e.g. resurfacing, waterlogging' },
    { value: 'CLOSED', label: 'Closed', help: 'Not available until further notice' },
  ];

  return (
    <Modal
      open={!!facility}
      onClose={onClose}
      title="Update ground status"
      description={facility?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Update status
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold text-text-2">Status</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
              status === o.value ? 'border-accent bg-accent-soft' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name="facility-status"
              className="mt-1 accent-[var(--accent)]"
              checked={status === o.value}
              onChange={() => setStatus(o.value)}
            />
            <span>
              <span className="block text-sm font-medium text-text">{o.label}</span>
              <span className="block text-xs text-muted">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Note for students" htmlFor="status-note" className="mt-4">
        <Textarea
          id="status-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Waterlogged after rain — expected to reopen by 5 PM"
        />
      </Field>
    </Modal>
  );
}
