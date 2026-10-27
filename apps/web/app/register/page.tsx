'use client';

import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth';
import { AuthLayout } from '@/components/auth-layout';
import { Button, Field, Input, Notice } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { HOSTELS } from '@/lib/constants';

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', admissionNo: '', hostel: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        admissionNo: form.admissionNo.trim().toUpperCase() || undefined,
        hostel: form.hostel.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-text">Create your account</h2>
      <p className="mt-1 text-sm text-text-2">
        Every IIT (ISM) student gets casual booking access. Join a club to unlock representational access.
      </p>
      <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {error && <Notice tone="red" className="sm:col-span-2">{error}</Notice>}
        <Field label="Full name" htmlFor="name" required className="sm:col-span-2">
          <Input id="name" autoComplete="name" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Institute email" htmlFor="email" hint="Must be an @iitism.ac.in address" required className="sm:col-span-2">
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" required className="sm:col-span-2">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            minLength={8}
            required
          />
        </Field>
        <Field label="Admission no." htmlFor="admissionNo">
          <Input id="admissionNo" placeholder="22JE0143" value={form.admissionNo} onChange={set('admissionNo')} />
        </Field>
        <Field label="Hostel" htmlFor="hostel">
          <Input id="hostel" list="hostel-list" value={form.hostel} onChange={set('hostel')} />
          <datalist id="hostel-list">
            {HOSTELS.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </Field>
        <Field label="Phone" htmlFor="phone" className="sm:col-span-2">
          <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="sm:col-span-2"
          loading={busy}
          icon={<UserPlus className="size-4" />}
        >
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-text-2">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-accent-ink hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
