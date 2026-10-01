-- =============================================================================
-- Telematics ecosystem schema (Daimler India CV — BharatBenz / Mercedes-Benz Trucks)
-- Run via:  npm run db:migrate   (idempotent — safe to re-run)
--
-- Rules
--   * fact_telemetry / fact_vehicle_health are telematics-owned and outdated: the old
--     tables are renamed to *_legacy once and replaced by the redesigned versions.
--   * Shared tables (dim_vehicle, dim_v_model, fact_repair_orders, fact_warranty_claims)
--     only receive new NULLABLE columns. Existing columns/rows are never modified.
--   * All new tables are read-only for anon/authenticated (RLS + SELECT policy).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Preserve outdated telematics tables as *_legacy (runs once)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  c record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('fact_telemetry', 'signal_type'),
      ('fact_vehicle_health', 'remaining_useful_life')
    ) AS v(tbl, marker_col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.tbl AND column_name = t.marker_col
    ) THEN
      IF to_regclass('public.' || t.tbl || '_legacy') IS NOT NULL THEN
        RAISE EXCEPTION '% (old shape) and %_legacy both exist — resolve manually', t.tbl, t.tbl;
      END IF;
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t.tbl, t.tbl || '_legacy');
      FOR c IN
        SELECT conname FROM pg_constraint WHERE conrelid = ('public.' || t.tbl || '_legacy')::regclass
      LOOP
        EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
                       t.tbl || '_legacy', c.conname, c.conname || '_legacy');
      END LOOP;
      RAISE NOTICE 'Renamed % → %_legacy', t.tbl, t.tbl;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Shared tables — additive, nullable columns only
-- -----------------------------------------------------------------------------
ALTER TABLE public.dim_v_model
  ADD COLUMN IF NOT EXISTS powertrain        text,
  ADD COLUMN IF NOT EXISTS engine_family     text,
  ADD COLUMN IF NOT EXISTS transmission      text,
  ADD COLUMN IF NOT EXISTS axle_config       text,
  ADD COLUMN IF NOT EXISTS fuel_tank_l       integer,
  ADD COLUMN IF NOT EXISTS battery_kwh       integer,
  ADD COLUMN IF NOT EXISTS gcw_max_kg        integer,
  ADD COLUMN IF NOT EXISTS base_consumption  real,
  ADD COLUMN IF NOT EXISTS consumption_unit  text,
  ADD COLUMN IF NOT EXISTS adas_equipped     boolean;

ALTER TABLE public.dim_vehicle
  ADD COLUMN IF NOT EXISTS is_connected       boolean,
  ADD COLUMN IF NOT EXISTS telematics_unit_id text,
  ADD COLUMN IF NOT EXISTS telematics_source  text,
  ADD COLUMN IF NOT EXISTS connected_since    date,
  ADD COLUMN IF NOT EXISTS model_year         integer,
  ADD COLUMN IF NOT EXISTS warranty_end_date  date,
  ADD COLUMN IF NOT EXISTS warranty_km_limit  integer,
  ADD COLUMN IF NOT EXISTS home_lat           double precision,
  ADD COLUMN IF NOT EXISTS home_lon           double precision,
  ADD COLUMN IF NOT EXISTS primary_driver_id  text;

ALTER TABLE public.fact_repair_orders
  ADD COLUMN IF NOT EXISTS visit_type      text,
  ADD COLUMN IF NOT EXISTS dtc_event_id    text,
  ADD COLUMN IF NOT EXISTS open_ts         timestamptz,
  ADD COLUMN IF NOT EXISTS close_ts        timestamptz,
  ADD COLUMN IF NOT EXISTS downtime_hours  real,
  ADD COLUMN IF NOT EXISTS odometer_km     real,
  ADD COLUMN IF NOT EXISTS parts_cost      real,
  ADD COLUMN IF NOT EXISTS data_source     text;

