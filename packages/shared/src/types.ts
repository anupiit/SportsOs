import type { Permission } from './permissions';
import type { Role } from './roles';
import type { ScopeType } from './permissions';

/**
 * Wire types returned by the SportsOS REST API. Dates are ISO-8601 strings.
 * The API (apps/api) is the source of truth; keep these in sync with it.
 */

export type ISODate = string;

// ---------------------------------------------------------------- enums
export type FacilityType = 'GROUND' | 'COURT' | 'INDOOR_HALL' | 'POOL' | 'GYM' | 'TRACK';
export type FacilityStatus = 'OPEN' | 'MAINTENANCE' | 'CLOSED';
export type BookingType = 'CASUAL' | 'CLUB_PRACTICE' | 'EVENT' | 'MAINTENANCE';
export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'LEFT';
export type MembershipRole = 'MEMBER' | 'CAPTAIN' | 'VICE_CAPTAIN';
export type SessionStatus = 'ACTIVE' | 'CLOSED';
export type AttemptOutcome = 'ACCEPTED' | 'BAD_OTP' | 'OUT_OF_GEOFENCE' | 'LOW_ACCURACY' | 'DUPLICATE' | 'DEVICE_REUSED' | 'SESSION_CLOSED' | 'NOT_ELIGIBLE';
export type IssueStatus = 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST';
export type TournamentFormat = 'SINGLE_ELIMINATION' | 'ROUND_ROBIN';
export type TournamentStatus = 'PROPOSED' | 'REJECTED' | 'DRAFT' | 'ONGOING' | 'COMPLETED';
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'BYE';
export type NotificationType = 'INFO' | 'ALERT' | 'APPROVAL' | 'REMINDER';
export type ComplaintCategory = 'FACILITY' | 'EQUIPMENT' | 'STAFF' | 'BOOKING' | 'SECURITY' | 'MAINTENANCE' | 'OTHER';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type AchievementLevel = 'HOSTEL' | 'INSTITUTE' | 'INTER_IIT' | 'STATE' | 'NATIONAL' | 'INTERNATIONAL';

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
  /** absent in directory views without user.update */
  phone?: string | null;
  isActive: boolean;
  /** synthetic seed/test account */
  isDemo?: boolean;
  createdAt: ISODate;
}

export interface SessionRole {
  assignmentId: string;
  role: Role;
  scopeType: ScopeType;
  scopeId: string;
  validUntil: ISODate | null;
}

export interface MeResponse {
  user: User;
  /** permissions in effect for the active role (or all held roles) */
  permissions: Permission[];
  activeRole: Role | null;
  heldRoles: Role[];
  roles: SessionRole[];
}

export interface AuthResponse extends MeResponse {
  accessToken: string;
}

export type AssignmentStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'REVOKED' | 'EXPIRED';

export interface RoleAssignment {
  id: string;
  userId: string;
  user?: UserSummary;
  role: Role;
  scopeType: ScopeType;
  scopeId: string;
  status: AssignmentStatus;
  validFrom: ISODate;
  validUntil: ISODate | null;
  reason: string | null;
  requestedBy?: { id: string; name: string } | null;
  decidedBy?: { id: string; name: string } | null;
  decidedAt: ISODate | null;
  decisionNote: string | null;
  revokedBy?: { id: string; name: string } | null;
  revokedAt: ISODate | null;
  revokeReason: string | null;
  createdAt: ISODate;
}

export interface RbacMatrix {
  roles: { role: Role; permissions: Permission[]; defaults: Permission[] }[];
  permissions: { key: Permission; description: string }[];
}

export type DataStatus = 'VERIFIED' | 'PENDING_VERIFICATION' | 'EXPIRED' | 'UNVERIFIED';
export type InstitutionalKind = 'PERSONNEL' | 'OFFICE_BEARER' | 'FACILITY' | 'SPORT';

export interface InstitutionalRecord {
  id: string;
  kind: InstitutionalKind;
  name: string;
  designation: string | null;
  roleHint: Role | null;
  department: string | null;
  email: string | null;
  phone?: string | null;
  sport: string | null;
  hostel: string | null;
  details: Record<string, string>;
  sourceUrl: string | null;
  sourceDocument: string | null;
  verifiedAt: ISODate | null;
  validUntil: ISODate | null;
  dataStatus: DataStatus;
  linkedUserId?: string | null;
  updatedAt: ISODate;
}

export type ImportAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'SKIP' | 'ERROR';

