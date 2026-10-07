import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { AlertOctagon, ArrowLeft, ClipboardCopy, Gauge, Radio, ShieldAlert, SlidersHorizontal, Timer, Truck, Wrench, X } from "lucide-react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import { useDiagnosticsAssetData } from "../../hooks/useDiagnosticsData";
import { useFilterStore } from "../../store/useFilterStore";
import {
  LAMP_COLORS,
  assetSignalSeries,
  assetSummary,
  dtcLabel,
  dtcTimeline,
  partRiskTrend,
  serviceHistory,
  dayOf,
  systemLabel,
  workOrderText,
  workshopPrep,
  freezeLabel,
} from "./diagnosticsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatDateTime, formatDay, formatInr, formatNumber, formatPct } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, Pill } from "../telematics/TelematicsUi";
import { ActionPill, LampPill, RiskPill, SeverityPill, StatePill } from "./diagnosticsUi";

const PART_COLORS = ["#e11d48", "#f59e0b", "#0ea5e9", "#8b5cf6", "#10b981"];
const VISIT_STYLES = {
  breakdown: "bg-rose-100 text-rose-700",
  repair: "bg-amber-100 text-amber-700",
  predicted: "bg-emerald-100 text-emerald-700",
  planned: "bg-slate-100 text-slate-600",
};

function SignalCard({ series, focused }) {
  const { signal, points, anomalies, markers, latest, state } = series;
  const domainVals = [...points.map((p) => p.value).filter((v) => v !== null), signal.normal_min, signal.normal_max, signal.crit_threshold].filter((v) => v !== null && v !== undefined);
  const lo = Math.min(...domainVals);
  const hi = Math.max(...domainVals);
  const pad = (hi - lo) * 0.08 || 1;
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${focused ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">{signal.signal_name}</p>
          <p className="text-[10px] text-slate-400">
            normal {signal.normal_min}–{signal.normal_max} {signal.unit} · {anomalies.length} anomalous readings
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800">
            {formatNumber(latest, 1)} <span className="text-[10px] font-normal text-slate-400">{signal.unit}</span>
          </p>
          <StatePill state={state} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <ReferenceArea y1={signal.normal_min} y2={signal.normal_max} fill="#10b981" fillOpacity={0.07} />
          {signal.warn_threshold !== null && <ReferenceLine y={signal.warn_threshold} stroke="#f59e0b" strokeDasharray="4 3" />}
          {signal.crit_threshold !== null && <ReferenceLine y={signal.crit_threshold} stroke="#e11d48" strokeDasharray="4 3" />}
          {markers.map((m) => (
            <ReferenceLine key={`${m.t}-${m.label}`} x={m.t} stroke={LAMP_COLORS[m.lamp] ?? "#64748b"} strokeWidth={1.5} />
          ))}
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => formatDay(dayOf(t))} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={40} />
          <YAxis domain={[lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} tickFormatter={(v) => formatNumber(v, hi - lo < 10 ? 1 : 0)} />
          <RechartsTooltip labelFormatter={(t) => formatDateTime(t)} formatter={(v, name) => [`${formatNumber(v, 2)} ${signal.unit}`, name === "anomalyValue" ? "Anomalous" : signal.signal_name]} />
          <Line dataKey="value" stroke="#0ea5e9" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="anomalyValue" stroke="none" dot={{ r: 3, fill: "#e11d48", stroke: "none" }} activeDot={false} legendType="none" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {markers.length > 0 && <p className="mt-1 text-[10px] text-slate-400">Vertical line = fault code set on this signal ({markers.map((m) => m.label).join("; ")})</p>}
    </div>
  );
}

