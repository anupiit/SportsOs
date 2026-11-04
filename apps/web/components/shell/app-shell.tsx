'use client';

import { roleLabel, type Role } from '@sportsos/shared';
import clsx from 'clsx';
import { Bell, ChevronDown, LogOut, Menu, Monitor, Moon, Sun, User as UserIcon, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { useToast } from '@/components/toast';
import { Avatar, Spinner } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { NAV } from './nav';
import { applyTheme, readTheme, type ThemeChoice } from './theme';

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="1.8" />
          <path d="M3.5 12h17M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9M12 3c-2.6 2.4-4 5.5-4 9s1.4 6.6 4 9" fill="none" stroke="#c8735a" strokeWidth="1.6" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-white">SportsOS</div>
          <div className="text-[10px] font-medium tracking-wide text-sidebar-text uppercase">IIT (ISM) Dhanbad</div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();

  // Longest matching href wins, so /inventory/audit doesn't also light up /inventory.
  const allHrefs = NAV.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-text" aria-label="Main navigation">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((section) => {
          const items = section.items.filter((i) => !i.anyOf || i.anyOf.some((p) => can(p)));
          if (!items.length) return null;
          return (
            <div key={section.title} className="mt-5 first:mt-2">
              <div className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-[0.08em] text-sidebar-text/70 uppercase">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={clsx(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-sidebar-2 text-sidebar-active shadow-[inset_3px_0_0_#c8735a]'
                            : 'hover:bg-sidebar-2/60 hover:text-sidebar-active',
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-sidebar-text/70">
        Sports &amp; Physical Education Cell
      </div>
    </nav>
  );
}

/**
 * Lets a user who holds several roles act as one of them. Narrowing is enforced
 * by the API (X-Active-Role is checked against the user's real assignments).
 */
function RoleSwitcher() {
  const { heldRoles, activeRole, setActiveRole } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (heldRoles.length < 2) return null;
  return (
    <label className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
      <span>Acting as</span>
      <select
        className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-text"
        value={activeRole ?? ''}
        disabled={busy}
        aria-label="Active role"
        onChange={async (e) => {
          setBusy(true);
          try {
            await setActiveRole((e.target.value || null) as Role | null);
            toast.success(e.target.value ? `Acting as ${roleLabel(e.target.value as Role)}` : 'Using all of your roles');
          } catch (err) {
            toast.error(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="">All my roles</option>
        {heldRoles.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </select>
    </label>
  );
}

function NotificationBell() {
  const { data } = useApi<{ count: number }>('/notifications/unread-count', undefined, { refreshInterval: 30000 });
  const count = data?.count ?? 0;
  return (
    <Link
      href="/notifications"
      className="relative rounded-lg p-2 text-text-2 hover:bg-surface-2 hover:text-text"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] leading-4 font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  useEffect(() => setTheme(readTheme()), []);
  const options: { value: ThemeChoice; icon: ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun className="size-3.5" />, label: 'Light' },
    { value: 'system', icon: <Monitor className="size-3.5" />, label: 'System' },
    { value: 'dark', icon: <Moon className="size-3.5" />, label: 'Dark' },
  ];
  return (
    <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={o.label}
          onClick={() => {
            setTheme(o.value);
            applyTheme(o.value);
          }}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs',
            theme === o.value ? 'bg-surface-2 text-text' : 'text-muted hover:text-text',
          )}
        >
          {o.icon}
          <span className="sr-only sm:not-sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function UserMenu() {
  const { user, logout, activeRole, heldRoles } = useAuth();
  const shownRole = activeRole ?? user?.role;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 hover:bg-surface-2"
      >
        <Avatar name={user.name} size="sm" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[160px] truncate text-sm font-medium text-text">{user.name}</span>
          <span className="block max-w-[160px] truncate text-[11px] text-muted">{shownRole ? roleLabel(shownRole) : ''}</span>
        </span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-border px-2 pt-1 pb-2.5">
            <p className="truncate text-sm font-semibold text-text">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-1 text-[11px] font-medium text-accent-ink">{heldRoles.map(roleLabel).join(' · ')}</p>
            {user.isDemo && <p className="mt-1 text-[10px] font-semibold tracking-wide text-warn-ink uppercase">Demo account</p>}
          </div>
          <div className="py-2">
            <ThemeSwitch />
          </div>
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <UserIcon className="size-4" /> My profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-danger-ink hover:bg-danger-soft"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  useEffect(() => setDrawer(false), [pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-64 shadow-[var(--shadow-lg)]">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="absolute top-4 right-3 z-10 rounded p-1 text-sidebar-text hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-text-2 hover:bg-surface-2 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <span className="text-sm font-bold text-text">SportsOS</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <RoleSwitcher />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export { Logo };
