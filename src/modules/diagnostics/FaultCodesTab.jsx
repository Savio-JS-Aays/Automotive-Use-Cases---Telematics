import React, { useMemo, useRef, useState } from "react";
import RankedBars from "../../components/ui/RankedBars";
import Modal from "../../components/ui/Modal";
import { useNavigate } from "react-router-dom";
import { AlertOctagon, Gauge, Siren, Timer } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import KpiCard from "../../components/kpi/KpiCard";
import {
  FAULT_TONES,
  LAMPS,
  LAMP_MEANING,
  activeDtcRows,
  dtcCodeDetail,
  dtcRateTrend,
  faultConditions,
  faultKpis,
  lifecycleFunnel,
  systemLabel,
  systemMatrixCell,
  systemModelMatrix,
  topFaults,
} from "./diagnosticsMetrics";
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, LEGEND_STYLE, formatDay, formatNumber, formatPct, truncateString } from "../telematics/telematicsFormat";
import { ChartCard, ChartSkeleton, DataTable, EmptyChart, FilterChips, HeatGrid, LocalSelect, Segmented } from "../telematics/TelematicsUi";
import { ActionPill, LampPill, SeverityPill } from "./diagnosticsUi";
import DtcCodePanel from "./DtcCodePanel";

const EMPTY_CROSS = { modelId: null, regionId: null, application: null, system: null, dtcId: null };
// Matrix row dimension → the table cross-filter key a cell click sets.
const MATRIX_BY = { model: { label: "Model", cross: "modelId" }, region: { label: "Region", cross: "regionId" }, application: { label: "Application", cross: "application" } };

// Charts hidden from the dashboard on request (2026-10-01); flip to true to restore.
const SHOW = { rateTrend: false, lifecycle: false, conditions: false };

function ConditionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-700">{p.label}</p>
      <p className="text-slate-500">
        {p.x.toFixed(1)} °C ambient · {p.y.toFixed(0)} % load{p.intermittent ? " · intermittent" : ""}
      </p>
    </div>
  );
}

