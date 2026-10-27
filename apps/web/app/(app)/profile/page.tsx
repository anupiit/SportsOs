'use client';

import type { Achievement } from '@sportsos/shared';
import { BadgeCheck } from 'lucide-react';
import { useAuth, useUser } from '@/components/auth';
import { AchievementList, ProfileView } from '@/components/profile';
import { Card, CardBody, CardHeader, SkeletonRows } from '@/components/ui';
import { useApi } from '@/lib/hooks';

function PendingVerification() {
  const { data, isLoading } = useApi<Achievement[]>('/achievements', { verified: 'false' });
  return (
    <Card>
      <CardHeader
        title="Achievements awaiting verification"
        description="Student-submitted results to confirm for the official record"
        icon={<BadgeCheck className="size-4" />}
      />
      <CardBody>{isLoading ? <SkeletonRows rows={3} /> : <AchievementList items={data ?? []} canVerify showOwner />}</CardBody>
    </Card>
  );
}

export default function MyProfilePage() {
  const user = useUser();
  const { can } = useAuth();
  return (
    <div className="space-y-6">
      <ProfileView userId={user.id} self />
      {can('achievements:verify') && <PendingVerification />}
    </div>
  );
}
