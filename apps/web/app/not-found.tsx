import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold tracking-wider text-accent-ink uppercase">404</p>
      <h1 className="text-2xl font-bold text-text">This page is off the field</h1>
      <p className="max-w-sm text-sm text-text-2">The page you are looking for does not exist or has moved.</p>
      <Link href="/dashboard" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">
        Back to dashboard
      </Link>
    </div>
  );
}
