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
 *
 * `region` holds a region_id (e.g. "REG002"), `vehicleModel` a model_id (e.g. "MOD005"),
 * `powertrain` a dim_v_model.powertrain value ("diesel" / "bev"), `application` an
 * application_id (duty cycle) and `customerType` a dim_customer.customer_type value. The
 * "All …" strings are the no-filter sentinels.
 */
export const useFilterStore = create((set) => ({
  // ---- State ----
  dateRange: "Last 30 Days",
  region: "All Regions",
  vehicleModel: "All Models",
  powertrain: "All Powertrains",
  application: "All Applications",
  customerType: "All Customer Types",
  selectedVin: null,

  // ---- Actions ----
  setDateRange: (dateRange) => set({ dateRange }),
  setRegion: (region) => set({ region }),
  setVehicleModel: (vehicleModel) => set({ vehicleModel }),
  setPowertrain: (powertrain) => set({ powertrain }),
  setApplication: (application) => set({ application }),
  setCustomerType: (customerType) => set({ customerType }),
  setSelectedVin: (selectedVin) => set({ selectedVin }),

  // Convenience action for the Header's "Clear / Back to Fleet View" control.
  clearSelectedVin: () => set({ selectedVin: null }),
}));