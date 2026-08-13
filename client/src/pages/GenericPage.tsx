import {
  Activity,
  BellRing,
  ClipboardCheck,
  Package,
  ShieldCheck,
  Stethoscope,
  Truck,
  Users
} from 'lucide-react';

const statsByTitle: Record<string, { metric: string; value: string; trend: string; tone: string }[]> = {
  'user prescription history': [
    { metric: 'Active prescriptions', value: '06', trend: '+2 this month', tone: 'emerald' },
    { metric: 'Refills due', value: '02', trend: '1 urgent', tone: 'amber' },
    { metric: 'Verified by pharmacist', value: '100%', trend: 'last 30 days', tone: 'sky' }
  ],
  'delivery request': [
    { metric: 'In flight', value: '14', trend: '+4 today', tone: 'sky' },
    { metric: 'Avg ETA', value: '17 min', trend: 'down 6 min', tone: 'emerald' },
    { metric: 'Live tracking', value: '08', trend: 'on route', tone: 'violet' }
  ],
  'delivery tracking': [
    { metric: 'On route', value: '04', trend: '2 priority', tone: 'amber' },
    { metric: 'Distance covered', value: '28 km', trend: '+5.4 km today', tone: 'emerald' },
    { metric: 'Completion rate', value: '96%', trend: '12h SLA', tone: 'sky' }
  ],
  'payment': [
    { metric: 'Settled', value: 'GHS 8,420', trend: '+18% this week', tone: 'emerald' },
    { metric: 'Pending', value: 'GHS 1,180', trend: '3 invoices', tone: 'amber' },
    { metric: 'Failed charges', value: '0', trend: 'last 30 days', tone: 'sky' }
  ],
  'user notifications': [
    { metric: 'Unread', value: '11', trend: '5 critical', tone: 'amber' },
    { metric: 'Medication reminders', value: '04', trend: '2 due today', tone: 'sky' },
    { metric: 'Delivery alerts', value: '03', trend: '1 resolved', tone: 'emerald' }
  ],
  'pharmacy admin dashboard': [
    { metric: 'Pharmacies online', value: '128', trend: '+5 this week', tone: 'emerald' },
    { metric: 'Pending approvals', value: '09', trend: '4 urgent', tone: 'amber' },
    { metric: 'Audit score', value: '98.6%', trend: 'above target', tone: 'sky' }
  ],
  'inventory management': [
    { metric: 'Low stock SKUs', value: '18', trend: '5 critical', tone: 'amber' },
    { metric: 'In stock items', value: '4,286', trend: '+84 today', tone: 'emerald' },
    { metric: 'Restock cadence', value: '3.2 days', trend: 'on schedule', tone: 'sky' }
  ],
  'pharmacist prescription review': [
    { metric: 'Awaiting review', value: '24', trend: '8 high priority', tone: 'amber' },
    { metric: 'Approved today', value: '41', trend: '+12% vs yesterday', tone: 'emerald' },
    { metric: 'Verification SLA', value: '92%', trend: 'within 30 mins', tone: 'sky' }
  ],
  'driver deliveries and gps updates': [
    { metric: 'Assigned drops', value: '12', trend: '3 on route', tone: 'sky' },
    { metric: 'ETA accuracy', value: '94%', trend: 'within 10 mins', tone: 'emerald' },
    { metric: 'Route efficiency', value: '87%', trend: 'optimized this week', tone: 'violet' }
  ],
  'system admin audit logs': [
    { metric: 'Events today', value: '8,420', trend: '+310 vs yesterday', tone: 'sky' },
    { metric: 'Incidents', value: '03', trend: '1 escalated', tone: 'amber' },
    { metric: 'Integrity checks', value: '99.9%', trend: 'all passed', tone: 'emerald' }
  ]
};

const toneClasses: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100'
};

export function GenericPage({ title }: { title: string }) {
  const stats = statsByTitle[title.toLowerCase()] ?? [
    { metric: 'Active tasks', value: '12', trend: 'updated in real time', tone: 'sky' },
    { metric: 'Operational status', value: 'Healthy', trend: 'service stable', tone: 'emerald' },
    { metric: 'Attention needed', value: '03', trend: 'watchlist', tone: 'amber' }
  ];

  const iconMap = {
    'user prescription history': ClipboardCheck,
    'delivery request': Truck,
    'delivery tracking': Truck,
    'payment': Activity,
    'user notifications': BellRing,
    'pharmacy admin dashboard': Users,
    'inventory management': Package,
    'pharmacist prescription review': Stethoscope,
    'driver deliveries and gps updates': ShieldCheck,
    'system admin audit logs': ShieldCheck
  } as const;

  const Icon = iconMap[title.toLowerCase()] ?? Activity;

  const quickActions = [
    'Review pending approvals',
    'Check availability by pharmacy',
    'Export a compliance summary',
    'Send medication update'
  ];

  const recentEvents = [
    { label: 'Prescription verification', time: '08:15', state: 'Approved' },
    { label: 'Driver route updated', time: '09:02', state: 'Live' },
    { label: 'Inventory threshold crossed', time: '10:20', state: 'Addressed' },
    { label: 'System health check', time: '11:40', state: 'Passed' }
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-lg shadow-sky-200">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Operations overview</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{title}</h1>
            </div>
          </div>

          <button type="button" className="primary-button px-4 py-2 text-sm">
            Refresh activity
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.metric} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">{stat.metric}</div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="text-3xl font-black text-slate-900">{stat.value}</div>
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${toneClasses[stat.tone]}`}>
                  {stat.trend}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900">Quick actions</h2>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">Live</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {quickActions.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
          <h2 className="text-xl font-black text-slate-900">Recent activity</h2>
          <div className="mt-4 space-y-3">
            {recentEvents.map((event) => (
              <div key={`${event.label}-${event.time}`} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{event.label}</div>
                  <div className="text-xs text-slate-500">{event.time}</div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                  {event.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
