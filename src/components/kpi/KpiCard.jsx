import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

const BADGE_STYLES = {
  NOW: 'bg-sky-50 text-sky-700',
  PERIOD: 'bg-slate-100 text-slate-500',
};

// Top accent border, taken from the colour the caller already passes as iconColorClass.
const ACCENT_BORDERS = {
  amber: 'border-t-amber-500',
  blue: 'border-t-blue-600',
  emerald: 'border-t-emerald-500',
  red: 'border-t-red-500',
  rose: 'border-t-rose-500',
  sky: 'border-t-sky-500',
  slate: 'border-t-slate-400',
  violet: 'border-t-violet-600',
};

function accentFor(iconColorClass) {
  const name = /text-([a-z]+)-\d+/.exec(iconColorClass ?? '')?.[1];
  return ACCENT_BORDERS[name] ?? ACCENT_BORDERS.sky;
}

function DeltaText({ delta }) {
  if (!delta || delta.value === null || delta.value === undefined || Number.isNaN(delta.value)) {
    return null;
  }
  const { value, unit = '', positiveIsGood = true, label = 'vs prev. period' } = delta;
  const isFlat = Math.abs(value) < 0.05;
  const isGood = isFlat ? null : value > 0 === positiveIsGood;
  const colorClass = isGood === null ? 'text-slate-400' : isGood ? 'text-emerald-600' : 'text-rose-600';
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {sign}
      {value.toFixed(1)}
      {unit} <span className="font-normal text-slate-400">{label}</span>
    </span>
  );
}

export default function KpiCard({
  title,
  value,
  icon: _icon,
  iconColorClass = 'text-sky-600',
  loading = false,
  tooltip,
  subtitle,
  badge,
  delta,
  sparkline,
  sparklineColor = '#0ea5e9',
  onClick,
}) {
  const interactive = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`flex flex-col justify-between rounded-xl border border-t-[3px] border-slate-200 bg-white px-5 py-4 shadow-sm ${accentFor(
        iconColorClass
      )} ${
        interactive ? 'cursor-pointer transition-colors hover:border-sky-300 hover:bg-sky-50/30' : ''
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {badge && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${
                BADGE_STYLES[badge] ?? BADGE_STYLES.PERIOD
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {tooltip && (
          <div className="group relative flex items-center">
            <HelpCircle className="h-5 w-5 cursor-help text-slate-300 transition-colors hover:text-slate-500" strokeWidth={1.5} />
            <div
              role="tooltip"
              className="pointer-events-none absolute right-0 top-7 z-20 w-56 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            >
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <div>
        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded bg-slate-100" />
        ) : (
          <>
            <div className="text-[32px] font-bold leading-tight tracking-tight text-slate-900">{value}</div>
            {subtitle && <div className="mt-1.5 text-[13px] text-slate-500">{subtitle}</div>}
            {delta && (
              <div className="mt-1">
                <DeltaText delta={delta} />
              </div>
            )}
            {sparkline && sparkline.length > 1 && (
              <div className="mt-2 h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkline}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={sparklineColor}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
