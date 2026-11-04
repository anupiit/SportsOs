'use client';

import type {
  BookingStatus,
  ComplaintStatus,
  FacilityStatus,
  IssueStatus,
  MatchStatus,
  MembershipStatus,
  Priority,
  SessionStatus,
  TournamentStatus,
} from '@sportsos/shared';
import { AlertTriangle, CheckCircle2, Clock, Lock, Wrench, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/components/ui';
import { humanize } from '@/lib/format';

// Status always ships with an icon + label, never color alone.

const facility: Record<FacilityStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  OPEN: { tone: 'green', icon: <CheckCircle2 className="size-3" />, label: 'Open' },
  MAINTENANCE: { tone: 'amber', icon: <Wrench className="size-3" />, label: 'Maintenance' },
  CLOSED: { tone: 'red', icon: <Lock className="size-3" />, label: 'Closed' },
};

export function FacilityStatusBadge({ status }: { status: FacilityStatus }) {
  const s = facility[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

const booking: Record<BookingStatus, { tone: Tone; icon: ReactNode }> = {
  PENDING: { tone: 'amber', icon: <Clock className="size-3" /> },
  APPROVED: { tone: 'green', icon: <CheckCircle2 className="size-3" /> },
  REJECTED: { tone: 'red', icon: <XCircle className="size-3" /> },
  CANCELLED: { tone: 'neutral', icon: <XCircle className="size-3" /> },
  COMPLETED: { tone: 'blue', icon: <CheckCircle2 className="size-3" /> },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = booking[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {humanize(status)}
    </Badge>
  );
}

const membership: Record<MembershipStatus, Tone> = {
  PENDING: 'amber',
  ACTIVE: 'green',
  REJECTED: 'red',
  LEFT: 'neutral',
};

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  return <Badge tone={membership[status]}>{humanize(status)}</Badge>;
}

export function SessionBadge({ status }: { status: SessionStatus }) {
  return status === 'ACTIVE' ? (
    <Badge tone="green" icon={<span className="size-1.5 animate-pulse rounded-full bg-current" />}>
      Live
    </Badge>
  ) : (
    <Badge tone="neutral">Closed</Badge>
  );
}

const issue: Record<IssueStatus, { tone: Tone; icon: ReactNode }> = {
  ISSUED: { tone: 'blue', icon: <Clock className="size-3" /> },
  RETURNED: { tone: 'green', icon: <CheckCircle2 className="size-3" /> },
  OVERDUE: { tone: 'red', icon: <AlertTriangle className="size-3" /> },
  LOST: { tone: 'red', icon: <XCircle className="size-3" /> },
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const s = issue[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {humanize(status)}
    </Badge>
  );
}

const tournament: Record<TournamentStatus, Tone> = { PROPOSED: 'terracotta', REJECTED: 'red', DRAFT: 'neutral', ONGOING: 'blue', COMPLETED: 'green' };

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  return <Badge tone={tournament[status]}>{humanize(status)}</Badge>;
}

const match: Record<MatchStatus, Tone> = { SCHEDULED: 'neutral', LIVE: 'terracotta', COMPLETED: 'green', BYE: 'neutral' };

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return <Badge tone={match[status]}>{status === 'LIVE' ? '● Live' : humanize(status)}</Badge>;
}

const complaint: Record<ComplaintStatus, Tone> = {
  OPEN: 'amber',
  IN_PROGRESS: 'blue',
  RESOLVED: 'green',
  CLOSED: 'neutral',
};

export function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  return <Badge tone={complaint[status]}>{humanize(status)}</Badge>;
}

const priority: Record<Priority, Tone> = { LOW: 'neutral', MEDIUM: 'amber', HIGH: 'red' };

export function PriorityBadge({ priority: p }: { priority: Priority }) {
  return (
    <Badge tone={priority[p]} icon={p === 'HIGH' ? <AlertTriangle className="size-3" /> : undefined}>
      {humanize(p)} priority
    </Badge>
  );
}
