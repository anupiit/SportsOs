import { BarChart3, ShieldCheck, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/shell/app-shell';

const PILLARS = [
  {
    icon: Workflow,
    title: 'Administrative integration',
    text: 'Role-based access for 18 stakeholder types, one hub for facilities, clubs and equipment.',
  },
  {
    icon: ShieldCheck,
    title: 'High-fidelity tracking',
    text: 'OTP + GPS geofenced attendance and QR equipment logs on a tamper-evident ledger.',
  },
  {
    icon: BarChart3,
    title: 'Intelligent automation',
    text: 'Live brackets, demand forecasting and AI-generated executive reports.',
  },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden
        />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#e9a58f] uppercase">Sports ERP</p>
          <h1 className="mt-3 text-4xl leading-tight font-bold">
            One digital backbone for campus sport.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-text">
            SportsOS replaces paper registers, scattered spreadsheets and WhatsApp groups with a single, auditable
            record of facilities, attendance, inventory and tournaments at IIT (ISM) Dhanbad.
          </p>
          <ul className="mt-8 space-y-5">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4 text-[#e9a58f]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs leading-relaxed text-sidebar-text">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-sidebar-text/70">
          Department of Mathematics and Computing · Indian Institute of Technology (Indian School of Mines), Dhanbad
        </p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}
