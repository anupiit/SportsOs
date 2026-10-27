import type { Tone } from './theme';
import type { AttemptOutcome, BookingStatus, FacilityStatus, IssueStatus } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function formatRange(start: string, end: string): string {
  return `${formatDate(start)} · ${formatTime(start)}–${formatTime(end)}`;
}

export function minutesToHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** YYYY-MM-DD in the device's local time zone (what the availability endpoint expects). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function metres(m: number | null | undefined): string {
  if (m === null || m === undefined || Number.isNaN(m)) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function bookingTone(status: BookingStatus): Tone {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
      return 'danger';
    case 'COMPLETED':
      return 'info';
    default:
      return 'neutral';
  }
}

export function facilityTone(status: FacilityStatus): Tone {
  return status === 'OPEN' ? 'success' : status === 'MAINTENANCE' ? 'warning' : 'neutral';
}

export function issueTone(status: IssueStatus): Tone {
  return status === 'RETURNED' ? 'success' : status === 'ISSUED' ? 'info' : 'danger';
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Plain-language explanation of a check-in outcome. */
export function outcomeExplanation(outcome: AttemptOutcome, distanceM: number | null, accuracyM: number | null): string {
  switch (outcome) {
    case 'ACCEPTED':
      return distanceM !== null
        ? `Verified ${metres(distanceM)} from the facility centre.`
        : 'Your attendance has been recorded.';
    case 'BAD_OTP':
      return "That code didn't match. Codes change every 30 seconds — enter the one your coach is showing right now.";
    case 'OUT_OF_GEOFENCE':
      return distanceM !== null
        ? `You're ${metres(distanceM)} from the facility, outside its check-in zone. Move onto the ground or court and try again.`
        : "You're outside the facility's check-in zone. Move closer and try again.";
    case 'LOW_ACCURACY':
      return `Your GPS fix is too imprecise${accuracyM !== null ? ` (±${metres(accuracyM)})` : ''}. Step into open sky, turn on precise location, and retry.`;
    case 'DUPLICATE':
      return "You've already checked in to this session.";
    case 'DEVICE_REUSED':
      return 'This phone was already used to check in another student for this session. Each student must check in from their own device.';
    case 'SESSION_CLOSED':
      return 'This session has closed and is no longer accepting check-ins.';
    case 'NOT_ELIGIBLE':
      return 'This session is only open to active members of its club.';
  }
}

export function outcomeTitle(outcome: AttemptOutcome): string {
  switch (outcome) {
    case 'ACCEPTED':
      return "You're checked in";
    case 'BAD_OTP':
      return 'Wrong code';
    case 'OUT_OF_GEOFENCE':
      return 'Too far from the facility';
    case 'LOW_ACCURACY':
      return 'Location not precise enough';
    case 'DUPLICATE':
      return 'Already checked in';
    case 'DEVICE_REUSED':
      return 'Device already used';
    case 'SESSION_CLOSED':
      return 'Session closed';
    case 'NOT_ELIGIBLE':
      return 'Not eligible';
  }
}

/** Great-circle distance in metres (haversine) — used for a client-side preview only; the API decides. */
export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
