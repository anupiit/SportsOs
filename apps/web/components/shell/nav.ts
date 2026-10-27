import type { Permission } from '@sportsos/shared';
import {
  BarChart3,
  Bell,
  CalendarCheck,
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  Network,
  Package,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden unless the user holds this permission. */
  permission?: Permission;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/facilities', label: 'Facilities', icon: MapPin },
      { href: '/bookings', label: 'Bookings', icon: CalendarCheck },
      { href: '/attendance', label: 'Attendance', icon: ShieldCheck },
      { href: '/inventory', label: 'Inventory', icon: Package },
      { href: '/clubs', label: 'Clubs', icon: Users },
      { href: '/events', label: 'Tournaments', icon: Trophy },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read' },
      { href: '/assistant', label: 'SportsOS AI', icon: Sparkles },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { href: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
      { href: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users & roles', icon: UserCog, permission: 'users:read' },
      { href: '/inventory/audit', label: 'Audit ledger', icon: ScrollText, permission: 'audit:read' },
      { href: '/organisation', label: 'Organisation', icon: Network },
    ],
  },
];
