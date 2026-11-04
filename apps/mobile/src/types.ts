/**
 * Mirrors the subset of `packages/shared/src/types.ts`, `roles.ts` and
 * `permissions.ts` that the mobile client uses. apps/mobile is not an npm
 * workspace (it keeps Expo's React version isolated), so it cannot import
 * @sportsos/shared directly — keep these in sync with the shared package.
 */

export type ISODate = string;

/** Every QR SportsOS prints is a sportsos:// URI (docs/API.md → "QR payloads"). */
export const QR_PREFIX = {
  equipment: 'sportsos://equipment/', // + <qrCode>  → GET /inventory/items/by-qr/<qrCode>
  pass: 'sportsos://pass/', // + <token>          → POST /bookings/check-in { token }
  checkin: 'sportsos://checkin?session=', // + <sessionId> → open check-in (OTP still required)
} as const;

// ---------------------------------------------------------------- roles & permissions
export type Role =
  | 'DIRECTOR'
  | 'DEAN_SW'
  | 'SPEC_PRESIDENT'
  | 'SPORTS_OFFICER'
  | 'GENERAL_SECRETARY'
  | 'EVENT_COMMITTEE'
  | 'COACH'
  | 'GROUND_STAFF'
  | 'EQUIPMENT_MANAGER'
  | 'SECURITY_STAFF'
  | 'OPERATIONS_STAFF'
  | 'SPORTS_COUNCIL'
  | 'SPORT_COORDINATOR'
  | 'HOSTEL_SECRETARY'
  | 'MEDIA_NOMINEE'
  | 'CLUB_MEMBER'
  | 'STUDENT'
  | 'ADMIN';

export const ROLE_LABELS: Record<Role, string> = {
  DIRECTOR: 'Director, IIT (ISM) Dhanbad',
  DEAN_SW: "Dean (Students' Welfare)",
  SPEC_PRESIDENT: 'President, SPEC',
  SPORTS_OFFICER: 'Sports Officer (PESO)',
  GENERAL_SECRETARY: 'General Secretary',
  EVENT_COMMITTEE: 'Event Committee',
  COACH: 'Coach',
  GROUND_STAFF: 'Ground Staff',
  EQUIPMENT_MANAGER: 'Equipment Manager',
  SECURITY_STAFF: 'Security Staff',
  OPERATIONS_STAFF: 'Operations Staff',
  SPORTS_COUNCIL: 'Sports Council',
  SPORT_COORDINATOR: 'Sports-specific Coordinator',
  HOSTEL_SECRETARY: 'Hostel Sports Secretary',
  MEDIA_NOMINEE: 'Tech, Media & Content Nominee',
  CLUB_MEMBER: 'Club Member',
  STUDENT: 'Casual Student',
  ADMIN: 'System Administrator',
};

/**
 * Permissions the mobile client checks (names from packages/shared/src/permissions.ts).
 * The API enforces every one of them; the app only uses them to hide controls.
 */
export type Permission =
  | 'booking.verify'
  | 'inventory.issue'
  | 'inventory.return'
  | 'attendance.manage'
  | 'analytics.view'
  | (string & {});

// ---------------------------------------------------------------- enums
export type FacilityType = 'GROUND' | 'COURT' | 'INDOOR_HALL' | 'POOL' | 'GYM' | 'TRACK';
export type FacilityStatus = 'OPEN' | 'MAINTENANCE' | 'CLOSED';
export type BookingType = 'CASUAL' | 'CLUB_PRACTICE' | 'EVENT' | 'MAINTENANCE';
export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'LEFT';
export type MembershipRole = 'MEMBER' | 'CAPTAIN' | 'VICE_CAPTAIN';
export type SessionStatus = 'ACTIVE' | 'CLOSED';
export type AttemptOutcome =
  | 'ACCEPTED'
  | 'BAD_OTP'
  | 'OUT_OF_GEOFENCE'
  | 'LOW_ACCURACY'
  | 'DUPLICATE'
  | 'DEVICE_REUSED'
  | 'SESSION_CLOSED'
  | 'NOT_ELIGIBLE';
export type IssueStatus = 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST';
export type NotificationType = 'INFO' | 'ALERT' | 'APPROVAL' | 'REMINDER';

// ---------------------------------------------------------------- auth
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  admissionNo: string | null;
  hostel: string | null;
}

