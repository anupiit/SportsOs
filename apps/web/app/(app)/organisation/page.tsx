'use client';

import { ROLE_INFO, ROLE_PERMISSIONS, ROLES, type Role } from '@sportsos/shared';
import clsx from 'clsx';
import { KeyRound } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useUser } from '@/components/auth';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { humanize } from '@/lib/format';

function childrenMap(): Map<Role, Role[]> {
  const map = new Map<Role, Role[]>();
  for (const r of ROLES) {
    const parent = ROLE_INFO[r].reportsTo;
    if (!parent) continue;
    map.set(parent, [...(map.get(parent) ?? []), r]);
  }
  return map;
}

function Node({
  role,
  selected,
  mine,
  onSelect,
  strong,
  label,
}: {
  role: Role;
  selected: boolean;
  mine: boolean;
  onSelect: (r: Role) => void;
  strong?: boolean;
  label?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      aria-pressed={selected}
      className={clsx(
        'relative w-full rounded-lg px-3 py-2 text-center text-xs font-semibold transition-shadow',
        strong ? 'bg-primary text-primary-fg' : 'border border-border bg-surface-2 text-text',
        selected && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]',
        mine && !selected && 'ring-2 ring-warn ring-offset-2 ring-offset-[var(--surface)]',
      )}
    >
      {label ?? ROLE_INFO[role].label}
      {mine && <span className="absolute -top-2 -right-2 rounded-full bg-warn px-1.5 text-[9px] leading-4 font-bold text-white">YOU</span>}
    </button>
  );
}

const VLine = () => <div className="mx-auto h-4 w-px bg-border-strong" aria-hidden />;

export default function OrganisationPage() {
  const me = useUser();
  const [selected, setSelected] = useState<Role>(me.role);
  const kids = useMemo(childrenMap, []);

  // Walk the single-child chain from the root to the first branching node.
  const chain: Role[] = [];
  let cur: Role | undefined = 'DIRECTOR';
  while (cur) {
    chain.push(cur);
    const c: Role[] = kids.get(cur) ?? [];
    cur = c.length === 1 ? c[0] : undefined;
  }
  const branchRoot = chain[chain.length - 1];
  const branches = kids.get(branchRoot) ?? [];

  const sel = (r: Role) => setSelected(r);
  const info = ROLE_INFO[selected];
  const perms = ROLE_PERMISSIONS[selected];

  function Subtree({ role, depth }: { role: Role; depth: number }) {
    const children = kids.get(role) ?? [];
    return (
      <div className={clsx(depth > 0 && 'border-l border-border-strong pl-3')}>
        <Node role={role} selected={selected === role} mine={me.role === role} onSelect={sel} />
        {children.length > 0 && (
          <div className="mt-2 space-y-2">
            {children.map((c) => (
              <Subtree key={c} role={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder hierarchy"
        title="SportsOS — a unified digital backbone"
        description="Every node in the institute's sports governance structure is a SportsOS role with its own view and permissions. Select a role to see what it can do."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardBody className="pt-5">
            <div className="mx-auto max-w-xs">
              {chain.map((r, i) => (
                <div key={r}>
                  {i > 0 && <VLine />}
                  <Node role={r} selected={selected === r} mine={me.role === r} onSelect={sel} strong />
                </div>
              ))}
            </div>
            <VLine />
            <div className="relative grid grid-cols-1 gap-6 border-t border-border-strong pt-4 md:grid-cols-3">
              {branches.map((b) => {
                const subs = kids.get(b) ?? [];
                return (
                  <div key={b}>
                    <Node role={b} selected={selected === b} mine={me.role === b} onSelect={sel} />
                    {subs.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {subs.map((s) => (
                          <Subtree key={s} role={s} depth={1} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
              <section className="rounded-xl border border-border p-4">
                <h3 className="mb-3 text-center text-sm font-semibold text-text">System Access Layer</h3>
                <div className="mx-auto max-w-[220px] rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-fg">
                  All IIT (ISM) students
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-center text-[11px] text-muted italic">Representational access</p>
                    <Node role="CLUB_MEMBER" selected={selected === 'CLUB_MEMBER'} mine={me.role === 'CLUB_MEMBER'} onSelect={sel} />
                  </div>
                  <div>
                    <p className="mb-1 text-center text-[11px] text-muted italic">Casual booking access</p>
                    <Node role="STUDENT" selected={selected === 'STUDENT'} mine={me.role === 'STUDENT'} onSelect={sel} />
                  </div>
                </div>
              </section>
              <section className="rounded-xl border border-dashed border-border p-4">
                <h3 className="mb-3 text-center text-sm font-semibold text-text">Platform</h3>
                <Node role="ADMIN" selected={selected === 'ADMIN'} mine={me.role === 'ADMIN'} onSelect={sel} />
              </section>
            </div>
          </CardBody>
        </Card>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader title={info.label} description={info.description} icon={<KeyRound className="size-4" />} />
          <CardBody className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="navy">{humanize(info.tier)}</Badge>
              {info.reportsTo && <Badge tone="neutral">Reports to {ROLE_INFO[info.reportsTo].label}</Badge>}
              {selected === me.role && <Badge tone="terracotta">Your role</Badge>}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-text-2">
                Permissions ({perms.length})
              </p>
              {perms.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {perms.map((p) => (
                    <li key={p}>
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-2">{p}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">
                  Baseline access only: book facilities, check in to sessions, join clubs, borrow equipment, raise complaints and use SportsOS AI.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