export interface ImportBatch {
  id: string;
  kind: InstitutionalKind;
  filename: string;
  sourceUrl: string | null;
  sourceDocument: string | null;
  mode: 'CREATE_ONLY' | 'UPSERT';
  status: 'PREVIEWED' | 'COMMITTED' | 'ROLLED_BACK' | 'FAILED';
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  createdBy?: { id: string; name: string };
  committedAt: ISODate | null;
  rolledBackAt: ISODate | null;
  createdAt: ISODate;
  items?: { id: string; rowNumber: number; action: ImportAction; message: string | null; after: Record<string, unknown> | null; before: Record<string, unknown> | null }[];
}

export type AnnouncementStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  clubId: string | null;
  audienceRoles: Role[];
  authorId: string;
  author?: { id: string; name: string };
  status: AnnouncementStatus;
  reviewedBy?: { id: string; name: string } | null;
  reviewNote: string | null;
  publishedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export interface OperationalTask {
  id: string;
  title: string;
  description: string | null;
  kind: 'MAINTENANCE' | 'OPERATIONS' | 'SECURITY';
  facility?: { id: string; name: string; code: string } | null;
  assignee?: UserSummary;
  createdBy?: { id: string; name: string };
  status: TaskStatus;
  dueAt: ISODate | null;
  note: string | null;
  completedAt: ISODate | null;
  createdAt: ISODate;
}

export interface EquipmentRequest {
  id: string;
  requester?: UserSummary;
  club?: { id: string; name: string } | null;
  equipment?: { id: string; name: string; availableQty: number } | null;
  equipmentId: string | null;
  itemName: string;
  quantity: number;
  neededBy: ISODate | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED';
  decidedBy?: { id: string; name: string } | null;
  decisionNote: string | null;
  createdAt: ISODate;
}

export interface InventoryTransaction {
  id: string;
  type: 'INITIAL' | 'RESTOCK' | 'ISSUE' | 'RETURN' | 'DAMAGE_REPORT' | 'REPAIR' | 'LOSS' | 'WRITE_OFF' | 'ADJUSTMENT';
  quantity: number;
  availableDelta: number;
  damagedDelta: number;
  totalDelta: number;
  balanceAvailable: number;
  balanceDamaged: number;
  balanceTotal: number;
  note: string | null;
  actor?: { id: string; name: string };
  equipment?: { id: string; name: string };
  createdAt: ISODate;
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
  openMinute: number; // minutes after midnight, e.g. 360 = 06:00
  closeMinute: number;
  slotMinutes: number;
  capacity: number;
  requiresApproval: boolean;
  isDemo?: boolean;
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
  cancelReason?: string | null;
  rescheduleCount?: number;
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
  date: string; // YYYY-MM-DD
  slots: AvailabilitySlot[];
}

export interface BookingPass {
  bookingId: string;
  token: string;
  qrDataUrl: string; // PNG data URL encoding `sportsos://pass/<token>`
}

// ---------------------------------------------------------------- clubs
export interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  user?: UserSummary;
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
  coach?: UserSummary | null;
  memberCount: number;
  myMembership?: ClubMembership | null;
  members?: ClubMembership[];
  /** server-computed: may this viewer manage the roster / announcements */
  canManage?: boolean;
  isDemo?: boolean;
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
  records?: AttendanceRecord[];
}