export interface User extends UserSummary {
  phone: string | null;
  isActive: boolean;
  createdAt: ISODate;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  permissions: Permission[];
}

export interface MeResponse {
  user: User;
  permissions: Permission[];
}

// ---------------------------------------------------------------- facilities & bookings
export interface Facility {
  id: string;
  name: string;
  code: string;
  type: FacilityType;
  sports: string[];
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  status: FacilityStatus;
  statusNote: string | null;
  openMinute: number;
  closeMinute: number;
  slotMinutes: number;
  capacity: number;
  requiresApproval: boolean;
  updatedAt: ISODate;
}

export interface Booking {
  id: string;
  facilityId: string;
  facility?: Pick<Facility, 'id' | 'name' | 'code'>;
  userId: string;
  user?: UserSummary;
  clubId: string | null;
  club?: { id: string; name: string } | null;
  start: ISODate;
  end: ISODate;
  purpose: string;
  type: BookingType;
  status: BookingStatus;
  participants: number;
  rejectionReason: string | null;
  checkedInAt: ISODate | null;
  createdAt: ISODate;
}

export interface AvailabilitySlot {
  start: ISODate;
  end: ISODate;
  available: boolean;
  booking: Pick<Booking, 'id' | 'purpose' | 'type' | 'status'> | null;
}

export interface FacilityAvailability {
  facility: Facility;
  date: string;
  slots: AvailabilitySlot[];
}

export interface BookingPass {
  bookingId: string;
  token: string;
  qrDataUrl: string;
}

// ---------------------------------------------------------------- clubs
export interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  status: MembershipStatus;
  role: MembershipRole;
  joinedAt: ISODate;
}

export interface Club {
  id: string;
  name: string;
  sport: string;
  description: string | null;
  coachId: string | null;
  memberCount: number;
  myMembership?: ClubMembership | null;
  createdAt: ISODate;
}

// ---------------------------------------------------------------- attendance
export interface AttendanceSession {
  id: string;
  title: string;
  facilityId: string;
  facility?: Pick<Facility, 'id' | 'name' | 'latitude' | 'longitude' | 'geofenceRadiusM'>;
  clubId: string | null;
  club?: { id: string; name: string } | null;
  createdById: string;
  startsAt: ISODate;
  endsAt: ISODate;
  status: SessionStatus;
  otpStepSeconds: number;
  attendeeCount: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  session?: Pick<AttendanceSession, 'id' | 'title' | 'startsAt'>;
  userId: string;
  checkedInAt: ISODate;
  /** null for MANUAL corrections made by staff */
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  distanceM: number | null;
  method?: 'VERIFIED' | 'MANUAL';
}

export interface CheckInRequest {
  sessionId: string;
  otp: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  deviceId?: string;
}

export interface CheckInResult {
  outcome: AttemptOutcome;
  message: string;
  distanceM: number | null;
  record: AttendanceRecord | null;
}

// ---------------------------------------------------------------- inventory
export interface EquipmentItem {
  id: string;
  name: string;
  sport: string;
  category: string;
  qrCode: string;
  totalQty: number;
  availableQty: number;
  issuedQty: number;
  damagedQty: number;
  minStock: number;
  location: string | null;
  lowStock: boolean;
  updatedAt: ISODate;
}

export interface EquipmentIssue {
  id: string;
  equipmentId: string;
  equipment?: Pick<EquipmentItem, 'id' | 'name' | 'sport'>;
  borrowerId: string;
  borrower?: UserSummary;
  issuedById: string;
  quantity: number;
  issuedAt: ISODate;
  dueAt: ISODate;
  returnedAt: ISODate | null;
  returnedQty: number | null;
  damagedQty: number | null;
  status: IssueStatus;
  note: string | null;
}

// ---------------------------------------------------------------- engagement & analytics
export interface Notification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  link: string | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

export interface OverviewKpis {
  activeUsers: number;
  facilities: { total: number; open: number; maintenance: number; closed: number };
  bookingsToday: number;
  pendingApprovals: number;
  attendanceThisWeek: number;
  attendanceChangePct: number | null;
  equipmentIssued: number;
  lowStockItems: number;
  overdueIssues: number;
  openComplaints: number;
  liveTournaments: number;
  rejectedCheckInsThisWeek: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
