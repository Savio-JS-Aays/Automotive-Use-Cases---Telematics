// Shared look for vertical (column) bar charts: wide bars with rounded tops, the value printed
// above each bar, bold category labels, a quiet value axis on the right and horizontal grid only.
// Colours stay with each chart.

export const BAR_GRID = { stroke: "#f1f5f9", vertical: false };
export const BAR_X_AXIS = {
  axisLine: false,
  tickLine: false,
  tickMargin: 10,
  tick: { fontSize: 12, fontWeight: 600, fill: "#334155" },
};
export const BAR_Y_AXIS = {
  orientation: "right",
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: "#94a3b8" },
};
/** Second value axis on dual-axis charts (left side, same quiet style). */
export const BAR_Y_AXIS_LEFT = { ...BAR_Y_AXIS, orientation: "left" };
export const BAR_RADIUS = [6, 6, 0, 0];
export const BAR_CHART_PROPS = { barCategoryGap: "22%", margin: { top: 24, right: 4, left: 4, bottom: 0 } };
export const BAR_MAX_SIZE = 72;
export const VALUE_LABEL = { position: "top", offset: 8, fontSize: 11, fontWeight: 600, fill: "#475569" };
/** Above this many bars the value labels overlap, so they are left off. */
export const MAX_LABELLED_BARS = 16;
