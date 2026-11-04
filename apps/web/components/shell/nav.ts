import type { Permission } from '@sportsos/shared';
import {
  BarChart3,
  Bell,
  BookUser,
  CalendarCheck,
  ClipboardList,
  DatabaseZap,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Megaphone,
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
  /** Hidden unless the user holds at least one of these (in the active role). The API enforces the same rule. */
  anyOf?: Permission[];
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
      { href: '/facilities', label: 'Facilities', icon: MapPin, anyOf: ['facility.view'] },
      { href: '/bookings', label: 'Bookings', icon: CalendarCheck, anyOf: ['booking.view_own', 'booking.view_all', 'booking.approve'] },
      { href: '/attendance', label: 'Attendance', icon: ShieldCheck, anyOf: ['attendance.mark', 'attendance.manage', 'attendance.view_team'] },
      { href: '/inventory', label: 'Inventory', icon: Package, anyOf: ['inventory.view'] },
      { href: '/clubs', label: 'Clubs', icon: Users, anyOf: ['club.view'] },
      { href: '/events', label: 'Tournaments', icon: Trophy, anyOf: ['event.view'] },
      { href: '/tasks', label: 'Tasks', icon: ClipboardList, anyOf: ['task.view_assigned', 'task.manage'] },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, anyOf: ['analytics.view'] },
      { href: '/assistant', label: 'SportsOS AI', icon: Sparkles, anyOf: ['ai.use'] },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { href: '/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/complaints', label: 'Complaints', icon: MessageSquareWarning, anyOf: ['complaint.view_own', 'complaint.view_all'] },
      { href: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users', icon: UserCog, anyOf: ['user.view'] },
      { href: '/admin/roles', label: 'Roles & permissions', icon: KeyRound, anyOf: ['role.assign', 'role.approve', 'role.manage_permissions'] },
      { href: '/admin/institution', label: 'Institutional data', icon: DatabaseZap, anyOf: ['institution.import'] },
      { href: '/inventory/audit', label: 'Audit ledger', icon: ScrollText, anyOf: ['audit.view'] },
      { href: '/directory', label: 'Directory', icon: BookUser, anyOf: ['institution.view'] },
      { href: '/organisation', label: 'Organisation', icon: Network },
    ],
  },
];
