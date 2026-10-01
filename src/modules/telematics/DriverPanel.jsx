import React, { useMemo } from "react";
import { X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { SAFETY_BANDS, bandOf, coachingFocus, driverWeeklySafety } from "./telematicsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, formatDay, formatNumber, formatPct, truncateString } from "./telematicsFormat";

/** Right-hand drawer with one driver's score trend, event mix, trucks and coaching focus. */
export default function DriverPanel({ driver, drivers, onClose, onOpenAsset }) {
  const weekly = useMemo(() => driverWeeklySafety(driver), [driver]);
  const tips = useMemo(() => coachingFocus(driver, drivers), [driver, drivers]);
  const band = bandOf(SAFETY_BANDS, driver.safety);

  const stats = [
    { label: "Safety", value: driver.safety === null ? "—" : driver.safety.toFixed(1), color: band?.color },
    { label: "Eco", value: driver.eco === null ? "—" : driver.eco.toFixed(0) },
    { label: "Distance", value: `${formatNumber(driver.km)} km` },
    { label: "Events / 1,000 km", value: driver.eventsPer1000 === null ? "—" : driver.eventsPer1000.toFixed(1) },
    { label: driver.bev ? "Coasting" : "RPM green band", value: formatPct(driver.bev ? driver.coastingPct : driver.greenBandPct, 0) },
    { label: "Cruise", value: formatPct(driver.cruisePct, 0) },
    { label: "Idle", value: formatPct(driver.idlePct, 0) },
    { label: "Brakes / 100 km", value: driver.brakesPer100 === null ? "—" : driver.brakesPer100.toFixed(0) },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/20" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Driver ${driver.alias}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Driver profile</p>
            <h2 className="text-base font-semibold text-slate-800">{driver.alias}</h2>
            {band && (
              <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: band.color }}>
                {band.name}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="grid grid-cols-4 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-100 px-2 py-2">
                <div className="text-[10px] uppercase leading-tight tracking-wider text-slate-400">{s.label}</div>
                <div className="text-sm font-semibold text-slate-800" style={s.color ? { color: s.color } : undefined}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Coaching focus</h3>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  {t}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Weekly safety score</h3>
            {weekly.length < 2 ? (
              <p className="text-xs text-slate-400">Not enough weeks in the period for a trend.</p>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="week" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={28} />
                  <RechartsTooltip labelFormatter={(d) => `Week of ${formatDay(d)}`} />
                  <ReferenceLine y={85} stroke="#10b981" strokeDasharray="4 4" />
                  <ReferenceLine y={70} stroke="#e11d48" strokeDasharray="4 4" />
                  <Line dataKey="safety" name="Safety" stroke="#0f172a" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Event mix</h3>
            {driver.byType.length === 0 ? (
              <p className="text-xs text-slate-400">No events match the current event filter.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(90, driver.byType.length * 26)}>
                <BarChart data={driver.byType} layout="vertical" margin={{ left: 4, right: 32 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="label" width={120} tickFormatter={(v) => truncateString(v, 18)} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: "#f8fafc" }} formatter={(v) => [`${v} events`, "Count"]} />
                  <Bar dataKey="count" fill="#e11d48" radius={[0, 3, 3, 0]} label={{ position: "right", fontSize: 11, fill: "#64748b" }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Trucks driven</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {driver.trucks.map((t) => (
                <li key={t.vehicleId}>
                  <button
                    type="button"
                    onClick={() => onOpenAsset(t.vehicleId)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    <span className="font-medium text-slate-700">{t.vin ?? t.vehicleId}</span>
                    <span className="text-xs text-slate-500">{formatNumber(t.km)} km</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Drivers are pseudonymised (tachograph card hash → alias). Scores are shown for coaching, not for individual
            disciplinary use.
          </p>
        </div>
      </aside>
    </div>
  );
}
