const TZ = 'Asia/Kolkata';
const LOCALE = 'en-IN';

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const numberFmt = new Intl.NumberFormat(LOCALE);
const compactFmt = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : '—';
}

export function fmtDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '—';
}

export function fmtShortDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? shortDateFmt.format(d) : '—';
}

export function fmtWeekday(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? weekdayFmt.format(d) : '—';
}

export function fmtTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : '—';
}

export function fmtTimeRange(start: string, end: string): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function fmtNumber(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '—' : numberFmt.format(n);
}

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.abs(n) < 10000 ? numberFmt.format(Math.round(n * 10) / 10) : compactFmt.format(n);
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function fmtRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(d);
}

/** Minutes after midnight → "06:00". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(offsetDays = 0): string {
  return isoDateFmt.format(new Date(Date.now() + offsetDays * 86400000));
}

export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Value for <input type="datetime-local"> from a Date (browser local time). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO string. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function initials(name: string): string {
  return name
    .replace(/^\[[A-Z]+\]\s*/, '') // "[DEMO] …" label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
