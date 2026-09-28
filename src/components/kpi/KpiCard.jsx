import React from 'react';
import { HelpCircle } from 'lucide-react';

export default function KpiCard({
  title,
  value,
  icon: Icon,
  iconBgClass = 'bg-sky-50',
  iconColorClass = 'text-sky-600',
  loading = false,
  tooltip,
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </h3>
          {tooltip && (
            <div className="group relative flex items-center">
              <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 transition-colors hover:text-slate-600" />
              <div
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
              >
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <div className={`rounded-full p-2 ${iconBgClass} ${iconColorClass}`}>
          {Icon && <Icon size={18} />}
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded bg-slate-100" />
        ) : (
          <div className="text-3xl font-bold text-slate-800">{value}</div>
        )}
      </div>
    </div>
  );
}