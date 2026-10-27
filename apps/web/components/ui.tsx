'use client';

import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'warn';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover border border-transparent',
  accent: 'bg-accent text-white hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-2',
  ghost: 'bg-transparent text-text-2 hover:bg-surface-2 hover:text-text border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border border-transparent',
  warn: 'bg-warn text-white hover:opacity-90 border border-transparent',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap',
        'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Card

export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={clsx('card', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 pb-5', className)}>{children}</div>;
}

// ---------------------------------------------------------------- Page header

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-text-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badge

export type Tone = 'neutral' | 'blue' | 'navy' | 'green' | 'amber' | 'red' | 'terracotta';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2 border-border',
  blue: 'bg-accent-soft text-accent-ink border-transparent',
  navy: 'bg-primary text-primary-fg border-transparent',
  green: 'bg-good-soft text-good-ink border-transparent',
  amber: 'bg-amber-soft text-amber-ink border-transparent',
  red: 'bg-danger-soft text-danger-ink border-transparent',
  terracotta: 'bg-warn-soft text-warn-ink border-transparent',
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Form fields

const controlBase =
  'rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60';

/** Full width unless the caller sets an explicit width (Tailwind can't resolve w-full vs w-44 by class order). */
const widthOf = (className?: string) => (className && /(^|\s)w-/.test(className) ? '' : 'w-full');

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  required,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-semibold text-text-2">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-ink">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(controlBase, widthOf(className), 'h-9', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(controlBase, widthOf(className), 'h-9 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(controlBase, widthOf(className), 'min-h-[88px] py-2', className)} {...rest} />;
  },
);

export function Checkbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-border accent-[var(--accent)]"
      />
      <span>
        <span className="text-text">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- Modal & Drawer

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-text">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-surface shadow-[var(--shadow-lg)]',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-text">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- Tabs

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx('flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border', className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={clsx(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={clsx(
                  'rounded-full px-1.5 text-[11px] tabular',
                  active ? 'bg-accent text-white' : 'bg-surface-2 text-text-2',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Segmented control

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            o.value === value ? 'bg-primary text-primary-fg' : 'text-text-2 hover:bg-surface-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Feedback

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-muted', className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>
      )}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Could not load data.';
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-soft bg-danger-soft/40 px-4 py-6 text-center">
      <p className="text-sm text-danger-ink">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'blue',
  icon,
  title,
  children,
  className,
}: {
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'terracotta';
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    blue: 'bg-accent-soft text-accent-ink',
    green: 'bg-good-soft text-good-ink',
    amber: 'bg-amber-soft text-amber-ink',
    red: 'bg-danger-soft text-danger-ink',
    terracotta: 'bg-warn-soft text-warn-ink',
  };
  return (
    <div className={clsx('flex gap-2.5 rounded-lg px-3.5 py-3 text-sm', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-[13px] opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Stat tile

export function StatTile({
  label,
  value,
  sub,
  delta,
  icon,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Signed percentage; `goodWhenUp` decides the color. */
  delta?: { value: number | null; goodWhenUp?: boolean; period?: string };
  icon?: ReactNode;
  tone?: 'neutral' | 'warn' | 'danger' | 'good';
  href?: string;
}) {
  const toneRing = {
    neutral: '',
    warn: 'ring-1 ring-inset ring-[var(--warn)]/40',
    danger: 'ring-1 ring-inset ring-[var(--danger)]/40',
    good: '',
  };
  let deltaEl: ReactNode = null;
  if (delta && delta.value !== null && delta.value !== undefined) {
    const up = delta.value >= 0;
    const good = delta.goodWhenUp === false ? !up : up;
    deltaEl = (
      <span className={clsx('text-xs font-semibold', good ? 'text-good-ink' : 'text-danger-ink')}>
        {up ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}%
        {delta.period && <span className="ml-1 font-normal text-muted">{delta.period}</span>}
      </span>
    );
  }
  const body = (
    <div className={clsx('card h-full px-4 py-3.5', toneRing[tone], href && 'transition-colors hover:border-accent')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-text">{value}</div>
      <div className="mt-1 flex min-h-4 flex-wrap items-center gap-2 text-xs text-muted">
        {deltaEl}
        {sub}
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block h-full">
        {body}
      </a>
    );
  }
  return body;
}

// ---------------------------------------------------------------- Avatar

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-14 text-lg' };
  const text = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-ink',
        sizes[size],
      )}
      aria-hidden
    >
      {text}
    </span>
  );
}