export interface SessionOtp {
  sessionId: string;
  code: string; // 6 digits
  step: number;
  expiresInSec: number;
  qrDataUrl: string; // QR of `sportsos://checkin?session=<id>` for the mobile scanner
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  session?: Pick<AttendanceSession, 'id' | 'title' | 'startsAt'>;
  userId: string;
  user?: UserSummary;
  checkedInAt: ISODate;
  /** null for MANUAL corrections */
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

export interface InventoryAlerts {
  lowStock: EquipmentItem[];
  overdue: EquipmentIssue[];
}

export interface AuditEntry {
  seq: number;
  actorId: string | null;
  actor?: Pick<UserSummary, 'id' | 'name' | 'role'> | null;
  action: string;
  entity: string;
  entityId: string;
  payload: unknown;
  prevHash: string;
  hash: string;
  createdAt: ISODate;
}

export interface AuditVerification {
  valid: boolean;
  checked: number;
  brokenAtSeq: number | null;
  headHash: string | null;
}

// ---------------------------------------------------------------- events
export interface Team {
  id: string;
  tournamentId: string;
  name: string;
  hostel: string | null;
  seed: number | null;
  registeredById?: string | null;
  members?: { id: string; userId: string; user?: { id: string; name: string; hostel: string | null } }[];
}

export interface Match {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  status: MatchStatus;
  scheduledAt: ISODate | null;
  facilityId: string | null;
  nextMatchId: string | null;
}

export interface StandingRow {
  teamId: string;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  diff: number;
  points: number;
}

export interface Tournament {
  id: string;
  name: string;
  sport: string;
  format: TournamentFormat;
  status: TournamentStatus;
  description: string | null;
  startDate: ISODate;
  facilityId: string | null;
  organizerId: string;
  teamCount: number;
  championId: string | null;
  approvedById?: string | null;
  reviewNote?: string | null;
  isDemo?: boolean;
  teams?: Team[];
  matches?: Match[];
  standings?: StandingRow[];
  createdAt: ISODate;
}

export type EquipmentItemDetail = EquipmentItem & { issues: EquipmentIssue[] };

// ---------------------------------------------------------------- engagement
export interface Notification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  link: string | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

export interface Complaint {
  id: string;
  raisedById: string;
  raisedBy?: UserSummary;
  category: ComplaintCategory;
  subject: string;
  description: string;
  facilityId: string | null;
  equipmentId: string | null;
  status: ComplaintStatus;
  priority: Priority;
  assignedToId: string | null;
  assignedTo?: UserSummary | null;
  resolution: string | null;
  escalated?: boolean;
  escalationNote?: string | null;
  resolvedAt?: ISODate | null;
  closedAt?: ISODate | null;
  reopenCount?: number;
  attachments?: { id: string; filename: string; mimeType: string; size: number; createdAt: ISODate }[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Achievement {
  id: string;
  userId: string;
  user?: UserSummary;
  title: string;
  sport: string;
  level: AchievementLevel;
  position: string | null;
  date: ISODate;
  verified: boolean;
  createdAt: ISODate;
}

export interface UserProfile {
  user: User;
  stats: { checkIns: number; bookings: number; tournaments: number };
  achievements: Achievement[];
  clubs: Club[];
}

// ---------------------------------------------------------------- analytics
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

export interface ParticipationPoint {
  weekStart: string; // YYYY-MM-DD
  checkIns: number;
  uniqueParticipants: number;
  bookings: number;
}

export interface FacilityUtilization {
  facilityId: string;
  name: string;
  bookedHours: number;
  availableHours: number;
  utilizationPct: number;
}

export interface UtilizationReport {
  days: number;
  facilities: FacilityUtilization[];
  /** heatmap[dayOfWeek 0=Mon..6=Sun][hour 0..23] = booked hours in that cell */
  heatmap: number[][];
}

export interface ForecastPoint {
  date: string; // YYYY-MM-DD
  actual: number | null;
  /** Future dates: the forecast. Past dates: the model's in-sample one-step fit (null for the first season). */
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

export interface ForecastReport {
  facilityId: string | null;
  metric: 'booked_hours';
  model: {
    name: 'holt-winters-additive';
    alpha: number;
    beta: number;
    gamma: number;
    seasonLength: number;
    mape: number | null;
    rmse: number;
  };
  points: ForecastPoint[];
}

export interface EquipmentInsight {
  equipmentId: string;
  name: string;
  availableQty: number;
  avgDailyIssues: number;
  damageRatePct: number;
  daysToStockout: number | null;
}

export interface IntegrityReport {
  days: number;
  accepted: number;
  rejected: Record<Exclude<AttemptOutcome, 'ACCEPTED'>, number>;
}

// ---------------------------------------------------------------- AI
export interface AiStatus {
  llm: 'claude' | 'offline';
  model: string | null;
  vectorStore: 'pinecone' | 'local';
  indexedDocuments: number;
}

export interface AiAskRequest {
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AiSource {
  id: string;
  title: string;
  /** Raw retrieval score (BM25 locally, similarity with Pinecone); only comparable within one answer. */
  score: number;
}

export interface AiAnswer {
  answer: string;
  sources: AiSource[];
  generatedBy: 'claude' | 'offline';
}

export interface AiReport {
  period: 'week' | 'month';
  markdown: string;
  generatedBy: 'claude' | 'offline';
  generatedAt: ISODate;
}

// ---------------------------------------------------------------- QR payloads
export const QR_PREFIX = {
  equipment: 'sportsos://equipment/',
  pass: 'sportsos://pass/',
  checkin: 'sportsos://checkin?session=',
} as const;

// ---------------------------------------------------------------- misc
export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