ALTER TABLE public.fact_warranty_claims
  ADD COLUMN IF NOT EXISTS dtc_event_id    text,
  ADD COLUMN IF NOT EXISTS ro_id           text,
  ADD COLUMN IF NOT EXISTS was_predicted   boolean,
  ADD COLUMN IF NOT EXISTS data_source     text;

-- -----------------------------------------------------------------------------
-- 3. Telematics dimensions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dim_signal (
  signal_code        text PRIMARY KEY,
  signal_name        text NOT NULL,
  unit               text,
  category           text,
  j1939_pgn          integer,
  j1939_spn          integer,
  rfms_field         text,
  source             text,          -- rFMS | J1939-remote-diag | OEM-backend | derived
  powertrain         text,          -- diesel | bev | all
  sample_interval_s  integer,
  normal_min         real,
  normal_max         real,
  warn_threshold     real,
  crit_threshold     real,
  direction          text           -- high | low : which side of the band is bad
);

CREATE TABLE IF NOT EXISTS public.dim_dtc (
  dtc_id              text PRIMARY KEY,      -- e.g. SPN3719-FMI16
  spn                 integer NOT NULL,
  fmi                 integer NOT NULL,
  spn_description     text,
  fmi_description     text,
  system              text,                  -- aftertreatment, cooling, electrical, fuel, brakes, hv_battery …
  ecu_source_address  integer,
  ecu_name            text,
  default_lamp        text,                  -- MIL | RSL | AWL | PL
  severity_class      text,                  -- critical | major | minor
  can_derate          boolean,
  recommended_action  text,
  powertrain          text,
  UNIQUE (spn, fmi)
);

CREATE TABLE IF NOT EXISTS public.bridge_dtc_part (
  dtc_id      text NOT NULL REFERENCES public.dim_dtc (dtc_id),
  part_id     varchar(50) NOT NULL REFERENCES public.dim_part (part_id),
  likelihood  real,
  PRIMARY KEY (dtc_id, part_id)
);

CREATE TABLE IF NOT EXISTS public.dim_driver (
  driver_id          text PRIMARY KEY,        -- pseudonymised
  driver_alias       text NOT NULL,
  driver_card_hash   text,
  license_class      text,
  customer_id        varchar(50) REFERENCES public.dim_customer (customer_id),
  home_location_id   varchar(50) REFERENCES public.dim_location (location_id),
  hire_date          date,
  experience_years   integer
);

-- -----------------------------------------------------------------------------
-- 4. Telematics facts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fact_trip (
  trip_id                text PRIMARY KEY,
  vehicle_id             varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  driver_id              text REFERENCES public.dim_driver (driver_id),
  date_id                date NOT NULL REFERENCES public.dim_date (date_id),
  start_ts               timestamptz NOT NULL,
  end_ts                 timestamptz NOT NULL,
  start_city             text,
  end_city               text,
  start_lat              double precision,
  start_lon              double precision,
  end_lat                double precision,
  end_lon                double precision,
  start_odometer_km      real,
  end_odometer_km        real,
  distance_km            real,
  drive_s                integer,
  idle_s                 integer,
  pto_s                  integer,
  fuel_used_l            real,
  idle_fuel_l            real,
  pto_fuel_l             real,
  adblue_used_l          real,
  energy_used_kwh        real,
  regen_kwh              real,
  avg_speed_kmh          real,
  max_speed_kmh          real,
  overspeed_s            integer,
  cruise_distance_pct    real,
  coasting_distance_pct  real,
  rpm_green_band_pct     real,
  brake_applications     integer,
  avg_gcw_kg             integer,
  ambient_temp_c         real,
  co2_kg                 real,
  harsh_event_count      integer,
  eco_score              real,
  speed_class_s          jsonb,     -- rFMS-style seconds per speed band
  rpm_class_s            jsonb      -- rFMS-style seconds per engine-speed band
);

