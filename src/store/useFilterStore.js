import { create } from "zustand";

/**
 * useFilterStore
 * ---------------
 * Global filter state for the Telematics & Predictive Maintenance Dashboard.
 *
 * `selectedVin` is a special case: when it is non-null, the app is in
 * "Asset View" mode (drilled into a single vehicle from Module 2: Vehicle
 * Diagnostics). Downstream data hooks/selectors should treat a non-null
 * `selectedVin` as an override that takes precedence over `region` and
 * `vehicleModel` for whatever module is currently rendering asset-level data.
 * `dateRange` still applies in both modes.
 */
export const useFilterStore = create((set) => ({
  // ---- State ----
  dateRange: "Last 30 Days",
  region: "All Regions",
  vehicleModel: "All Models",
  selectedVin: null,

  // ---- Actions ----
  setDateRange: (dateRange) => set({ dateRange }),
  setRegion: (region) => set({ region }),
  setVehicleModel: (vehicleModel) => set({ vehicleModel }),
  setSelectedVin: (selectedVin) => set({ selectedVin }),

  // Convenience action for the Header's "Clear / Back to Fleet View" control.
  clearSelectedVin: () => set({ selectedVin: null }),
}));