function DtcGantt({ timeline, selected, onSelect }) {
  const [min, max] = timeline.domain;
  const width = max - min || 1;
  return (
    <div className="space-y-1.5">
      {timeline.bars.map((b) => (
        <div key={b.event.dtc_event_id} className="flex items-center gap-2">
          <span className="w-56 shrink-0 truncate text-right text-[11px] text-slate-500" title={`${b.event.dtc_id} · ${b.label}`}>
            {b.label}
          </span>
          <div className="relative h-4 flex-1 rounded bg-slate-50">
            <button
              type="button"
              onClick={() => onSelect(b.event.dtc_event_id)}
              title={`${b.event.dtc_id} · ${b.status} · ${formatDateTime(b.event.first_seen_ts)} → ${b.event.cleared_ts ? formatDateTime(b.event.cleared_ts) : b.status === "active" ? "now" : formatDateTime(b.event.last_seen_ts)}`}
              className={`absolute top-0 h-full rounded ${selected === b.event.dtc_event_id ? "ring-2 ring-slate-800" : ""} ${b.status === "previously_active" ? "opacity-50" : ""}`}
              style={{ left: `${((b.from - min) / width) * 100}%`, width: `${Math.max(0.6, ((b.to - b.from) / width) * 100)}%`, backgroundColor: LAMP_COLORS[b.lamp] ?? "#94a3b8" }}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-between text-[10px] text-slate-400" style={{ marginLeft: "14.5rem" }}>
        <span>{formatDay(dayOf(min))}</span>
        <span>{formatDay(dayOf(max))}</span>
      </div>
    </div>
  );
}

function FreezeFrameModal({ event, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div role="dialog" aria-label="Freeze frame" className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Freeze frame</p>
            <h3 className="mt-0.5 text-sm font-semibold text-slate-800">{dtcLabel(event)}</h3>
            <p className="text-[11px] text-slate-400">
              {event.dtc_id} · {systemLabel(event.dim_dtc?.system)} · {event.dim_dtc?.ecu_name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <LampPill lamp={event.lamp_status} />
            <SeverityPill severity={event.dim_dtc?.severity_class} />
            {event.caused_derate && <Pill className="bg-rose-100 text-rose-700">derate</Pill>}
          </div>
          <p className="text-[11px] text-slate-400">Operating snapshot the ECU recorded when this fault code was set.</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-slate-500">First seen</dt>
            <dd className="text-right text-slate-700">{formatDateTime(event.first_seen_ts)}</dd>
            <dt className="text-slate-500">Odometer</dt>
            <dd className="text-right text-slate-700">{formatNumber(event.odometer_km_at_first)} km</dd>
            <dt className="text-slate-500">Occurrences</dt>
            <dd className="text-right text-slate-700">{event.occurrence_count}</dd>
            {Object.entries(event.freeze_frame ?? {}).map(([k, val]) => (
              <React.Fragment key={k}>
                <dt className="text-slate-500">{freezeLabel(k)}</dt>
                <dd className="text-right tabular-nums text-slate-700">{val === null ? "—" : formatNumber(val, 1)}</dd>
              </React.Fragment>
            ))}
          </dl>
          {!event.freeze_frame && <p className="text-xs text-slate-400">No freeze frame was recorded for this code.</p>}
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-slate-700">{event.dim_dtc?.recommended_action}</p>
        </div>
      </div>
    </div>
  );
}

export default function AssetDiagnosticsView({ vehicleId }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);
  const { loading, error, raw } = useDiagnosticsAssetData(vehicleId);
  const focusSignal = params.get("signal");

  const [selectedDtc, setSelectedDtc] = useState(null);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => assetSummary(raw), [raw]);
  const series = useMemo(() => {
    const all = assetSignalSeries(raw);
    const idx = all.findIndex((s) => s.signal.signal_code === focusSignal);
    return idx > 0 ? [all[idx], ...all.slice(0, idx), ...all.slice(idx + 1)] : all;
  }, [raw, focusSignal]);
  const timeline = useMemo(() => dtcTimeline(raw), [raw]);
  const risk = useMemo(() => partRiskTrend(raw), [raw]);
  const history = useMemo(() => serviceHistory(raw), [raw]);
  const prep = useMemo(() => workshopPrep(raw), [raw]);

  const selectedEvent = raw.dtcEvents.find((e) => e.dtc_event_id === selectedDtc) ?? null;
  const v = raw.vehicle;

  const back = () => {
    const next = new URLSearchParams(params);
    next.delete("signal");
    setParams(next, { replace: true });
    clearSelectedVin();
  };

  const copyWorkOrder = async () => {
    try {
      await navigator.clipboard.writeText(workOrderText(raw, summary, prep));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const lampSummary = Object.entries(summary.activeByLamp)
    .map(([lamp, n]) => `${n} ${lamp}`)
    .join(" · ");

  const historyColumns = [
    { key: "date", label: "Date", render: (r) => format(parseISO(r.date), "d MMM yyyy"), sortValue: (r) => r.date, csv: (r) => r.date },
    { key: "visit", label: "Visit", render: (r) => <Pill className={VISIT_STYLES[r.visitType] ?? "bg-slate-100 text-slate-600"}>{r.visitType}</Pill>, sortValue: (r) => r.visitType, csv: (r) => r.visitType },
    { key: "parts", label: "Parts replaced", render: (r) => <span className="text-slate-700">{r.parts}</span>, csv: (r) => r.parts },
    { key: "mode", label: "Failure mode", render: (r) => r.failureModes, csv: (r) => r.failureModes },
    { key: "odo", label: "Odometer", align: "right", render: (r) => (r.odometer ? `${formatNumber(r.odometer)} km` : "—"), sortValue: (r) => r.odometer, csv: (r) => r.odometer },
    { key: "downtime", label: "Downtime", align: "right", render: (r) => (r.downtime !== null ? `${formatNumber(r.downtime, 1)} h` : "—"), sortValue: (r) => r.downtime, csv: (r) => r.downtime },
    { key: "cost", label: "Cost", align: "right", render: (r) => formatInr(r.cost), sortValue: (r) => r.cost, csv: (r) => Math.round(r.cost) },
    { key: "flags", label: "", render: (r) => <span className="text-[11px] text-slate-400">{[r.predicted && "predicted", r.inWarranty && "warranty"].filter(Boolean).join(" · ")}</span>, csv: (r) => [r.predicted && "predicted", r.inWarranty && "warranty"].filter(Boolean).join(" ") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={back} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800" aria-label="Back to fleet view">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold text-slate-800">{v?.vin ?? vehicleId}</h1>
              <RiskPill band={summary.band} />
              {summary.warranty && (
                <Pill className={summary.warranty.inWarranty ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                  {summary.warranty.inWarranty ? "In warranty" : "Out of warranty"}
                </Pill>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {v ? `${v.model_label} · ${v.application_name} · ${v.region_name} · ${v.location_name ?? ""}` : "Loading…"}
              {summary.warranty && ` · warranty to ${summary.warranty.endDate ? formatDay(summary.warranty.endDate) : "—"} / ${summary.warranty.kmLimit ? `${formatNumber(summary.warranty.kmLimit)} km` : "—"}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/telematics-data")}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Truck className="h-3.5 w-3.5" /> Trips & driving
        </button>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn't load diagnostics for this truck: {error.message}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Worst-Part Risk"
          badge="NOW"
          value={summary.worst ? formatPct(summary.worst.failure_probability * 100, 0) : "—"}
          subtitle={summary.worst?.dim_part?.part_name}
          icon={ShieldAlert}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Highest 30-day failure probability across this truck's monitored parts (latest weekly or alert prediction)."
        />
        <KpiCard
          title="Min RUL"
          badge="NOW"
          value={summary.minRulKm !== null ? `${formatNumber(summary.minRulKm)} km` : "—"}
          subtitle={summary.minRulDays !== null ? `≈ ${formatNumber(summary.minRulDays)} days` : undefined}
          icon={Gauge}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Shortest remaining useful life across the monitored parts: how far the truck can go before the first predicted replacement."
        />
        <KpiCard
          title="Active Faults"
          badge="NOW"
          value={formatNumber(summary.activeCount)}
          subtitle={lampSummary || "no active codes"}
          icon={AlertOctagon}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="Active J1939 fault codes on this truck, by lamp."
        />
        <KpiCard
          title="Signals Out of Band"
          badge="NOW"
          value={`${summary.outOfBand} / ${summary.signalsTracked}`}
          icon={SlidersHorizontal}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          tooltip="Health signals whose latest reading is outside the normal band (dim_signal)."
        />
        <KpiCard
          title="Odometer"
          badge="NOW"
          value={summary.odometer !== null ? `${formatNumber(summary.odometer)} km` : "—"}
          icon={Timer}
          iconBgClass="bg-slate-100"
          iconColorClass="text-slate-600"
          loading={loading}
          tooltip="Odometer at the end of the latest data day."
        />
        <KpiCard
          title="Last Ping"
          badge="NOW"
          value={summary.lastPing ? formatDateTime(summary.lastPing) : "—"}
          icon={Radio}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Time of the truck's latest telematics report."
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Health Signals</h3>
          <span className="text-[11px] text-slate-400">Green band = normal · amber / red dashed = warning / critical · red dots = anomalous readings</span>
        </div>
        {loading ? (
          <ChartSkeleton height="h-72" />
        ) : series.length === 0 ? (
          <EmptyChart message="No health-signal readings for this truck in the period." />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {series.map((s) => (
              <SignalCard key={s.signal.signal_code} series={s} focused={s.signal.signal_code === focusSignal} />
            ))}
          </div>
        )}
      </div>

      <ChartCard
        title="Fault Code Timeline"
        badge="PERIOD"
        tooltip="Each fault code on this truck from first seen to cleared (or now), coloured by lamp. Faded bars are intermittent codes that self-healed. Click a bar to open its freeze frame."
      >
        {loading ? (
          <ChartSkeleton height="h-40" />
        ) : timeline.bars.length === 0 ? (
          <EmptyChart height="h-40" message="No fault codes in this period." />
        ) : (
          <>
            <DtcGantt timeline={timeline} selected={selectedDtc} onSelect={setSelectedDtc} />
            <p className="mt-2 text-[11px] text-slate-400">Click a bar to see the freeze frame the ECU recorded when the code was set.</p>
          </>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Part Failure Risk Trend"
          badge="PERIOD"
          tooltip="Weekly predicted 30-day failure probability for the five parts with the highest peak risk. Dashed lines mark the day the model raised an alert."
        >
          {loading ? (
            <ChartSkeleton />
          ) : risk.rows.length === 0 ? (
            <EmptyChart message="No predictions for this truck in the period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={risk.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} unit="%" domain={[0, "auto"]} />
                <ReferenceLine y={70} stroke="#e11d48" strokeDasharray="4 3" />
                {risk.alerts.map((a) => (
                  <ReferenceLine key={`${a.date}-${a.part}`} x={a.date} stroke="#e11d48" strokeDasharray="2 2" />
                ))}
                <RechartsTooltip labelFormatter={formatDay} formatter={(v, name) => [`${v}%`, name]} />
                <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {risk.parts.map((p, i) => (
                  <Line key={p} type="monotone" dataKey={p} stroke={PART_COLORS[i % PART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Workshop Prep"
          badge="NOW"
          tooltip="What the workshop should do and stage before this truck arrives: recommended actions from the active fault codes and high-risk predictions, and the likely parts with stock at the truck's home depot and in its region."
          actions={
            <button
              type="button"
              onClick={copyWorkOrder}
              disabled={loading || !v}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy work-order summary"}
            </button>
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : prep.actions.length === 0 && prep.parts.length === 0 ? (
            <EmptyChart message="Nothing to prepare: no active faults or high-risk predictions." />
          ) : (
            <div className="space-y-4">
              <ul className="space-y-2">
                {prep.actions.map((a) => (
                  <li key={a.key} className="rounded-lg border border-slate-100 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{a.title}</p>
                        <p className="text-[11px] text-slate-400">{a.source}</p>
                      </div>
                      <ActionPill action={a.urgency} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{a.action}</p>
                  </li>
                ))}
              </ul>
              {prep.parts.length > 0 && (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="py-1">Part to stage</th>
                      <th className="py-1">Why</th>
                      <th className="py-1 text-right">Home depot</th>
                      <th className="py-1 text-right">Region</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prep.parts.map((p) => (
                      <tr key={p.partId}>
                        <td className="py-1.5">
                          <button type="button" onClick={() => navigate(`/component-reliability?part=${p.partId}`)} className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-sky-700">
                            <Wrench className="h-3 w-3" /> {p.partName}
                          </button>
                        </td>
                        <td className="py-1.5 text-slate-500">{p.reason}</td>
                        <td className={`py-1.5 text-right tabular-nums ${p.atLocation ? "text-slate-700" : "text-rose-600"}`}>{formatNumber(p.atLocation)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700">{formatNumber(p.inRegions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      <DataTable
        title="Service History"
        tooltip="Every workshop visit for this truck since it entered service, with the parts replaced. Breakdowns (red) are the visits predictive maintenance aims to turn into predicted visits (green)."
        columns={historyColumns}
        rows={history}
        rowKey={(r) => r.roId}
        loading={loading}
        emptyMessage="No workshop visits recorded."
        searchPlaceholder="Search parts, failure mode…"
        searchText={(r) => `${r.parts} ${r.failureModes} ${r.visitType}`}
        initialSort={{ key: "date", dir: "desc" }}
        csvName={`service-history-${v?.vin ?? vehicleId}.csv`}
      />
      {selectedEvent && <FreezeFrameModal event={selectedEvent} onClose={() => setSelectedDtc(null)} />}
    </div>
  );
}