CREATE TABLE IF NOT EXISTS public.fact_vehicle_status (
  status_id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id                   varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  driver_id                    text REFERENCES public.dim_driver (driver_id),
  trip_id                      text REFERENCES public.fact_trip (trip_id),
  ts                           timestamptz NOT NULL,
  date_id                      date NOT NULL REFERENCES public.dim_date (date_id),
  trigger_type                 text,        -- TIMER | IGNITION_ON | IGNITION_OFF
  lat                          double precision,
  lon                          double precision,
  heading_deg                  smallint,
  gnss_speed_kmh               real,
  wheel_speed_kmh              real,
  tacho_speed_kmh              real,
  odometer_km                  real,
  engine_hours                 real,
  engine_state                 text,        -- off | idle | running | pto | ready (BEV)
  engine_rpm                   integer,
  engine_load_pct              real,
  accel_pedal_pct              real,
  brake_pedal_active           boolean,
  cruise_active                boolean,
  retarder_active              boolean,
  current_gear                 smallint,
  fuel_level_pct               real,
  total_fuel_used_l            real,
  fuel_rate_lph                real,
  adblue_level_pct             real,
  coolant_temp_c               real,
  oil_pressure_kpa             real,
  battery_voltage_v            real,
  ambient_temp_c               real,
  gross_combination_weight_kg  integer,
  driver_working_state         text,        -- DRIVE | WORK | DRIVER_AVAILABLE | REST
  soc_pct                      real,
  soh_pct                      real,
  hv_battery_temp_c            real,
  energy_used_kwh_total        real,
  regen_kwh_total              real,
  charging_state               text
);

CREATE TABLE IF NOT EXISTS public.fact_harsh_events (
  event_id          text PRIMARY KEY,
  vehicle_id        varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  driver_id         text REFERENCES public.dim_driver (driver_id),
  trip_id           text REFERENCES public.fact_trip (trip_id),
  ts                timestamptz NOT NULL,
  date_id           date NOT NULL REFERENCES public.dim_date (date_id),
  event_type        text NOT NULL,
  severity          text,          -- low | medium | high
  lat               double precision,
  lon               double precision,
  speed_before_kmh  real,
  speed_after_kmh   real,
  peak_g            real,
  duration_s        integer,
  source            text,          -- OEM-ADAS | derived
  score_penalty     integer
);

CREATE TABLE IF NOT EXISTS public.fact_dtc_event (
  dtc_event_id           text PRIMARY KEY,
  vehicle_id             varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  dtc_id                 text NOT NULL REFERENCES public.dim_dtc (dtc_id),
  driver_id              text REFERENCES public.dim_driver (driver_id),
  trip_id                text REFERENCES public.fact_trip (trip_id),
  date_id                date NOT NULL REFERENCES public.dim_date (date_id),   -- first seen (IST)
  first_seen_ts          timestamptz NOT NULL,
  last_seen_ts           timestamptz,
  cleared_ts             timestamptz,
  status                 text NOT NULL,   -- active | previously_active | cleared
  occurrence_count       integer,
  lamp_status            text,
  odometer_km_at_first   real,
  engine_hours_at_first  real,
  caused_derate          boolean,
  freeze_frame           jsonb,
  resolved_by_ro_id      text
);

CREATE TABLE IF NOT EXISTS public.fact_charging_session (
  session_id      text PRIMARY KEY,
  vehicle_id      varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  driver_id       text REFERENCES public.dim_driver (driver_id),
  date_id         date NOT NULL REFERENCES public.dim_date (date_id),
  start_ts        timestamptz NOT NULL,
  end_ts          timestamptz NOT NULL,
  city            text,
  lat             double precision,
  lon             double precision,
  charger_type    text,        -- DEPOT_DC | PUBLIC_DC
  energy_kwh      real,
  max_power_kw    real,
  soc_start_pct   real,
  soc_end_pct     real,
  cost_inr        real
);