export default function FaultCodesTab({ raw, loading, onOpenAsset }) {
  const navigate = useNavigate();
  const [faultScope, setFaultScope] = useState("period");
  const [cross, setCross] = useState(EMPTY_CROSS);
  const [panelCode, setPanelCode] = useState(null);
  const tableRef = useRef(null);

  const kpis = useMemo(() => faultKpis(raw), [raw]);
  const trend = useMemo(() => dtcRateTrend(raw), [raw]);
  const faults = useMemo(() => topFaults(raw, { scope: faultScope, limit: 30 }), [raw, faultScope]);
  const [matrixBy, setMatrixBy] = useState("model");
  const [matrixScope, setMatrixScope] = useState("period");
  const [matrixSeverity, setMatrixSeverity] = useState("all");
  const [matrixLamp, setMatrixLamp] = useState("all");
  const matrixOpts = useMemo(
    () => ({ by: matrixBy, scope: matrixScope, severity: matrixSeverity, lamp: matrixLamp }),
    [matrixBy, matrixScope, matrixSeverity, matrixLamp]
  );
  const matrix = useMemo(() => systemModelMatrix(raw, matrixOpts), [raw, matrixOpts]);
  const [cellDrill, setCellDrill] = useState(null); // { groupId, groupLabel, system, systemLabel }
  const [cellSearch, setCellSearch] = useState("");
  const cellData = useMemo(
    () => (cellDrill ? systemMatrixCell(raw, matrixOpts, cellDrill.groupId, cellDrill.system) : null),
    [raw, matrixOpts, cellDrill]
  );
  const cellEvents = useMemo(() => {
    if (!cellData) return [];
    const q = cellSearch.trim().toLowerCase();
    return q ? cellData.events.filter((e) => `${e.vin ?? ""} ${e.vehicleId} ${e.dtcId} ${e.name}`.toLowerCase().includes(q)) : cellData.events;
  }, [cellData, cellSearch]);
  const funnel = useMemo(() => lifecycleFunnel(raw), [raw]);
  const conditions = useMemo(() => faultConditions(raw), [raw]);
  const activeRows = useMemo(() => activeDtcRows(raw), [raw]);
  const detail = useMemo(() => (panelCode ? dtcCodeDetail(raw, panelCode) : null), [raw, panelCode]);

  const tableRows = useMemo(
    () =>
      activeRows.filter(
        (r) =>
          (!cross.modelId || r.modelId === cross.modelId) &&
          (!cross.regionId || r.regionId === cross.regionId) &&
          (!cross.application || r.application === cross.application) &&
          (!cross.system || r.system === cross.system) &&
          (!cross.dtcId || r.dtcId === cross.dtcId)
      ),
    [activeRows, cross]
  );

  const applyCross = (patch) => {
    setCross((prev) => ({ ...prev, ...patch }));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const chips = [
    cross.modelId && { key: "modelId", label: `Model: ${raw.vehicles.find((v) => v.model_id === cross.modelId)?.model_label ?? cross.modelId}` },
    cross.regionId && { key: "regionId", label: `Region: ${raw.vehicles.find((v) => v.region_id === cross.regionId)?.region_name ?? cross.regionId}` },
    cross.application && { key: "application", label: `Application: ${cross.application}` },
    cross.system && { key: "system", label: `System: ${systemLabel(cross.system)}` },
    cross.dtcId && { key: "dtcId", label: `Code: ${cross.dtcId}` },
  ].filter(Boolean);

  const noVehicles = !loading && raw.vehicles.length === 0;
  const sparkline = trend.filter((t) => t.total !== null).map((t) => ({ value: t.total }));

  const columns = [
    { key: "vin", label: "VIN", render: (r) => <span className="font-medium text-slate-700 group-hover:text-sky-700">{r.vin}</span>, sortValue: (r) => r.vin, csv: (r) => r.vin, className: "" },
    { key: "model", label: "Model", render: (r) => r.modelLabel, sortValue: (r) => r.modelLabel, csv: (r) => r.modelLabel },
    {
      key: "code",
      label: "Fault code",
      render: (r) => (
        <div>
          <p className="font-medium text-slate-700">{r.label}</p>
          <p className="text-[11px] text-slate-400">{r.dtcId}</p>
        </div>
      ),
      sortValue: (r) => r.dtcId,
      csv: (r) => `${r.dtcId} ${r.label}`,
    },
    { key: "system", label: "System", render: (r) => systemLabel(r.system), sortValue: (r) => r.system, csv: (r) => systemLabel(r.system) },
    { key: "lamp", label: "Lamp", render: (r) => <LampPill lamp={r.lamp} />, sortValue: (r) => r.lamp, csv: (r) => r.lamp },
    { key: "severity", label: "Severity", render: (r) => <SeverityPill severity={r.severity} />, sortValue: (r) => ["critical", "major", "minor"].indexOf(r.severity), csv: (r) => r.severity },
    { key: "age", label: "Age", align: "right", render: (r) => `${formatNumber(r.ageDays, 1)} d`, sortValue: (r) => r.ageDays, csv: (r) => r.ageDays.toFixed(1) },
    { key: "occ", label: "Occur.", align: "right", render: (r) => formatNumber(r.occurrences), sortValue: (r) => r.occurrences, csv: (r) => r.occurrences },
    { key: "derate", label: "Derate", render: (r) => (r.derate ? <span className="text-xs font-semibold text-rose-600">Yes</span> : <span className="text-slate-300">—</span>), sortValue: (r) => (r.derate ? 1 : 0), csv: (r) => (r.derate ? "yes" : "no") },
    { key: "recommended", label: "Recommended action", render: (r) => <span className="text-xs text-slate-500">{r.recommended}</span>, csv: (r) => r.recommended },
    { key: "action", label: "Action", render: (r) => <ActionPill action={r.action} />, sortValue: (r) => (r.action === "Immediate Service" ? 0 : 1), csv: (r) => r.action },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Trucks with Warning Lamp"
          badge="NOW"
          value={`${kpis.trucksRed + kpis.trucksAmber}`}
          subtitle={`${kpis.trucksRed} red (RSL / PL) · ${kpis.trucksAmber} amber (AWL / MIL)`}
          icon={Siren}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          tooltip="Distinct trucks with at least one active fault code, split by the most severe lamp. Red (stop / protect) means the truck should come off the road now; amber means book a workshop slot."
        />
        <KpiCard
          title="Active Fault Codes"
          badge="NOW"
          value={formatNumber(kpis.activeCodes)}
          subtitle={`${kpis.bySeverity.critical} critical · ${kpis.bySeverity.major} major · ${kpis.bySeverity.minor} minor`}
          icon={AlertOctagon}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          tooltip="J1939 DTC events with status 'active' right now (intermittent codes that self-healed are excluded). Severity comes from the OEM fault catalog."
        />
        <KpiCard
          title="DTC Rate per 10k km"
          badge="PERIOD"
          value={kpis.rate !== null ? formatNumber(kpis.rate, 2) : "—"}
          delta={kpis.rateDeltaPct !== null ? { value: kpis.rateDeltaPct, unit: "%", positiveIsGood: false } : null}
          sparkline={sparkline}
          sparklineColor="#e11d48"
          subtitle={`${kpis.periodEvents} new codes in the period`}
          icon={Gauge}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="New non-intermittent fault codes first seen in the period ÷ km driven × 10,000. Normalising by distance makes fleets of different size and duty comparable. Sparkline = 7-day rolling."
        />
        <KpiCard
          title="Mean Time to Clear"
          badge="PERIOD"
          value={kpis.meanDaysToClear !== null ? `${formatNumber(kpis.meanDaysToClear, 1)} d` : "—"}
          subtitle={`${kpis.clearedCount} codes cleared · ${formatPct(kpis.intermittentShare, 0)} intermittent`}
          icon={Timer}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Average days from first seen to cleared (by a repair order) for codes cleared in the period. Intermittent share = codes that self-healed without repair, excluded from the repair KPIs."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-2"
          title="Most Common Faults"
          badge={faultScope === "active" ? "NOW" : "PERIOD"}
          tooltip="Which faults hit the most trucks. Colour shows how serious: red = stop or power limited, amber = service soon. Click a bar to see what the fault means, which trucks have it and which parts usually cause it."
          actions={
            <>
              <Segmented value={faultScope} onChange={setFaultScope} options={[{ value: "period", label: "Period" }, { value: "active", label: "Active now" }]} />
            </>
          }
        >
          {loading ? (
            <ChartSkeleton height="h-80" />
          ) : faults.rows.length === 0 ? (
            <EmptyChart height="h-80" message="No faults in this scope." />
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{faults.rows[0].name}</span> is the most widespread fault:{" "}
                {faults.rows[0].trucks} of {faults.fleetTrucks} trucks with a fault.
              </p>
              <div className="max-h-[22rem] overflow-y-auto pr-1">
              <RankedBars
                rows={faults.rows}
                getLabel={(r) => r.name}
                valueKey="trucks"
                getColor={(r) => FAULT_TONES[r.tone].color}
                formatValue={(r) => `${r.trucks} ${r.trucks === 1 ? "truck" : "trucks"}`}
                renderDetail={(f) => `${f.dtcId} · ${systemLabel(f.system)} · raised ${f.count} ${f.count === 1 ? "time" : "times"} · ${f.active} active now · ${LAMP_MEANING[f.lamp] ?? f.lamp}`}
                onRowClick={(r) => setPanelCode(r.dtcId)}
              />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                {Object.values(FAULT_TONES).map((tone) => (
                  <span key={tone.label} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: tone.color }} />
                    {tone.label}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Showing the top {faults.rows.length} of {faults.codes} faults · {faults.fleetTrucks} trucks had at least one.
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard
          className="xl:col-span-3"
          title={`Faults by System × ${MATRIX_BY[matrixBy].label}`}
          badge={matrixScope === "active" ? "NOW" : "PERIOD"}
          actions={
            <>
              <Segmented size="xs" value={matrixBy} onChange={setMatrixBy} options={Object.entries(MATRIX_BY).map(([value, d]) => ({ value, label: d.label }))} />
              <Segmented size="xs" value={matrixScope} onChange={setMatrixScope} options={[{ value: "period", label: "New in period" }, { value: "active", label: "Active now" }]} />
              <LocalSelect
                label=""
                value={matrixSeverity}
                onChange={setMatrixSeverity}
                options={[
                  { value: "all", label: "All severities" },
                  { value: "critical", label: "Critical" },
                  { value: "major", label: "Major" },
                  { value: "minor", label: "Minor" },
                ]}
              />
              <LocalSelect
                label=""
                value={matrixLamp}
                onChange={setMatrixLamp}
                options={[
                  { value: "all", label: "All lamps" },
                  { value: "red", label: "Red (stop / protect)" },
                  { value: "amber", label: "Amber (warning / MIL)" },
                ]}
              />
            </>
          }
          tooltip="New non-intermittent fault codes per 100 trucks of each model, by vehicle system. Normalising by model size shows whether a model has a systematic weakness (a quality engineering signal), not just more trucks. Click a cell to filter the active fault list."
        >
          {loading ? (
            <ChartSkeleton height="h-80" />
          ) : matrix.cols.length === 0 ? (
            <EmptyChart height="h-80" message="No fault codes match these filters." />
          ) : (
            <>
              <HeatGrid
                rows={matrix.rows}
                cols={matrix.cols}
                max={matrix.max}
                rowLabelWidth={150}
                minColWidth={60}
                colLabel={(c) => truncateString(c.label, 11)}
                cellFor={(ri, ci) => {
                  const r = matrix.rows[ri];
                  const c = matrix.cols[ci];
                  const cell = matrix.cells.get(`${r.id}|${c.id}`);
                  return {
                    value: cell.per100,
                    display: cell.count ? formatNumber(cell.per100, 1) : "·",
                    sub: cell.count ? `${cell.count}` : undefined,
                    muted: cell.muted,
                    title: `${r.label} · ${c.label}: ${cell.count} codes on ${r.trucks} trucks (${cell.per100.toFixed(1)} per 100 trucks)${cell.muted ? " · fewer than 5 trucks" : ""}`,
                    onClick: cell.count
                      ? () => {
                          setCellDrill({ groupId: r.id, groupLabel: r.label, system: c.id, systemLabel: c.label });
                          setCellSearch("");
                        }
                      : undefined,
                  };
                }}
              />
              <p className="mt-2 text-[11px] text-slate-400">Cell = codes per 100 trucks of that {MATRIX_BY[matrixBy].label.toLowerCase()} (small number = count). Groups with fewer than 5 trucks in scope are greyed. Click a cell for its fault codes and trucks.</p>
            </>
          )}
        </ChartCard>
      </div>

      {(SHOW.rateTrend || SHOW.lifecycle) && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {SHOW.rateTrend && (
        <ChartCard
          className={SHOW.lifecycle ? "xl:col-span-2" : "xl:col-span-3"}
          title="DTC Rate Trend by Lamp"
          badge="PERIOD"
          tooltip="New non-intermittent fault codes per 10,000 km, 7-day rolling, stacked by the lamp they light. A rising red band means more trucks being stopped on the road; a rising amber band is workload arriving at the workshops."
        >
          {loading ? (
            <ChartSkeleton />
          ) : noVehicles ? (
            <EmptyChart message="No connected trucks match the filters." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={40} />
                <RechartsTooltip labelFormatter={formatDay} formatter={(v, name) => [v === null ? "—" : Number(v).toFixed(2), name]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
                {LAMPS.map((l) => (
                  <Area key={l.id} type="monotone" dataKey={l.id} name={l.label} stackId="lamp" stroke={l.color} fill={l.color} fillOpacity={0.35} connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}

        {SHOW.lifecycle && (
        <ChartCard
          className={SHOW.rateTrend ? "" : "xl:col-span-3"}
          title="Fault Lifecycle"
          badge="PERIOD"
          tooltip="What happened to the non-intermittent fault codes first seen in the period: how many escalated to engine derate, how many got a repair order, and how many are cleared. A large gap between 'Raised' and 'Repair order opened' is unaddressed faults."
        >
          {loading ? (
            <ChartSkeleton />
          ) : funnel[0].count === 0 ? (
            <EmptyChart message="No fault codes first seen in this period." />
          ) : (
            <RankedBars
              rows={funnel}
              getLabel={(r) => r.stage}
              valueKey="count"
              getColor={(r) => r.color}
              formatValue={(r) => `${r.count} · ${r.pct.toFixed(0)}%`}
            />
          )}
        </ChartCard>
        )}
      </div>
      )}

      {SHOW.conditions && (
      <ChartCard
        title="Operating Conditions at Fault"
        badge="PERIOD"
        tooltip="Freeze-frame snapshot recorded when each code (first seen in the period) was set: ambient temperature against engine load, coloured by vehicle system. Clusters in the hot, high-load corner point to thermal or duty-cycle causes rather than part defects."
      >
        {loading ? (
          <ChartSkeleton />
        ) : conditions.length === 0 ? (
          <EmptyChart message="No freeze-frame data in this period." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis type="number" dataKey="x" name="Ambient" unit="°C" domain={["dataMin - 2", "dataMax + 2"]} tickFormatter={(v) => Number(v).toFixed(0)} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis type="number" dataKey="y" name="Load" unit="%" domain={[0, 100]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} width={44} />
              <ZAxis range={[40, 40]} />
              <RechartsTooltip content={<ConditionTooltip />} />
              <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={LEGEND_STYLE} />
              {conditions.map((g) => (
                <Scatter key={g.system} name={g.label} data={g.points} fill={g.color} fillOpacity={0.75} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      )}

      <DataTable
        tableRef={tableRef}
        title="Active Fault Codes"
        tooltip="Every fault code active now, with the OEM's recommended action. Immediate Service = red stop or protect lamp; Plan Workshop = amber or malfunction lamp. Click a row to open the truck's Asset View."
        columns={columns}
        rows={tableRows}
        rowKey={(r) => r.id}
        onRowClick={(r) => onOpenAsset(r.vehicleId)}
        loading={loading}
        emptyMessage={chips.length ? "No active fault codes match the selection." : "No active fault codes. The fleet is clear."}
        searchPlaceholder="Search VIN, code, description…"
        searchText={(r) => `${r.vin} ${r.dtcId} ${r.label} ${r.modelLabel}`}
        initialSort={{ key: "action", dir: "asc" }}
        csvName="active-fault-codes.csv"
        toolbar={
          <FilterChips chips={chips} onRemove={(key) => setCross((prev) => ({ ...prev, [key]: null }))} onClear={() => setCross(EMPTY_CROSS)} />
        }
      />

      {detail && (
        <DtcCodePanel
          detail={detail}
          onClose={() => setPanelCode(null)}
          onOpenAsset={(id) => {
            setPanelCode(null);
            onOpenAsset(id);
          }}
          onOpenPart={(partId) => navigate(`/component-reliability?part=${partId}`)}
          onFilterTable={() => {
            setPanelCode(null);
            applyCross({ dtcId: detail.dtcId });
          }}
        />
      )}

      <Modal
        open={Boolean(cellDrill)}
        onClose={() => setCellDrill(null)}
        widthClass="max-w-4xl"
        title={cellDrill ? `${cellDrill.groupLabel} · ${cellDrill.systemLabel}` : ""}
        subtitle={
          cellData
            ? `${cellData.events.length} fault ${cellData.events.length === 1 ? "event" : "events"} on ${cellData.trucks} ${cellData.trucks === 1 ? "truck" : "trucks"} · ${
                matrixScope === "active" ? "active now" : "new in the period"
              }${matrixSeverity !== "all" ? ` · ${matrixSeverity}` : ""}${matrixLamp !== "all" ? ` · ${matrixLamp} lamp` : ""}`
            : ""
        }
        actions={
          <input
            type="search"
            value={cellSearch}
            onChange={(e) => setCellSearch(e.target.value)}
            placeholder="Search VIN, vehicle or code"
            className="w-52 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
        }
      >
        {cellData && (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Fault codes · click one for its detail</p>
              <RankedBars
                rows={cellData.codes}
                getLabel={(r) => `${r.name} · ${r.dtcId}`}
                valueKey="count"
                getColor={(r) => FAULT_TONES[r.tone].color}
                formatValue={(r) => `${r.count} on ${r.trucks} ${r.trucks === 1 ? "truck" : "trucks"}`}
                onRowClick={(r) => {
                  setCellDrill(null);
                  setPanelCode(r.dtcId);
                }}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Events{cellEvents.length !== cellData.events.length ? ` · ${cellEvents.length} of ${cellData.events.length}` : ""} · click a row to open the truck
              </p>
              {cellEvents.length === 0 ? (
                <p className="text-sm text-slate-400">No event matches that search.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Truck</th>
                        <th className="px-3 py-2 font-semibold">Fault</th>
                        <th className="px-3 py-2 font-semibold">Lamp</th>
                        <th className="px-3 py-2 font-semibold">Severity</th>
                        <th className="px-3 py-2 font-semibold">First seen</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cellEvents.map((e) => (
                        <tr
                          key={e.id}
                          onClick={() => {
                            setCellDrill(null);
                            onOpenAsset(e.vehicleId);
                          }}
                          className="cursor-pointer hover:bg-sky-50"
                        >
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-700">{e.vin ?? e.vehicleId}</p>
                            <p className="text-[11px] text-slate-400">
                              {e.modelLabel} · {e.regionName}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-slate-700">{e.name}</p>
                            <p className="text-[11px] text-slate-400">{e.dtcId}</p>
                          </td>
                          <td className="px-3 py-2"><LampPill lamp={e.lamp} /></td>
                          <td className="px-3 py-2"><SeverityPill severity={e.severity} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.firstSeen ? formatDay(e.firstSeen.slice(0, 10)) : "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{e.status === "previously_active" ? "self-cleared" : e.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
