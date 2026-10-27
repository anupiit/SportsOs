'use client';

import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/components/auth';
import { ProfileView } from '@/components/profile';

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const me = useUser();
  const router = useRouter();
  return (
    <div>
      <button type="button" onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1 text-sm text-text-2 hover:text-text">
        <ArrowLeft className="size-4" /> Back
      </button>
      <ProfileView userId={id} self={id === me.id} />
    </div>
  );
}