CREATE TABLE IF NOT EXISTS public.fact_telemetry (
  telemetry_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id         varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  ts                 timestamptz NOT NULL,
  date_id            date NOT NULL REFERENCES public.dim_date (date_id),
  signal_code        text NOT NULL REFERENCES public.dim_signal (signal_code),
  value              real,
  z_score            real,
  mahalanobis_score  real,
  is_anomalous       boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.fact_vehicle_health (
  health_id              text PRIMARY KEY,
  vehicle_id             varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  part_id                varchar(50) NOT NULL REFERENCES public.dim_part (part_id),
  ts                     timestamptz NOT NULL,
  date_id                date NOT NULL REFERENCES public.dim_date (date_id),
  failure_probability    real,          -- next 30 days
  rul_km                 integer,
  rul_days               integer,
  risk_band              text,          -- Critical | High | Medium | Low
  active_dtcs            jsonb,         -- [{dtc_id, spn, fmi, lamp, severity}]
  ai_prescriptive_action text,
  driver_dtc_event_id    text,
  top_signal_code        text,
  trigger                text,          -- weekly | alert
  model_version          text
);

CREATE TABLE IF NOT EXISTS public.fact_vehicle_daily (
  vehicle_id         varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  date_id            date NOT NULL REFERENCES public.dim_date (date_id),
  driver_id          text REFERENCES public.dim_driver (driver_id),
  is_operating       boolean,
  in_workshop        boolean,
  trips              integer,
  distance_km        real,
  engine_hours       real,
  drive_hours        real,
  idle_hours         real,
  pto_hours          real,
  fuel_l             real,
  idle_fuel_l        real,
  adblue_l           real,
  energy_kwh         real,
  co2_kg             real,
  utilization_pct    real,
  harsh_event_count  integer,
  safety_score       real,
  eco_score          real,
  active_dtc_count   integer,
  amber_lamp_flag    boolean,
  red_lamp_flag      boolean,
  derate_active      boolean,
  odometer_km_end    real,
  packets_expected   integer,
  packets_received   integer,
  last_ping_ts       timestamptz,
  PRIMARY KEY (vehicle_id, date_id)
);

CREATE TABLE IF NOT EXISTS public.fact_part_replacement (
  replacement_id           text PRIMARY KEY,
  ro_id                    text NOT NULL,          -- → fact_repair_orders.ro_id (tagged rows)
  vehicle_id               varchar(50) NOT NULL REFERENCES public.dim_vehicle (vehicle_id),
  part_id                  varchar(50) NOT NULL REFERENCES public.dim_part (part_id),
  supplier_id              varchar(50) REFERENCES public.dim_supplier (supplier_id),
  dealer_id                text REFERENCES public.dim_dealer (dealer_id),
  date_id                  date NOT NULL,       -- no dim_date FK: service history predates dim_date (2025+)
  quantity                 integer,
  odometer_km_at_failure   real,
  engine_hours_at_failure  real,
  vehicle_age_days         integer,
  failure_mode             text,
  visit_type               text,        -- predicted | breakdown | repair | planned
  was_predicted            boolean,
  dtc_event_id             text,
  in_warranty              boolean,
  claim_id                 text,        -- → fact_warranty_claims.claim_id (tagged rows)
  part_cost_inr            real,
  labor_hours              real
);

CREATE TABLE IF NOT EXISTS public.fact_part_demand_forecast (
  forecast_id                   text PRIMARY KEY,
  part_id                       varchar(50) NOT NULL REFERENCES public.dim_part (part_id),
  region_id                     varchar(50) NOT NULL REFERENCES public.dim_region (region_id),
  week_start                    date NOT NULL,
  is_future                     boolean,
  connected_vehicles            integer,
  fleet_vehicles                integer,
  connected_predicted_failures  real,
  connected_actual_replacements integer,
  fleet_expected_demand         integer,
  avg_failure_probability       real,
  generated_at                  date
);

-- -----------------------------------------------------------------------------
-- 5. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_trip_vehicle_ts        ON public.fact_trip (vehicle_id, start_ts);
CREATE INDEX IF NOT EXISTS ix_trip_date              ON public.fact_trip (date_id);
CREATE INDEX IF NOT EXISTS ix_trip_driver            ON public.fact_trip (driver_id);
CREATE INDEX IF NOT EXISTS ix_status_vehicle_ts      ON public.fact_vehicle_status (vehicle_id, ts);
CREATE INDEX IF NOT EXISTS ix_status_date            ON public.fact_vehicle_status (date_id);
CREATE INDEX IF NOT EXISTS ix_harsh_vehicle_ts       ON public.fact_harsh_events (vehicle_id, ts);
CREATE INDEX IF NOT EXISTS ix_harsh_date             ON public.fact_harsh_events (date_id);
CREATE INDEX IF NOT EXISTS ix_harsh_driver           ON public.fact_harsh_events (driver_id);
CREATE INDEX IF NOT EXISTS ix_dtc_event_vehicle_ts   ON public.fact_dtc_event (vehicle_id, first_seen_ts);
CREATE INDEX IF NOT EXISTS ix_dtc_event_dtc_status   ON public.fact_dtc_event (dtc_id, status);
CREATE INDEX IF NOT EXISTS ix_dtc_event_date         ON public.fact_dtc_event (date_id);
CREATE INDEX IF NOT EXISTS ix_charge_vehicle_ts      ON public.fact_charging_session (vehicle_id, start_ts);
CREATE INDEX IF NOT EXISTS ix_telemetry_vehicle_ts   ON public.fact_telemetry (vehicle_id, ts);
CREATE INDEX IF NOT EXISTS ix_telemetry_date_signal  ON public.fact_telemetry (date_id, signal_code);
CREATE INDEX IF NOT EXISTS ix_health_vehicle_ts      ON public.fact_vehicle_health (vehicle_id, ts);
CREATE INDEX IF NOT EXISTS ix_health_part_date       ON public.fact_vehicle_health (part_id, date_id);
CREATE INDEX IF NOT EXISTS ix_daily_date             ON public.fact_vehicle_daily (date_id);
CREATE INDEX IF NOT EXISTS ix_daily_driver           ON public.fact_vehicle_daily (driver_id);
CREATE INDEX IF NOT EXISTS ix_replacement_part_date  ON public.fact_part_replacement (part_id, date_id);
CREATE INDEX IF NOT EXISTS ix_replacement_vehicle    ON public.fact_part_replacement (vehicle_id);
CREATE INDEX IF NOT EXISTS ix_forecast_part_week     ON public.fact_part_demand_forecast (part_id, week_start);

-- -----------------------------------------------------------------------------
-- 6. Security: read-only for the browser (default privileges would grant ALL)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'dim_signal', 'dim_dtc', 'bridge_dtc_part', 'dim_driver',
    'fact_trip', 'fact_vehicle_status', 'fact_harsh_events', 'fact_dtc_event',
    'fact_charging_session', 'fact_telemetry', 'fact_vehicle_health',
    'fact_vehicle_daily', 'fact_part_replacement', 'fact_part_demand_forecast'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', tbl);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'telematics_public_read') THEN
      EXECUTE format('CREATE POLICY telematics_public_read ON public.%I FOR SELECT USING (true)', tbl);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Convenience view: one place to filter by region / model / VIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_vehicle_context WITH (security_invoker = true) AS
SELECT
  v.vehicle_id,
  v.vin,
  v.model_id,
  m.model_name,
  m.variant,
  m.model_name || ' ' || m.variant AS model_label,
  m.vehicle_type,
  m.segment,
  m.tonnage_t,
  m.powertrain,
  m.engine_family,
  m.transmission,
  m.axle_config,
  m.adas_equipped,
  v.customer_id,
  c.customer_name,
  c.customer_type,
  v.location_id,
  l.location_name,
  l.region_id,
  r.region_name,
  r.state,
  v.application_id,
  a.application_name,
  v.current_status,
  v.production_date,
  v.in_service_date,
  v.model_year,
  v.is_connected,
  v.telematics_unit_id,
  v.telematics_source,
  v.connected_since,
  v.warranty_end_date,
  v.warranty_km_limit,
  v.home_lat,
  v.home_lon,
  v.primary_driver_id,
  d.driver_alias AS primary_driver_alias
FROM public.dim_vehicle v
LEFT JOIN public.dim_v_model     m ON m.model_id = v.model_id
LEFT JOIN public.dim_customer    c ON c.customer_id = v.customer_id
LEFT JOIN public.dim_location    l ON l.location_id = v.location_id
LEFT JOIN public.dim_region      r ON r.region_id = l.region_id
LEFT JOIN public.dim_application a ON a.application_id = v.application_id
LEFT JOIN public.dim_driver      d ON d.driver_id = v.primary_driver_id;

REVOKE ALL ON public.v_vehicle_context FROM anon, authenticated;
GRANT SELECT ON public.v_vehicle_context TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Diagnostics / Reliability rollups
--   mv_telemetry_daily   vehicle × signal × day rollup of fact_telemetry (the browser pages
--                        this instead of ~100k raw readings per 30 days). Refreshed by the
--                        seed and by migrate: REFRESH MATERIALIZED VIEW mv_telemetry_daily.
--   v_failure_precursor  daily signal deviation in the 30 days before each part replacement
--                        (only replacements inside the telemetry window produce rows).
--   v_failure_precursor_summary  one row per replacement × signal (early vs late window).
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_telemetry_daily AS
SELECT
  vehicle_id,
  date_id,
  signal_code,
  count(*)::int                                    AS readings,
  avg(value)::real                                 AS avg_value,
  min(value)::real                                 AS min_value,
  max(value)::real                                 AS max_value,
  avg(abs(z_score))::real                          AS mean_abs_z,
  max(abs(z_score))::real                          AS max_abs_z,
  max(mahalanobis_score)::real                     AS max_mahalanobis,
  count(*) FILTER (WHERE is_anomalous)::int        AS anomalous_readings
FROM public.fact_telemetry
GROUP BY vehicle_id, date_id, signal_code
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_telemetry_daily ON public.mv_telemetry_daily (vehicle_id, signal_code, date_id);
CREATE INDEX IF NOT EXISTS ix_mv_telemetry_daily_date ON public.mv_telemetry_daily (date_id);

REVOKE ALL ON public.mv_telemetry_daily FROM anon, authenticated;
GRANT SELECT ON public.mv_telemetry_daily TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_failure_precursor WITH (security_invoker = true) AS
SELECT
  r.replacement_id,
  r.vehicle_id,
  r.part_id,
  t.signal_code,
  (r.date_id - t.date_id)::int AS days_before,
  t.mean_abs_z,
  t.max_abs_z,
  t.anomalous_readings
FROM public.fact_part_replacement r
JOIN public.mv_telemetry_daily t
  ON t.vehicle_id = r.vehicle_id
 AND t.date_id BETWEEN r.date_id - 30 AND r.date_id - 1;

CREATE OR REPLACE VIEW public.v_failure_precursor_summary WITH (security_invoker = true) AS
SELECT
  replacement_id,
  vehicle_id,
  part_id,
  signal_code,
  (avg(mean_abs_z) FILTER (WHERE days_before BETWEEN 21 AND 30))::real AS early_mean_abs_z,
  (avg(mean_abs_z) FILTER (WHERE days_before BETWEEN 1 AND 7))::real   AS late_mean_abs_z,
  max(max_abs_z)::real                                                 AS max_abs_z,
  count(*) FILTER (WHERE anomalous_readings > 0)::int                  AS anomalous_days
FROM public.v_failure_precursor
GROUP BY replacement_id, vehicle_id, part_id, signal_code;

REVOKE ALL ON public.v_failure_precursor, public.v_failure_precursor_summary FROM anon, authenticated;
GRANT SELECT ON public.v_failure_precursor, public.v_failure_precursor_summary TO anon, authenticated;
