import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, Gauge, Radio, Siren, Search, X } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { format, formatDistanceStrict, parseISO } from "date-fns";
import KpiCard from "../../components/kpi/KpiCard";
import ChartHeader from "../../components/ui/ChartHeader";
import { useOverviewData, ACTION_STATUSES } from "../../hooks/useOverviewData";
import { useFilterStore } from "../../store/useFilterStore";

const STATUS_STYLES = {
  "Immediate Service": "bg-rose-100 text-rose-700",
  "Plan Workshop": "bg-amber-100 text-amber-700",
  Monitor: "bg-slate-100 text-slate-600",
};

const BAND_TEXT = {
  Critical: "text-rose-600",
  High: "text-amber-600",
  Medium: "text-sky-600",
  Low: "text-emerald-600",
};

const LAMP_STYLES = {
  RSL: "bg-rose-600 text-white",
  AWL: "bg-amber-400 text-amber-950",
  MIL: "bg-amber-100 text-amber-800",
  PL: "bg-slate-200 text-slate-700",
};

const STALE_PING_HOURS = 48;
const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };
const LEGEND_STYLE = { fontSize: 12 };

function truncateString(str, max = 22) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function formatPct(value, digits = 1) {
  return value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;
}

function Pill({ className, children }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function ChartCard({ title, tooltip, badge, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <ChartHeader title={title} tooltip={tooltip} />
        {badge && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${
              badge === "NOW" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded bg-slate-50" />;
}

function EmptyChart({ message }) {
  return <div className="flex h-64 items-center justify-center text-sm text-slate-400">{message}</div>;
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-slate-700">7 days to {format(parseISO(label), "d MMM")}</p>
      <p className="text-violet-600">
        Prediction alerts: {p.alertsPer100} per 100 trucks ({p.alerts})
      </p>
      <p className="text-rose-600">
        Major/critical DTCs: {p.dtcsPer100} per 100 trucks ({p.dtcs})
      </p>
    </div>
  );
}

function RiskMatrix({ matrix, onSelect }) {
  if (matrix.rows.length === 0) return <EmptyChart message="No connected trucks match the filters." />;
  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1 text-xs"
        style={{ gridTemplateColumns: `minmax(64px, auto) repeat(${matrix.cols.length}, minmax(72px, 1fr))` }}
      >
        <div />
        {matrix.cols.map((c) => (
          <div key={c.id} className="px-1 pb-1 text-center font-medium leading-tight text-slate-500" title={c.label}>
            {truncateString(c.label.replace("Mercedes-Benz ", "MB "), 16)}
          </div>
        ))}
        {matrix.rows.map((r, ri) => (
          <React.Fragment key={r.id}>
            <div className="flex items-center pr-2 font-medium text-slate-600">{r.label}</div>
            {matrix.cells[ri].map((cell) => {
              if (cell.total === 0) {
                return <div key={cell.modelId} className="h-12 rounded bg-slate-50" />;
              }
              const alpha = cell.lowSample || cell.atRisk === 0 ? 0 : 0.15 + Math.min(cell.pct / 30, 1) * 0.75;
              const dark = alpha > 0.5;
              return (
                <button
                  type="button"
                  key={cell.modelId}
                  onClick={() => onSelect(cell)}
                  title={`${r.label} · ${cell.modelId}: ${cell.atRisk} of ${cell.total} trucks at risk${
                    cell.lowSample ? ` (fewer than ${matrix.minTrucks} trucks, not rated)` : ""
                  }`}
                  className={`flex h-12 flex-col items-center justify-center rounded transition-transform hover:scale-[1.04] ${
                    cell.lowSample
                      ? "bg-slate-100 text-slate-400"
                      : cell.atRisk === 0
                        ? "text-slate-400 ring-1 ring-inset ring-slate-100"
                        : dark
                          ? "text-white"
                          : "text-slate-700"
                  }`}
                  style={cell.lowSample ? undefined : { backgroundColor: `rgba(225, 29, 72, ${alpha})` }}
                >
                  <span className="text-sm font-semibold">{cell.lowSample ? "—" : `${Math.round(cell.pct)}%`}</span>
                  <span className="text-[10px] opacity-80">
                    {cell.atRisk}/{cell.total}
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Cell = % of connected trucks at Critical or High risk. Grey cells have fewer than {matrix.minTrucks} trucks and
        are not rated.
      </p>
    </div>
  );
}

const EMPTY_FILTERS = { risk: null, regionId: null, modelId: null, partName: null, dueSoon: false };

export default function OverviewModule() {
  const { loading, error, kpis, riskPosture, earlyWarningTrend, riskMatrix, topFailingParts, actionRows } =
    useOverviewData();
  const selectedVin = useFilterStore((s) => s.selectedVin);
  const setSelectedVin = useFilterStore((s) => s.setSelectedVin);
  const clearSelectedVin = useFilterStore((s) => s.clearSelectedVin);
  const navigate = useNavigate();
  const tableRef = useRef(null);

  const [crossFilters, setCrossFilters] = useState(EMPTY_FILTERS);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  const applyCrossFilter = (patch) => {
    setCrossFilters((prev) => ({ ...prev, ...patch }));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openDiagnostics = (vehicleId) => {
    setSelectedVin(vehicleId);
    navigate("/vehicle-diagnostics");
  };

  const regionLabel = (id) => riskMatrix.rows.find((r) => r.id === id)?.label ?? id;
  const modelLabel = (id) => riskMatrix.cols.find((c) => c.id === id)?.label ?? id;

  const activeChips = [
    crossFilters.risk && {
      key: "risk",
      label: crossFilters.risk === "AtRisk" ? "Critical + High" : `Risk: ${crossFilters.risk}`,
    },
    crossFilters.regionId && { key: "regionId", label: `Region: ${regionLabel(crossFilters.regionId)}` },
    crossFilters.modelId && { key: "modelId", label: `Model: ${modelLabel(crossFilters.modelId)}` },
    crossFilters.partName && { key: "partName", label: `Part: ${crossFilters.partName}` },
    crossFilters.dueSoon && { key: "dueSoon", label: "Due ≤ 14 days" },
  ].filter(Boolean);

  const partOptions = useMemo(
    () => [...new Set(actionRows.map((r) => r.partName).filter(Boolean))].sort(),
    [actionRows]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return actionRows.filter((r) => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (crossFilters.risk === "AtRisk" && r.band !== "Critical" && r.band !== "High") return false;
      if (crossFilters.risk && crossFilters.risk !== "AtRisk" && r.band !== crossFilters.risk) return false;
      if (crossFilters.regionId && r.regionId !== crossFilters.regionId) return false;
      if (crossFilters.modelId && r.modelId !== crossFilters.modelId) return false;
      if (crossFilters.partName && r.partName !== crossFilters.partName) return false;
      if (crossFilters.dueSoon && !(r.rulDays !== null && r.rulDays <= 14)) return false;
      if (term && !r.vin?.toLowerCase().includes(term) && !r.vehicleId.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [actionRows, statusFilter, crossFilters, search]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(ACTION_STATUSES.map((s) => [s, 0]));
    for (const r of actionRows) counts[r.status] += 1;
    return counts;
  }, [actionRows]);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Couldn't load overview data: {error.message}
      </div>
    );
  }

  const fleetLabel = kpis.fleetSize > 0 ? `of ${kpis.fleetSize} connected trucks` : "no connected trucks in scope";
  const riskPct = kpis.fleetSize > 0 ? (kpis.atRiskCount / kpis.fleetSize) * 100 : 0;
  const trendHasData = earlyWarningTrend.some((p) => p.alerts > 0 || p.dtcs > 0);

  return (
    <div className="space-y-4">
      {selectedVin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <span>
            Truck <span className="font-semibold">{selectedVin}</span> is selected. The Overview always shows the whole
            fleet.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/vehicle-diagnostics")}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              Open in Diagnostics
            </button>
            <button
              type="button"
              onClick={clearSelectedVin}
              className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
            >
              Back to fleet
            </button>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Trucks at Risk"
          badge="NOW"
          value={kpis.atRiskCount}
          subtitle={`${fleetLabel} (${riskPct.toFixed(1)}%) · ${kpis.criticalCount} Critical`}
          icon={AlertTriangle}
          iconBgClass="bg-rose-50"
          iconColorClass="text-rose-600"
          loading={loading}
          onClick={() => applyCrossFilter({ risk: "AtRisk" })}
          tooltip="Trucks whose worst monitored part has a 30-day failure probability of 40% or more (Critical above 70%, High 40–70%), from the latest weekly prediction. Click to list them."
        />
        <KpiCard
          title="Trucks with Active Faults"
          badge="NOW"
          value={kpis.activeFaultTrucks}
          subtitle={`${kpis.redOrDerateTrucks} with red stop lamp or engine derate`}
          icon={Siren}
          iconBgClass="bg-amber-50"
          iconColorClass="text-amber-600"
          loading={loading}
          onClick={() => navigate("/vehicle-diagnostics")}
          tooltip="Distinct trucks with at least one DTC currently active (J1939 DM1). Red stop lamp or derate means the truck is losing uptime today. Click to open Diagnostics."
        />
        <KpiCard
          title="Due for Workshop ≤ 14 days"
          badge="NOW"
          value={kpis.dueSoonCount}
          subtitle="worst part's remaining useful life"
          icon={CalendarClock}
          iconBgClass="bg-violet-50"
          iconColorClass="text-violet-600"
          loading={loading}
          onClick={() => applyCrossFilter({ dueSoon: true })}
          tooltip="Trucks whose highest-risk part has a predicted remaining useful life of 14 days or less. Use it to book workshop slots. Click to list them."
        />
        <KpiCard
          title="Fleet Uptime"
          badge="PERIOD"
          value={formatPct(kpis.uptime)}
          delta={kpis.uptimeDelta !== null ? { value: kpis.uptimeDelta, unit: " pp", positiveIsGood: true } : null}
          sparkline={kpis.uptimeSparkline}
          sparklineColor="#10b981"
          icon={Gauge}
          iconBgClass="bg-emerald-50"
          iconColorClass="text-emerald-600"
          loading={loading}
          tooltip="Share of truck-days in the selected period when the truck was not in a workshop. The sparkline is the 7-day rolling daily uptime; the delta compares with the previous period of equal length."
        />
        <KpiCard
          title="Data Completeness"
          badge="PERIOD"
          value={formatPct(kpis.completeness)}
          delta={
            kpis.completenessDelta !== null
              ? { value: kpis.completenessDelta, unit: " pp", positiveIsGood: true }
              : null
          }
          subtitle={
            kpis.worstCompletenessRegion
              ? `Weakest: ${kpis.worstCompletenessRegion.name} (${kpis.worstCompletenessRegion.pct.toFixed(1)}%)`
              : undefined
          }
          icon={Radio}
          iconBgClass="bg-sky-50"
          iconColorClass="text-sky-600"
          loading={loading}
          tooltip="Telematics packets received ÷ packets expected (5-minute reports while running plus hourly heartbeats). Below ~95% the other numbers for that group are less reliable."
        />
      </div>

      {/* Charts 2×2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Fleet Risk Posture"
          badge="NOW"
          tooltip="Each truck counted once, by the risk band of its worst monitored part (latest weekly prediction). Click a slice to filter the action list."
        >
          {loading ? (
            <ChartSkeleton />
          ) : kpis.fleetSize === 0 ? (
            <EmptyChart message="No connected trucks match the filters." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={riskPosture}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                  onClick={(slice) => applyCrossFilter({ risk: slice.payload?.name ?? slice.name })}
                  className="cursor-pointer"
                >
                  {riskPosture.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value, name) => [`${value} trucks`, name]} />
                <Legend verticalAlign="bottom" height={32} iconType="circle" itemSorter={null} wrapperStyle={LEGEND_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Early-Warning Trend"
          badge="PERIOD"
          tooltip="Rolling 7-day count per 100 connected trucks of (a) new prediction alerts raised by the model and (b) new major/critical DTCs. Normalised so filters and fleet size don't distort it. Alerts leading DTCs means the model is warning early."
        >
          {loading ? (
            <ChartSkeleton />
          ) : !trendHasData ? (
            <EmptyChart message="No alerts or major DTCs in this period." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={earlyWarningTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => format(parseISO(d), "d MMM")}
                  tick={AXIS_TICK}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis tick={AXIS_TICK} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} width={36} />
                <RechartsTooltip content={<TrendTooltip />} />
                <Legend verticalAlign="bottom" height={28} iconType="plainline" itemSorter={null} wrapperStyle={LEGEND_STYLE} />
                <Line
                  type="monotone"
                  dataKey="alertsPer100"
                  name="Prediction alerts / 100 trucks"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="dtcsPer100"
                  name="Major/critical DTCs / 100 trucks"
                  stroke="#e11d48"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Region × Model Risk Matrix"
          badge="NOW"
          tooltip="Share of connected trucks at Critical or High risk for every region and model. Normalised per cell so large regions don't dominate. Click a cell to filter the action list."
        >
          {loading ? (
            <ChartSkeleton />
          ) : (
            <RiskMatrix
              matrix={riskMatrix}
              onSelect={(cell) => applyCrossFilter({ regionId: cell.regionId, modelId: cell.modelId })}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Top Predicted Failures by Part"
          badge="NOW"
          tooltip="Parts that are the worst part on Critical/High trucks, by number of trucks. Tells the workshop which parts and skills to prepare. Click a bar to filter the action list."
        >
          {loading ? (
            <ChartSkeleton />
          ) : topFailingParts.length === 0 ? (
            <EmptyChart message="No trucks at Critical or High risk." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topFailingParts} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="partName"
                  width={150}
                  tickFormatter={(v) => truncateString(v, 22)}
                  tick={AXIS_TICK}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <RechartsTooltip cursor={{ fill: "#f8fafc" }} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" itemSorter={null} wrapperStyle={LEGEND_STYLE} />
                <Bar
                  dataKey="Critical"
                  stackId="risk"
                  fill="#e11d48"
                  className="cursor-pointer"
                  onClick={(d) => applyCrossFilter({ partName: d.payload?.partName ?? d.partName })}
                />
                <Bar
                  dataKey="High"
                  stackId="risk"
                  fill="#f59e0b"
                  radius={[0, 4, 4, 0]}
                  className="cursor-pointer"
                  onClick={(d) => applyCrossFilter({ partName: d.payload?.partName ?? d.partName })}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Workshop Action List */}
      <div ref={tableRef} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ChartHeader
              title="Workshop Action List"
              tooltip="Trucks that need attention: Critical/High risk, due within 14 days, or an active major/critical DTC. Immediate Service = Critical, red stop lamp or derate. Plan Workshop = High or due within 14 days. Monitor = active fault only. Click a row to open the truck in Diagnostics."
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search VIN or vehicle ID"
                className="w-56 rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {["All", ...ACTION_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {s}
                {s !== "All" && <span className="ml-1 text-slate-400">{statusCounts[s]}</span>}
              </button>
            ))}
            <select
              value={crossFilters.partName ?? ""}
              onChange={(e) => setCrossFilters((prev) => ({ ...prev, partName: e.target.value || null }))}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">All parts</option>
              {partOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-white"
              >
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => setCrossFilters((prev) => ({ ...prev, [chip.key]: EMPTY_FILTERS[chip.key] }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {activeChips.length > 0 && (
              <button
                type="button"
                onClick={() => setCrossFilters(EMPTY_FILTERS)}
                className="text-xs text-slate-500 underline-offset-2 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {["Truck", "Status", "Worst Part", "Fail. Prob (30d)", "RUL", "Related DTC", "Recommended Action", "Last Ping"].map(
                  (col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-50" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">
                    No trucks need action for the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const pingHours = r.lastPing ? (now - new Date(r.lastPing).getTime()) / 36e5 : null;
                  const stale = pingHours !== null && pingHours > STALE_PING_HOURS;
                  return (
                    <tr
                      key={r.vehicleId}
                      onClick={() => openDiagnostics(r.vehicleId)}
                      className="group cursor-pointer align-top transition-colors hover:bg-sky-50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700 group-hover:text-sky-700">{r.vin ?? r.vehicleId}</div>
                        <div className="text-xs text-slate-400">
                          {r.modelLabel} · {r.regionName}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill className={STATUS_STYLES[r.status]}>{r.status}</Pill>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-600">{r.partName ?? "—"}</div>
                        {r.band && <div className={`text-xs font-medium ${BAND_TEXT[r.band]}`}>{r.band}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.failureProbability !== null ? `${(r.failureProbability * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {r.rulDays !== null ? `${r.rulDays} d` : "—"}
                        {r.rulKm !== null && (
                          <div className="text-xs text-slate-400">{Number(r.rulKm).toLocaleString("en-IN")} km</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.relatedDtc ? (
                          <div className="flex items-start gap-1.5">
                            {r.relatedDtc.lamp && (
                              <Pill className={`${LAMP_STYLES[r.relatedDtc.lamp] ?? "bg-slate-100 text-slate-600"} px-1.5`}>
                                {r.relatedDtc.lamp}
                              </Pill>
                            )}
                            <div>
                              <div className="whitespace-nowrap font-mono text-xs text-slate-700">{r.relatedDtc.dtcId}</div>
                              <div className="text-xs text-slate-400">
                                {truncateString(r.relatedDtc.description, 28)}
                                {r.relatedDtc.status !== "active" && " · not active"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-slate-600">{r.action ?? "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-xs ${stale ? "font-medium text-amber-600" : "text-slate-500"}`}>
                        {!r.lastPing
                          ? "—"
                          : pingHours < 1
                            ? "just now"
                            : formatDistanceStrict(new Date(r.lastPing), now, { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
