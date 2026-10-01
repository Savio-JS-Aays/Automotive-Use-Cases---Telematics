


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bridge_dtc_part" (
    "dtc_id" "text" NOT NULL,
    "part_id" character varying(50) NOT NULL,
    "likelihood" real
);


ALTER TABLE "public"."bridge_dtc_part" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_application" (
    "application_id" character varying(20) NOT NULL,
    "application_name" character varying(100) NOT NULL,
    "sub_application_name" character varying(100),
    "tier" integer,
    "business_vertical" character varying(100),
    "expected_monthly_uptime_minutes" integer DEFAULT 43200
);


ALTER TABLE "public"."dim_application" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_customer" (
    "customer_id" character varying(50) NOT NULL,
    "customer_name" character varying(150),
    "customer_type" character varying(50),
    "region_id" character varying(50)
);


ALTER TABLE "public"."dim_customer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_date" (
    "date_id" "date" NOT NULL,
    "year" integer,
    "month_number" integer,
    "month_name" character varying(20),
    "quarter" character varying(10)
);


ALTER TABLE "public"."dim_date" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_dealer" (
    "dealer_id" "text" NOT NULL,
    "dealer_name" "text",
    "region_id" "text",
    "dealer_tier" "text",
    "contracted_labor_rate" double precision,
    "bay_count" bigint,
    "status" "text"
);


ALTER TABLE "public"."dim_dealer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_driver" (
    "driver_id" "text" NOT NULL,
    "driver_alias" "text" NOT NULL,
    "driver_card_hash" "text",
    "license_class" "text",
    "customer_id" character varying(50),
    "home_location_id" character varying(50),
    "hire_date" "date",
    "experience_years" integer
);


ALTER TABLE "public"."dim_driver" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_dtc" (
    "dtc_id" "text" NOT NULL,
    "spn" integer NOT NULL,
    "fmi" integer NOT NULL,
    "spn_description" "text",
    "fmi_description" "text",
    "system" "text",
    "ecu_source_address" integer,
    "ecu_name" "text",
    "default_lamp" "text",
    "severity_class" "text",
    "can_derate" boolean,
    "recommended_action" "text",
    "powertrain" "text"
);


ALTER TABLE "public"."dim_dtc" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_location" (
    "location_id" character varying(50) NOT NULL,
    "location_name" character varying(150),
    "region_id" character varying(50),
    "address" character varying(250),
    "location_type" character varying(50)
);


ALTER TABLE "public"."dim_location" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_part" (
    "part_id" character varying(50) NOT NULL,
    "part_name" character varying(100),
    "part_type" character varying(100),
    "vehicle_subsystem" character varying(100),
    "standard_labor_hours" numeric,
    "b10_design_life_miles" integer,
    "unit_cost" double precision,
    "supplier_id" character varying(50)
);


ALTER TABLE "public"."dim_part" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_region" (
    "region_id" character varying(50) NOT NULL,
    "region_name" character varying(100),
    "state" character varying(100),
    "country" character varying(100)
);


ALTER TABLE "public"."dim_region" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_route" (
    "route_id" character varying(50) NOT NULL,
    "origin_location_id" character varying(50),
    "destination_location_id" character varying(50),
    "distance_km" integer,
    "standard_transit_time_hours" integer
);


ALTER TABLE "public"."dim_route" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_signal" (
    "signal_code" "text" NOT NULL,
    "signal_name" "text" NOT NULL,
    "unit" "text",
    "category" "text",
    "j1939_pgn" integer,
    "j1939_spn" integer,
    "rfms_field" "text",
    "source" "text",
    "powertrain" "text",
    "sample_interval_s" integer,
    "normal_min" real,
    "normal_max" real,
    "warn_threshold" real,
    "crit_threshold" real,
    "direction" "text"
);


ALTER TABLE "public"."dim_signal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_standard_repair_times" (
    "srt_id" "text" NOT NULL,
    "part_id" "text",
    "repair_type" "text",
    "benchmark_labor_hours" double precision,
    "max_allowable_hours" double precision
);


ALTER TABLE "public"."dim_standard_repair_times" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_supplier" (
    "supplier_id" character varying(50) NOT NULL,
    "supplier_name" character varying(100),
    "risk_tier" character varying(50)
);


ALTER TABLE "public"."dim_supplier" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_v_model" (
    "model_id" character varying(50) NOT NULL,
    "model_name" character varying(100),
    "variant" character varying(100),
    "vehicle_type" character varying(50),
    "segment" character varying(30),
    "tonnage_t" numeric(5,2),
    "powertrain" "text",
    "engine_family" "text",
    "transmission" "text",
    "axle_config" "text",
    "fuel_tank_l" integer,
    "battery_kwh" integer,
    "gcw_max_kg" integer,
    "base_consumption" real,
    "consumption_unit" "text",
    "adas_equipped" boolean
);


ALTER TABLE "public"."dim_v_model" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dim_vehicle" (
    "vehicle_id" character varying(50) NOT NULL,
    "vin" character varying(17),
    "model_id" character varying(50),
    "customer_id" character varying(50),
    "location_id" character varying(50),
    "current_status" character varying(50),
    "production_date" "date",
    "in_service_date" "date",
    "application_id" character varying(20),
    "is_connected" boolean,
    "telematics_unit_id" "text",
    "telematics_source" "text",
    "connected_since" "date",
    "model_year" integer,
    "warranty_end_date" "date",
    "warranty_km_limit" integer,
    "home_lat" double precision,
    "home_lon" double precision,
    "primary_driver_id" "text"
);


ALTER TABLE "public"."dim_vehicle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_alerts" (
    "alert_id" character varying(50) NOT NULL,
    "service_id" character varying(50),
    "date_id" "date",
    "time_id" integer,
    "incident_id" character varying(50),
    "alert_severity" character varying(50)
);


ALTER TABLE "public"."fact_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_app_metrics" (
    "metric_id" character varying(50) NOT NULL,
    "application_id" character varying(20),
    "date_id" "date",
    "timestamp" timestamp without time zone,
    "uptime_minutes" integer,
    "total_transactions" integer,
    "failed_transactions" integer,
    "avg_api_latency_ms" numeric,
    "api_requests" integer,
    "api_successes" integer
);


ALTER TABLE "public"."fact_app_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_batch_jobs" (
    "job_id" character varying(50) NOT NULL,
    "job_name" character varying(100),
    "status" character varying(50),
    "start_time" timestamp without time zone,
    "end_time" timestamp without time zone
);


ALTER TABLE "public"."fact_batch_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_booking" (
    "booking_id" character varying(50) NOT NULL,
    "customer_id" character varying(50),
    "vehicle_id" character varying(50),
    "model_id" character varying(50),
    "booking_date" timestamp without time zone,
    "booking_status" character varying(50),
    "cancellation_reason" character varying(150),
    "cancellation_date" timestamp without time zone
);


ALTER TABLE "public"."fact_booking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_case_status_history" (
    "history_id" character varying(50) NOT NULL,
    "case_id" character varying(50),
    "status" character varying(50),
    "status_date_time" timestamp without time zone
);


ALTER TABLE "public"."fact_case_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_charging_session" (
    "session_id" "text" NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "driver_id" "text",
    "date_id" "date" NOT NULL,
    "start_ts" timestamp with time zone NOT NULL,
    "end_ts" timestamp with time zone NOT NULL,
    "city" "text",
    "lat" double precision,
    "lon" double precision,
    "charger_type" "text",
    "energy_kwh" real,
    "max_power_kw" real,
    "soc_start_pct" real,
    "soc_end_pct" real,
    "cost_inr" real
);


ALTER TABLE "public"."fact_charging_session" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_complaints" (
    "complaint_id" character varying(50) NOT NULL,
    "case_id" character varying(50),
    "customer_id" character varying(50),
    "category" character varying(100),
    "complaint_date" timestamp without time zone,
    "complaint_type" character varying(100)
);


ALTER TABLE "public"."fact_complaints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_customer_feedback" (
    "feedback_id" character varying(50) NOT NULL,
    "case_id" character varying(50),
    "customer_id" character varying(50),
    "csat_score" integer,
    "feedback_type" character varying(50),
    "feedback_date" timestamp without time zone
);


ALTER TABLE "public"."fact_customer_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_data_quality" (
    "dq_id" character varying(50) NOT NULL,
    "date_id" "date",
    "total_expected_packets" integer,
    "valid_packets_received" integer
);


ALTER TABLE "public"."fact_data_quality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_deployments" (
    "deployment_id" character varying(50) NOT NULL,
    "service_id" character varying(50),
    "date_id" "date",
    "time_id" integer,
    "change_type" character varying(100),
    "pr_count" integer
);


ALTER TABLE "public"."fact_deployments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_dtc_event" (
    "dtc_event_id" "text" NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "dtc_id" "text" NOT NULL,
    "driver_id" "text",
    "trip_id" "text",
    "date_id" "date" NOT NULL,
    "first_seen_ts" timestamp with time zone NOT NULL,
    "last_seen_ts" timestamp with time zone,
    "cleared_ts" timestamp with time zone,
    "status" "text" NOT NULL,
    "occurrence_count" integer,
    "lamp_status" "text",
    "odometer_km_at_first" real,
    "engine_hours_at_first" real,
    "caused_derate" boolean,
    "freeze_frame" "jsonb",
    "resolved_by_ro_id" "text"
);


ALTER TABLE "public"."fact_dtc_event" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_harsh_events" (
    "event_id" "text" NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "driver_id" "text",
    "trip_id" "text",
    "ts" timestamp with time zone NOT NULL,
    "date_id" "date" NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text",
    "lat" double precision,
    "lon" double precision,
    "speed_before_kmh" real,
    "speed_after_kmh" real,
    "peak_g" real,
    "duration_s" integer,
    "source" "text",
    "score_penalty" integer
);


ALTER TABLE "public"."fact_harsh_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_incidents" (
    "incident_id" character varying(50) NOT NULL,
    "service_id" character varying(50),
    "date_id" "date",
    "time_id" integer,
    "causal_confidence_score" integer,
    "mttr_minutes" integer,
    "priority" integer,
    "status" character varying(50),
    "affected_business_unit" character varying(100),
    "root_cause_type" character varying(100),
    "open_time" timestamp without time zone,
    "resolution_time" timestamp without time zone
);


ALTER TABLE "public"."fact_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_l_vehicle_delivery" (
    "delivery_id" character varying(50) NOT NULL,
    "dispatch_id" character varying(50),
    "booking_id" character varying(50),
    "vehicle_id" character varying(50),
    "planned_delivery_date" timestamp without time zone,
    "actual_delivery_date" timestamp without time zone,
    "delivery_status" character varying(50)
);


ALTER TABLE "public"."fact_l_vehicle_delivery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_logistics_exception" (
    "exception_id" character varying(50) NOT NULL,
    "vehicle_id" character varying(50),
    "dispatch_id" character varying(50),
    "exception_type" character varying(100),
    "exception_date" timestamp without time zone,
    "location_id" character varying(50),
    "severity" character varying(50),
    "status" character varying(50),
    "resolution_date" timestamp without time zone,
    "description" character varying(500)
);


ALTER TABLE "public"."fact_logistics_exception" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_network_events" (
    "event_id" character varying(50) NOT NULL,
    "location_id" character varying(50),
    "timestamp" timestamp without time zone,
    "device_type" character varying(50),
    "avg_ping_ms" numeric,
    "disconnect_count" integer
);


ALTER TABLE "public"."fact_network_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_nv_vehicle_delivery" (
    "delivery_id" character varying(50) NOT NULL,
    "booking_id" character varying(50),
    "vehicle_id" character varying(50),
    "planned_delivery_date" timestamp without time zone,
    "actual_delivery_date" timestamp without time zone,
    "delivery_status" character varying(50)
);


ALTER TABLE "public"."fact_nv_vehicle_delivery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_part_demand_forecast" (
    "forecast_id" "text" NOT NULL,
    "part_id" character varying(50) NOT NULL,
    "region_id" character varying(50) NOT NULL,
    "week_start" "date" NOT NULL,
    "is_future" boolean,
    "connected_vehicles" integer,
    "fleet_vehicles" integer,
    "connected_predicted_failures" real,
    "connected_actual_replacements" integer,
    "fleet_expected_demand" integer,
    "avg_failure_probability" real,
    "generated_at" "date"
);


ALTER TABLE "public"."fact_part_demand_forecast" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_part_inventory" (
    "part_inventory_id" character varying(50) NOT NULL,
    "part_id" character varying(50),
    "location_id" character varying(50),
    "quantity" integer,
    "inventory_status" character varying(50),
    "forecasted_90d_demand" integer,
    "reorder_recommended" boolean
);


ALTER TABLE "public"."fact_part_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_part_replacement" (
    "replacement_id" "text" NOT NULL,
    "ro_id" "text" NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "part_id" character varying(50) NOT NULL,
    "supplier_id" character varying(50),
    "dealer_id" "text",
    "date_id" "date" NOT NULL,
    "quantity" integer,
    "odometer_km_at_failure" real,
    "engine_hours_at_failure" real,
    "vehicle_age_days" integer,
    "failure_mode" "text",
    "visit_type" "text",
    "was_predicted" boolean,
    "dtc_event_id" "text",
    "in_warranty" boolean,
    "claim_id" "text",
    "part_cost_inr" real,
    "labor_hours" real
);


ALTER TABLE "public"."fact_part_replacement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_repair_orders" (
    "ro_id" "text" NOT NULL,
    "vehicle_id" "text",
    "dealer_id" "text",
    "date_id" "text",
    "billed_hours" double precision,
    "labor_cost" double precision,
    "nlp_3c_text" "text",
    "visit_type" "text",
    "dtc_event_id" "text",
    "open_ts" timestamp with time zone,
    "close_ts" timestamp with time zone,
    "downtime_hours" real,
    "odometer_km" real,
    "parts_cost" real,
    "data_source" "text"
);


ALTER TABLE "public"."fact_repair_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_sales_target" (
    "target_id" character varying(50) NOT NULL,
    "region_id" character varying(50),
    "model_id" character varying(50),
    "target_period" timestamp without time zone,
    "sales_target" integer
);


ALTER TABLE "public"."fact_sales_target" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_sales_transaction" (
    "sale_id" character varying(50) NOT NULL,
    "booking_id" character varying(50),
    "customer_id" character varying(50),
    "vehicle_id" character varying(50),
    "model_id" character varying(50),
    "region_id" character varying(50),
    "sale_date" timestamp without time zone,
    "sale_value" integer
);


ALTER TABLE "public"."fact_sales_transaction" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_service_case" (
    "case_id" character varying(50) NOT NULL,
    "customer_id" character varying(50),
    "vehicle_id" character varying(50),
    "category" character varying(100),
    "channel" character varying(50),
    "priority" character varying(50),
    "status" character varying(50),
    "created_date" timestamp without time zone,
    "open_datetime" timestamp without time zone,
    "resolution_datetime" timestamp without time zone,
    "escalated_flag" character varying(10),
    "sla_target_hours" integer,
    "sla_due_date_time" timestamp without time zone,
    "sla_met" character varying(10)
);


ALTER TABLE "public"."fact_service_case" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_telemetry" (
    "telemetry_id" bigint NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "ts" timestamp with time zone NOT NULL,
    "date_id" "date" NOT NULL,
    "signal_code" "text" NOT NULL,
    "value" real,
    "z_score" real,
    "mahalanobis_score" real,
    "is_anomalous" boolean DEFAULT false
);


ALTER TABLE "public"."fact_telemetry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_telemetry_legacy" (
    "telemetry_id" character varying(50) NOT NULL,
    "vehicle_id" character varying(50),
    "date_id" "date",
    "time_id" integer,
    "avg_temp" numeric,
    "max_rpm" numeric,
    "z_score" numeric,
    "mahalanobis_score" numeric,
    "is_anomalous" boolean DEFAULT false,
    "signal_type" character varying(50),
    "signal_value" numeric
);


ALTER TABLE "public"."fact_telemetry_legacy" OWNER TO "postgres";


ALTER TABLE "public"."fact_telemetry" ALTER COLUMN "telemetry_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."fact_telemetry_telemetry_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."fact_transportation_cost" (
    "cost_id" character varying(50) NOT NULL,
    "dispatch_id" character varying(50),
    "transporter_id" character varying(50),
    "route_id" character varying(50),
    "transportation_cost" integer,
    "cost_date" timestamp without time zone
);


ALTER TABLE "public"."fact_transportation_cost" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_transporter" (
    "transporter_id" character varying(50) NOT NULL,
    "transporter_name" character varying(150),
    "service_region" character varying(100),
    "status" character varying(50)
);


ALTER TABLE "public"."fact_transporter" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_trip" (
    "trip_id" "text" NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "driver_id" "text",
    "date_id" "date" NOT NULL,
    "start_ts" timestamp with time zone NOT NULL,
    "end_ts" timestamp with time zone NOT NULL,
    "start_city" "text",
    "end_city" "text",
    "start_lat" double precision,
    "start_lon" double precision,
    "end_lat" double precision,
    "end_lon" double precision,
    "start_odometer_km" real,
    "end_odometer_km" real,
    "distance_km" real,
    "drive_s" integer,
    "idle_s" integer,
    "pto_s" integer,
    "fuel_used_l" real,
    "idle_fuel_l" real,
    "pto_fuel_l" real,
    "adblue_used_l" real,
    "energy_used_kwh" real,
    "regen_kwh" real,
    "avg_speed_kmh" real,
    "max_speed_kmh" real,
    "overspeed_s" integer,
    "cruise_distance_pct" real,
    "coasting_distance_pct" real,
    "rpm_green_band_pct" real,
    "brake_applications" integer,
    "avg_gcw_kg" integer,
    "ambient_temp_c" real,
    "co2_kg" real,
    "harsh_event_count" integer,
    "eco_score" real,
    "speed_class_s" "jsonb",
    "rpm_class_s" "jsonb"
);


ALTER TABLE "public"."fact_trip" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_daily" (
    "vehicle_id" character varying(50) NOT NULL,
    "date_id" "date" NOT NULL,
    "driver_id" "text",
    "is_operating" boolean,
    "in_workshop" boolean,
    "trips" integer,
    "distance_km" real,
    "engine_hours" real,
    "drive_hours" real,
    "idle_hours" real,
    "pto_hours" real,
    "fuel_l" real,
    "idle_fuel_l" real,
    "adblue_l" real,
    "energy_kwh" real,
    "co2_kg" real,
    "utilization_pct" real,
    "harsh_event_count" integer,
    "safety_score" real,
    "eco_score" real,
    "active_dtc_count" integer,
    "amber_lamp_flag" boolean,
    "red_lamp_flag" boolean,
    "derate_active" boolean,
    "odometer_km_end" real,
    "packets_expected" integer,
    "packets_received" integer,
    "last_ping_ts" timestamp with time zone
);


ALTER TABLE "public"."fact_vehicle_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_dispatch" (
    "dispatch_id" character varying(50) NOT NULL,
    "vehicle_id" character varying(50),
    "origin_location_id" character varying(50),
    "destination_location_id" character varying(50),
    "transporter_id" character varying(50),
    "route_id" character varying(50),
    "dispatch_date_time" timestamp without time zone,
    "arrival_date_time" timestamp without time zone,
    "planned_delivery_date" timestamp without time zone,
    "dispatch_status" character varying(50)
);


ALTER TABLE "public"."fact_vehicle_dispatch" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_health" (
    "health_id" "text" NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "part_id" character varying(50) NOT NULL,
    "ts" timestamp with time zone NOT NULL,
    "date_id" "date" NOT NULL,
    "failure_probability" real,
    "rul_km" integer,
    "rul_days" integer,
    "risk_band" "text",
    "active_dtcs" "jsonb",
    "ai_prescriptive_action" "text",
    "driver_dtc_event_id" "text",
    "top_signal_code" "text",
    "trigger" "text",
    "model_version" "text"
);


ALTER TABLE "public"."fact_vehicle_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_health_legacy" (
    "health_id" character varying(50) NOT NULL,
    "vehicle_id" character varying(50),
    "part_id" character varying(50),
    "timestamp" timestamp without time zone,
    "failure_probability" numeric,
    "remaining_useful_life" integer,
    "active_dtcs" "jsonb",
    "ai_prescriptive_action" character varying(255)
);


ALTER TABLE "public"."fact_vehicle_health_legacy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_inventory" (
    "inventory_id" character varying(50) NOT NULL,
    "vehicle_id" character varying(50),
    "location_id" character varying(50),
    "inventory_status" character varying(50),
    "inventory_entry_date" timestamp without time zone,
    "allocation_date" timestamp without time zone,
    "exit_date" timestamp without time zone
);


ALTER TABLE "public"."fact_vehicle_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_movement_history" (
    "movement_id" character varying(50) NOT NULL,
    "vehicle_id" character varying(50),
    "dispatch_id" character varying(50),
    "status" character varying(50),
    "location_id" character varying(50),
    "status_date_time" timestamp without time zone,
    "remarks" character varying(250)
);


ALTER TABLE "public"."fact_vehicle_movement_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fact_vehicle_status" (
    "status_id" bigint NOT NULL,
    "vehicle_id" character varying(50) NOT NULL,
    "driver_id" "text",
    "trip_id" "text",
    "ts" timestamp with time zone NOT NULL,
    "date_id" "date" NOT NULL,
    "trigger_type" "text",
    "lat" double precision,
    "lon" double precision,
    "heading_deg" smallint,
    "gnss_speed_kmh" real,
    "wheel_speed_kmh" real,
    "tacho_speed_kmh" real,
    "odometer_km" real,
    "engine_hours" real,
    "engine_state" "text",
    "engine_rpm" integer,
    "engine_load_pct" real,
    "accel_pedal_pct" real,
    "brake_pedal_active" boolean,
    "cruise_active" boolean,
    "retarder_active" boolean,
    "current_gear" smallint,
    "fuel_level_pct" real,
    "total_fuel_used_l" real,
    "fuel_rate_lph" real,
    "adblue_level_pct" real,
    "coolant_temp_c" real,
    "oil_pressure_kpa" real,
    "battery_voltage_v" real,
    "ambient_temp_c" real,
    "gross_combination_weight_kg" integer,
    "driver_working_state" "text",
    "soc_pct" real,
    "soh_pct" real,
    "hv_battery_temp_c" real,
    "energy_used_kwh_total" real,
    "regen_kwh_total" real,
    "charging_state" "text"
);


ALTER TABLE "public"."fact_vehicle_status" OWNER TO "postgres";


ALTER TABLE "public"."fact_vehicle_status" ALTER COLUMN "status_id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."fact_vehicle_status_status_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."fact_warranty_claims" (
    "claim_id" "text" NOT NULL,
    "vehicle_id" "text",
    "part_id" "text",
    "dealer_id" "text",
    "date_id" "text",
    "claim_amount" double precision,
    "nff_flag" bigint,
    "ai_risk_score" bigint,
    "status" "text",
    "submission_date" "text",
    "adjudication_date" "text",
    "supplier_id" "text",
    "liability_type" "text",
    "recovered_amount" double precision,
    "mileage_at_failure" bigint,
    "cluster_id" "text",
    "dtc_event_id" "text",
    "ro_id" "text",
    "was_predicted" boolean,
    "data_source" "text"
);


ALTER TABLE "public"."fact_warranty_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_vehicle_reassignment" (
    "sale_id" character varying NOT NULL,
    "booking_id" character varying NOT NULL,
    "old_vehicle_id" character varying NOT NULL,
    "new_vehicle_id" character varying NOT NULL,
    "model_id" character varying NOT NULL
);


ALTER TABLE "public"."sales_vehicle_reassignment" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_vehicle_context" WITH ("security_invoker"='true') AS
 SELECT "v"."vehicle_id",
    "v"."vin",
    "v"."model_id",
    "m"."model_name",
    "m"."variant",
    ((("m"."model_name")::"text" || ' '::"text") || ("m"."variant")::"text") AS "model_label",
    "m"."vehicle_type",
    "m"."segment",
    "m"."tonnage_t",
    "m"."powertrain",
    "m"."engine_family",
    "m"."transmission",
    "m"."axle_config",
    "m"."adas_equipped",
    "v"."customer_id",
    "c"."customer_name",
    "c"."customer_type",
    "v"."location_id",
    "l"."location_name",
    "l"."region_id",
    "r"."region_name",
    "r"."state",
    "v"."application_id",
    "a"."application_name",
    "v"."current_status",
    "v"."production_date",
    "v"."in_service_date",
    "v"."model_year",
    "v"."is_connected",
    "v"."telematics_unit_id",
    "v"."telematics_source",
    "v"."connected_since",
    "v"."warranty_end_date",
    "v"."warranty_km_limit",
    "v"."home_lat",
    "v"."home_lon",
    "v"."primary_driver_id",
    "d"."driver_alias" AS "primary_driver_alias"
   FROM (((((("public"."dim_vehicle" "v"
     LEFT JOIN "public"."dim_v_model" "m" ON ((("m"."model_id")::"text" = ("v"."model_id")::"text")))
     LEFT JOIN "public"."dim_customer" "c" ON ((("c"."customer_id")::"text" = ("v"."customer_id")::"text")))
     LEFT JOIN "public"."dim_location" "l" ON ((("l"."location_id")::"text" = ("v"."location_id")::"text")))
     LEFT JOIN "public"."dim_region" "r" ON ((("r"."region_id")::"text" = ("l"."region_id")::"text")))
     LEFT JOIN "public"."dim_application" "a" ON ((("a"."application_id")::"text" = ("v"."application_id")::"text")))
     LEFT JOIN "public"."dim_driver" "d" ON (("d"."driver_id" = "v"."primary_driver_id")));


ALTER VIEW "public"."v_vehicle_context" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bridge_dtc_part"
    ADD CONSTRAINT "bridge_dtc_part_pkey" PRIMARY KEY ("dtc_id", "part_id");



ALTER TABLE ONLY "public"."dim_application"
    ADD CONSTRAINT "dim_application_pkey" PRIMARY KEY ("application_id");



ALTER TABLE ONLY "public"."dim_customer"
    ADD CONSTRAINT "dim_customer_pkey" PRIMARY KEY ("customer_id");



ALTER TABLE ONLY "public"."dim_date"
    ADD CONSTRAINT "dim_date_pkey" PRIMARY KEY ("date_id");



ALTER TABLE ONLY "public"."dim_dealer"
    ADD CONSTRAINT "dim_dealer_pkey" PRIMARY KEY ("dealer_id");



ALTER TABLE ONLY "public"."dim_driver"
    ADD CONSTRAINT "dim_driver_pkey" PRIMARY KEY ("driver_id");



ALTER TABLE ONLY "public"."dim_dtc"
    ADD CONSTRAINT "dim_dtc_pkey" PRIMARY KEY ("dtc_id");



ALTER TABLE ONLY "public"."dim_dtc"
    ADD CONSTRAINT "dim_dtc_spn_fmi_key" UNIQUE ("spn", "fmi");



ALTER TABLE ONLY "public"."dim_location"
    ADD CONSTRAINT "dim_location_pkey" PRIMARY KEY ("location_id");



ALTER TABLE ONLY "public"."dim_part"
    ADD CONSTRAINT "dim_part_pkey" PRIMARY KEY ("part_id");



ALTER TABLE ONLY "public"."dim_region"
    ADD CONSTRAINT "dim_region_pkey" PRIMARY KEY ("region_id");



ALTER TABLE ONLY "public"."dim_route"
    ADD CONSTRAINT "dim_route_pkey" PRIMARY KEY ("route_id");



ALTER TABLE ONLY "public"."dim_signal"
    ADD CONSTRAINT "dim_signal_pkey" PRIMARY KEY ("signal_code");



ALTER TABLE ONLY "public"."dim_standard_repair_times"
    ADD CONSTRAINT "dim_standard_repair_times_pkey" PRIMARY KEY ("srt_id");



ALTER TABLE ONLY "public"."dim_supplier"
    ADD CONSTRAINT "dim_supplier_pkey" PRIMARY KEY ("supplier_id");



ALTER TABLE ONLY "public"."dim_v_model"
    ADD CONSTRAINT "dim_v_model_pkey" PRIMARY KEY ("model_id");



ALTER TABLE ONLY "public"."dim_vehicle"
    ADD CONSTRAINT "dim_vehicle_pkey" PRIMARY KEY ("vehicle_id");



ALTER TABLE ONLY "public"."fact_alerts"
    ADD CONSTRAINT "fact_alerts_pkey" PRIMARY KEY ("alert_id");



ALTER TABLE ONLY "public"."fact_app_metrics"
    ADD CONSTRAINT "fact_app_metrics_pkey" PRIMARY KEY ("metric_id");



ALTER TABLE ONLY "public"."fact_batch_jobs"
    ADD CONSTRAINT "fact_batch_jobs_pkey" PRIMARY KEY ("job_id");



ALTER TABLE ONLY "public"."fact_booking"
    ADD CONSTRAINT "fact_booking_pkey" PRIMARY KEY ("booking_id");



ALTER TABLE ONLY "public"."fact_case_status_history"
    ADD CONSTRAINT "fact_case_status_history_pkey" PRIMARY KEY ("history_id");



ALTER TABLE ONLY "public"."fact_charging_session"
    ADD CONSTRAINT "fact_charging_session_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."fact_complaints"
    ADD CONSTRAINT "fact_complaints_pkey" PRIMARY KEY ("complaint_id");



ALTER TABLE ONLY "public"."fact_customer_feedback"
    ADD CONSTRAINT "fact_customer_feedback_pkey" PRIMARY KEY ("feedback_id");



ALTER TABLE ONLY "public"."fact_data_quality"
    ADD CONSTRAINT "fact_data_quality_pkey" PRIMARY KEY ("dq_id");



ALTER TABLE ONLY "public"."fact_deployments"
    ADD CONSTRAINT "fact_deployments_pkey" PRIMARY KEY ("deployment_id");



ALTER TABLE ONLY "public"."fact_dtc_event"
    ADD CONSTRAINT "fact_dtc_event_pkey" PRIMARY KEY ("dtc_event_id");



ALTER TABLE ONLY "public"."fact_harsh_events"
    ADD CONSTRAINT "fact_harsh_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."fact_incidents"
    ADD CONSTRAINT "fact_incidents_pkey" PRIMARY KEY ("incident_id");



ALTER TABLE ONLY "public"."fact_l_vehicle_delivery"
    ADD CONSTRAINT "fact_l_vehicle_delivery_pkey" PRIMARY KEY ("delivery_id");



ALTER TABLE ONLY "public"."fact_logistics_exception"
    ADD CONSTRAINT "fact_logistics_exception_pkey" PRIMARY KEY ("exception_id");



ALTER TABLE ONLY "public"."fact_network_events"
    ADD CONSTRAINT "fact_network_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."fact_nv_vehicle_delivery"
    ADD CONSTRAINT "fact_nv_vehicle_delivery_pkey" PRIMARY KEY ("delivery_id");



ALTER TABLE ONLY "public"."fact_part_demand_forecast"
    ADD CONSTRAINT "fact_part_demand_forecast_pkey" PRIMARY KEY ("forecast_id");



ALTER TABLE ONLY "public"."fact_part_inventory"
    ADD CONSTRAINT "fact_part_inventory_pkey" PRIMARY KEY ("part_inventory_id");



ALTER TABLE ONLY "public"."fact_part_replacement"
    ADD CONSTRAINT "fact_part_replacement_pkey" PRIMARY KEY ("replacement_id");



ALTER TABLE ONLY "public"."fact_repair_orders"
    ADD CONSTRAINT "fact_repair_orders_pkey" PRIMARY KEY ("ro_id");



ALTER TABLE ONLY "public"."fact_sales_target"
    ADD CONSTRAINT "fact_sales_target_pkey" PRIMARY KEY ("target_id");



ALTER TABLE ONLY "public"."fact_sales_transaction"
    ADD CONSTRAINT "fact_sales_transaction_pkey" PRIMARY KEY ("sale_id");



ALTER TABLE ONLY "public"."fact_service_case"
    ADD CONSTRAINT "fact_service_case_pkey" PRIMARY KEY ("case_id");



ALTER TABLE ONLY "public"."fact_telemetry"
    ADD CONSTRAINT "fact_telemetry_pkey" PRIMARY KEY ("telemetry_id");



ALTER TABLE ONLY "public"."fact_telemetry_legacy"
    ADD CONSTRAINT "fact_telemetry_pkey_legacy" PRIMARY KEY ("telemetry_id");



ALTER TABLE ONLY "public"."fact_transportation_cost"
    ADD CONSTRAINT "fact_transportation_cost_pkey" PRIMARY KEY ("cost_id");



ALTER TABLE ONLY "public"."fact_transporter"
    ADD CONSTRAINT "fact_transporter_pkey" PRIMARY KEY ("transporter_id");



ALTER TABLE ONLY "public"."fact_trip"
    ADD CONSTRAINT "fact_trip_pkey" PRIMARY KEY ("trip_id");



ALTER TABLE ONLY "public"."fact_vehicle_daily"
    ADD CONSTRAINT "fact_vehicle_daily_pkey" PRIMARY KEY ("vehicle_id", "date_id");



ALTER TABLE ONLY "public"."fact_vehicle_dispatch"
    ADD CONSTRAINT "fact_vehicle_dispatch_pkey" PRIMARY KEY ("dispatch_id");



ALTER TABLE ONLY "public"."fact_vehicle_health"
    ADD CONSTRAINT "fact_vehicle_health_pkey" PRIMARY KEY ("health_id");



ALTER TABLE ONLY "public"."fact_vehicle_health_legacy"
    ADD CONSTRAINT "fact_vehicle_health_pkey_legacy" PRIMARY KEY ("health_id");



ALTER TABLE ONLY "public"."fact_vehicle_inventory"
    ADD CONSTRAINT "fact_vehicle_inventory_pkey" PRIMARY KEY ("inventory_id");



ALTER TABLE ONLY "public"."fact_vehicle_movement_history"
    ADD CONSTRAINT "fact_vehicle_movement_history_pkey" PRIMARY KEY ("movement_id");



ALTER TABLE ONLY "public"."fact_vehicle_status"
    ADD CONSTRAINT "fact_vehicle_status_pkey" PRIMARY KEY ("status_id");



ALTER TABLE ONLY "public"."fact_warranty_claims"
    ADD CONSTRAINT "fact_warranty_claims_pkey" PRIMARY KEY ("claim_id");



ALTER TABLE ONLY "public"."sales_vehicle_reassignment"
    ADD CONSTRAINT "sales_vehicle_reassignment_pkey" PRIMARY KEY ("sale_id");



CREATE INDEX "ix_charge_vehicle_ts" ON "public"."fact_charging_session" USING "btree" ("vehicle_id", "start_ts");



CREATE INDEX "ix_daily_date" ON "public"."fact_vehicle_daily" USING "btree" ("date_id");



CREATE INDEX "ix_daily_driver" ON "public"."fact_vehicle_daily" USING "btree" ("driver_id");



CREATE INDEX "ix_dtc_event_date" ON "public"."fact_dtc_event" USING "btree" ("date_id");



CREATE INDEX "ix_dtc_event_dtc_status" ON "public"."fact_dtc_event" USING "btree" ("dtc_id", "status");



CREATE INDEX "ix_dtc_event_vehicle_ts" ON "public"."fact_dtc_event" USING "btree" ("vehicle_id", "first_seen_ts");



CREATE INDEX "ix_forecast_part_week" ON "public"."fact_part_demand_forecast" USING "btree" ("part_id", "week_start");



CREATE INDEX "ix_harsh_date" ON "public"."fact_harsh_events" USING "btree" ("date_id");



CREATE INDEX "ix_harsh_driver" ON "public"."fact_harsh_events" USING "btree" ("driver_id");



CREATE INDEX "ix_harsh_vehicle_ts" ON "public"."fact_harsh_events" USING "btree" ("vehicle_id", "ts");



CREATE INDEX "ix_health_part_date" ON "public"."fact_vehicle_health" USING "btree" ("part_id", "date_id");



CREATE INDEX "ix_health_vehicle_ts" ON "public"."fact_vehicle_health" USING "btree" ("vehicle_id", "ts");



CREATE INDEX "ix_replacement_part_date" ON "public"."fact_part_replacement" USING "btree" ("part_id", "date_id");



CREATE INDEX "ix_replacement_vehicle" ON "public"."fact_part_replacement" USING "btree" ("vehicle_id");



CREATE INDEX "ix_status_date" ON "public"."fact_vehicle_status" USING "btree" ("date_id");



CREATE INDEX "ix_status_vehicle_ts" ON "public"."fact_vehicle_status" USING "btree" ("vehicle_id", "ts");



CREATE INDEX "ix_telemetry_date_signal" ON "public"."fact_telemetry" USING "btree" ("date_id", "signal_code");



CREATE INDEX "ix_telemetry_vehicle_ts" ON "public"."fact_telemetry" USING "btree" ("vehicle_id", "ts");



CREATE INDEX "ix_trip_date" ON "public"."fact_trip" USING "btree" ("date_id");



CREATE INDEX "ix_trip_driver" ON "public"."fact_trip" USING "btree" ("driver_id");



CREATE INDEX "ix_trip_vehicle_ts" ON "public"."fact_trip" USING "btree" ("vehicle_id", "start_ts");



ALTER TABLE ONLY "public"."bridge_dtc_part"
    ADD CONSTRAINT "bridge_dtc_part_dtc_id_fkey" FOREIGN KEY ("dtc_id") REFERENCES "public"."dim_dtc"("dtc_id");



ALTER TABLE ONLY "public"."bridge_dtc_part"
    ADD CONSTRAINT "bridge_dtc_part_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."dim_driver"
    ADD CONSTRAINT "dim_driver_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."dim_driver"
    ADD CONSTRAINT "dim_driver_home_location_id_fkey" FOREIGN KEY ("home_location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_app_metrics"
    ADD CONSTRAINT "fact_app_metrics_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."dim_application"("application_id");



ALTER TABLE ONLY "public"."fact_app_metrics"
    ADD CONSTRAINT "fact_app_metrics_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_charging_session"
    ADD CONSTRAINT "fact_charging_session_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_charging_session"
    ADD CONSTRAINT "fact_charging_session_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."dim_driver"("driver_id");



ALTER TABLE ONLY "public"."fact_charging_session"
    ADD CONSTRAINT "fact_charging_session_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_dtc_event"
    ADD CONSTRAINT "fact_dtc_event_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_dtc_event"
    ADD CONSTRAINT "fact_dtc_event_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."dim_driver"("driver_id");



ALTER TABLE ONLY "public"."fact_dtc_event"
    ADD CONSTRAINT "fact_dtc_event_dtc_id_fkey" FOREIGN KEY ("dtc_id") REFERENCES "public"."dim_dtc"("dtc_id");



ALTER TABLE ONLY "public"."fact_dtc_event"
    ADD CONSTRAINT "fact_dtc_event_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."fact_trip"("trip_id");



ALTER TABLE ONLY "public"."fact_dtc_event"
    ADD CONSTRAINT "fact_dtc_event_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_harsh_events"
    ADD CONSTRAINT "fact_harsh_events_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_harsh_events"
    ADD CONSTRAINT "fact_harsh_events_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."dim_driver"("driver_id");



ALTER TABLE ONLY "public"."fact_harsh_events"
    ADD CONSTRAINT "fact_harsh_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."fact_trip"("trip_id");



ALTER TABLE ONLY "public"."fact_harsh_events"
    ADD CONSTRAINT "fact_harsh_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_network_events"
    ADD CONSTRAINT "fact_network_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_part_demand_forecast"
    ADD CONSTRAINT "fact_part_demand_forecast_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."fact_part_demand_forecast"
    ADD CONSTRAINT "fact_part_demand_forecast_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."dim_region"("region_id");



ALTER TABLE ONLY "public"."fact_part_replacement"
    ADD CONSTRAINT "fact_part_replacement_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "public"."dim_dealer"("dealer_id");



ALTER TABLE ONLY "public"."fact_part_replacement"
    ADD CONSTRAINT "fact_part_replacement_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."fact_part_replacement"
    ADD CONSTRAINT "fact_part_replacement_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."dim_supplier"("supplier_id");



ALTER TABLE ONLY "public"."fact_part_replacement"
    ADD CONSTRAINT "fact_part_replacement_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_telemetry"
    ADD CONSTRAINT "fact_telemetry_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_telemetry"
    ADD CONSTRAINT "fact_telemetry_signal_code_fkey" FOREIGN KEY ("signal_code") REFERENCES "public"."dim_signal"("signal_code");



ALTER TABLE ONLY "public"."fact_telemetry"
    ADD CONSTRAINT "fact_telemetry_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_trip"
    ADD CONSTRAINT "fact_trip_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_trip"
    ADD CONSTRAINT "fact_trip_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."dim_driver"("driver_id");



ALTER TABLE ONLY "public"."fact_trip"
    ADD CONSTRAINT "fact_trip_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_vehicle_daily"
    ADD CONSTRAINT "fact_vehicle_daily_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_vehicle_daily"
    ADD CONSTRAINT "fact_vehicle_daily_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."dim_driver"("driver_id");



ALTER TABLE ONLY "public"."fact_vehicle_daily"
    ADD CONSTRAINT "fact_vehicle_daily_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_vehicle_health"
    ADD CONSTRAINT "fact_vehicle_health_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_vehicle_health"
    ADD CONSTRAINT "fact_vehicle_health_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."fact_vehicle_health_legacy"
    ADD CONSTRAINT "fact_vehicle_health_part_id_fkey_legacy" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."fact_vehicle_health"
    ADD CONSTRAINT "fact_vehicle_health_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_vehicle_health_legacy"
    ADD CONSTRAINT "fact_vehicle_health_vehicle_id_fkey_legacy" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_vehicle_status"
    ADD CONSTRAINT "fact_vehicle_status_date_id_fkey" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_vehicle_status"
    ADD CONSTRAINT "fact_vehicle_status_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."dim_driver"("driver_id");



ALTER TABLE ONLY "public"."fact_vehicle_status"
    ADD CONSTRAINT "fact_vehicle_status_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."fact_trip"("trip_id");



ALTER TABLE ONLY "public"."fact_vehicle_status"
    ADD CONSTRAINT "fact_vehicle_status_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_alerts"
    ADD CONSTRAINT "fk_alert_date" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_alerts"
    ADD CONSTRAINT "fk_alert_incident" FOREIGN KEY ("incident_id") REFERENCES "public"."fact_incidents"("incident_id");



ALTER TABLE ONLY "public"."fact_booking"
    ADD CONSTRAINT "fk_booking_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."fact_booking"
    ADD CONSTRAINT "fk_booking_model" FOREIGN KEY ("model_id") REFERENCES "public"."dim_v_model"("model_id");



ALTER TABLE ONLY "public"."fact_booking"
    ADD CONSTRAINT "fk_booking_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_case_status_history"
    ADD CONSTRAINT "fk_case_status_history_case" FOREIGN KEY ("case_id") REFERENCES "public"."fact_service_case"("case_id");



ALTER TABLE ONLY "public"."fact_complaints"
    ADD CONSTRAINT "fk_complaints_case" FOREIGN KEY ("case_id") REFERENCES "public"."fact_service_case"("case_id");



ALTER TABLE ONLY "public"."fact_complaints"
    ADD CONSTRAINT "fk_complaints_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."dim_customer"
    ADD CONSTRAINT "fk_customer_region" FOREIGN KEY ("region_id") REFERENCES "public"."dim_region"("region_id");



ALTER TABLE ONLY "public"."fact_deployments"
    ADD CONSTRAINT "fk_deployment_date" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_vehicle_dispatch"
    ADD CONSTRAINT "fk_dispatch_destination" FOREIGN KEY ("destination_location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_vehicle_dispatch"
    ADD CONSTRAINT "fk_dispatch_origin" FOREIGN KEY ("origin_location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_vehicle_dispatch"
    ADD CONSTRAINT "fk_dispatch_route" FOREIGN KEY ("route_id") REFERENCES "public"."dim_route"("route_id");



ALTER TABLE ONLY "public"."fact_vehicle_dispatch"
    ADD CONSTRAINT "fk_dispatch_transporter" FOREIGN KEY ("transporter_id") REFERENCES "public"."fact_transporter"("transporter_id");



ALTER TABLE ONLY "public"."fact_vehicle_dispatch"
    ADD CONSTRAINT "fk_dispatch_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_data_quality"
    ADD CONSTRAINT "fk_dq_date" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_customer_feedback"
    ADD CONSTRAINT "fk_feedback_case" FOREIGN KEY ("case_id") REFERENCES "public"."fact_service_case"("case_id");



ALTER TABLE ONLY "public"."fact_customer_feedback"
    ADD CONSTRAINT "fk_feedback_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."fact_repair_orders"
    ADD CONSTRAINT "fk_fro_dealer" FOREIGN KEY ("dealer_id") REFERENCES "public"."dim_dealer"("dealer_id");



ALTER TABLE ONLY "public"."fact_repair_orders"
    ADD CONSTRAINT "fk_fro_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_warranty_claims"
    ADD CONSTRAINT "fk_fwc_dealer" FOREIGN KEY ("dealer_id") REFERENCES "public"."dim_dealer"("dealer_id");



ALTER TABLE ONLY "public"."fact_warranty_claims"
    ADD CONSTRAINT "fk_fwc_part" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."fact_warranty_claims"
    ADD CONSTRAINT "fk_fwc_supplier" FOREIGN KEY ("supplier_id") REFERENCES "public"."dim_supplier"("supplier_id");



ALTER TABLE ONLY "public"."fact_warranty_claims"
    ADD CONSTRAINT "fk_fwc_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_incidents"
    ADD CONSTRAINT "fk_incident_date" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_l_vehicle_delivery"
    ADD CONSTRAINT "fk_l_delivery_booking" FOREIGN KEY ("booking_id") REFERENCES "public"."fact_booking"("booking_id");



ALTER TABLE ONLY "public"."fact_l_vehicle_delivery"
    ADD CONSTRAINT "fk_l_delivery_dispatch" FOREIGN KEY ("dispatch_id") REFERENCES "public"."fact_vehicle_dispatch"("dispatch_id");



ALTER TABLE ONLY "public"."fact_l_vehicle_delivery"
    ADD CONSTRAINT "fk_l_delivery_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."dim_location"
    ADD CONSTRAINT "fk_location_region" FOREIGN KEY ("region_id") REFERENCES "public"."dim_region"("region_id");



ALTER TABLE ONLY "public"."fact_logistics_exception"
    ADD CONSTRAINT "fk_logistics_exception_dispatch" FOREIGN KEY ("dispatch_id") REFERENCES "public"."fact_vehicle_dispatch"("dispatch_id");



ALTER TABLE ONLY "public"."fact_logistics_exception"
    ADD CONSTRAINT "fk_logistics_exception_location" FOREIGN KEY ("location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_logistics_exception"
    ADD CONSTRAINT "fk_logistics_exception_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_vehicle_movement_history"
    ADD CONSTRAINT "fk_movement_dispatch" FOREIGN KEY ("dispatch_id") REFERENCES "public"."fact_vehicle_dispatch"("dispatch_id");



ALTER TABLE ONLY "public"."fact_vehicle_movement_history"
    ADD CONSTRAINT "fk_movement_location" FOREIGN KEY ("location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_vehicle_movement_history"
    ADD CONSTRAINT "fk_movement_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_nv_vehicle_delivery"
    ADD CONSTRAINT "fk_nv_delivery_booking" FOREIGN KEY ("booking_id") REFERENCES "public"."fact_booking"("booking_id");



ALTER TABLE ONLY "public"."fact_nv_vehicle_delivery"
    ADD CONSTRAINT "fk_nv_delivery_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_part_inventory"
    ADD CONSTRAINT "fk_part_inventory_location" FOREIGN KEY ("location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_part_inventory"
    ADD CONSTRAINT "fk_part_inventory_part" FOREIGN KEY ("part_id") REFERENCES "public"."dim_part"("part_id");



ALTER TABLE ONLY "public"."dim_route"
    ADD CONSTRAINT "fk_route_destination" FOREIGN KEY ("destination_location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."dim_route"
    ADD CONSTRAINT "fk_route_origin" FOREIGN KEY ("origin_location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_sales_transaction"
    ADD CONSTRAINT "fk_sales_booking" FOREIGN KEY ("booking_id") REFERENCES "public"."fact_booking"("booking_id");



ALTER TABLE ONLY "public"."fact_sales_transaction"
    ADD CONSTRAINT "fk_sales_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."fact_sales_transaction"
    ADD CONSTRAINT "fk_sales_model" FOREIGN KEY ("model_id") REFERENCES "public"."dim_v_model"("model_id");



ALTER TABLE ONLY "public"."fact_sales_transaction"
    ADD CONSTRAINT "fk_sales_region" FOREIGN KEY ("region_id") REFERENCES "public"."dim_region"("region_id");



ALTER TABLE ONLY "public"."fact_sales_target"
    ADD CONSTRAINT "fk_sales_target_model" FOREIGN KEY ("model_id") REFERENCES "public"."dim_v_model"("model_id");



ALTER TABLE ONLY "public"."fact_sales_target"
    ADD CONSTRAINT "fk_sales_target_region" FOREIGN KEY ("region_id") REFERENCES "public"."dim_region"("region_id");



ALTER TABLE ONLY "public"."fact_sales_transaction"
    ADD CONSTRAINT "fk_sales_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_service_case"
    ADD CONSTRAINT "fk_service_case_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."fact_service_case"
    ADD CONSTRAINT "fk_service_case_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_telemetry_legacy"
    ADD CONSTRAINT "fk_telemetry_date_legacy" FOREIGN KEY ("date_id") REFERENCES "public"."dim_date"("date_id");



ALTER TABLE ONLY "public"."fact_telemetry_legacy"
    ADD CONSTRAINT "fk_telemetry_vehicle_legacy" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."fact_transportation_cost"
    ADD CONSTRAINT "fk_transportation_cost_dispatch" FOREIGN KEY ("dispatch_id") REFERENCES "public"."fact_vehicle_dispatch"("dispatch_id");



ALTER TABLE ONLY "public"."fact_transportation_cost"
    ADD CONSTRAINT "fk_transportation_cost_route" FOREIGN KEY ("route_id") REFERENCES "public"."dim_route"("route_id");



ALTER TABLE ONLY "public"."fact_transportation_cost"
    ADD CONSTRAINT "fk_transportation_cost_transporter" FOREIGN KEY ("transporter_id") REFERENCES "public"."fact_transporter"("transporter_id");



ALTER TABLE ONLY "public"."dim_vehicle"
    ADD CONSTRAINT "fk_vehicle_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."dim_customer"("customer_id");



ALTER TABLE ONLY "public"."fact_vehicle_inventory"
    ADD CONSTRAINT "fk_vehicle_inventory_location" FOREIGN KEY ("location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."fact_vehicle_inventory"
    ADD CONSTRAINT "fk_vehicle_inventory_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "public"."dim_vehicle"("vehicle_id");



ALTER TABLE ONLY "public"."dim_vehicle"
    ADD CONSTRAINT "fk_vehicle_location" FOREIGN KEY ("location_id") REFERENCES "public"."dim_location"("location_id");



ALTER TABLE ONLY "public"."dim_vehicle"
    ADD CONSTRAINT "fk_vehicle_model" FOREIGN KEY ("model_id") REFERENCES "public"."dim_v_model"("model_id");



CREATE POLICY "Allow public read" ON "public"."fact_app_metrics" FOR SELECT USING (true);



CREATE POLICY "Allow public read" ON "public"."fact_batch_jobs" FOR SELECT USING (true);



CREATE POLICY "Allow public read" ON "public"."fact_network_events" FOR SELECT USING (true);



CREATE POLICY "Allow public read access on data quality" ON "public"."fact_data_quality" FOR SELECT USING (true);



CREATE POLICY "Allow public read access on dates" ON "public"."dim_date" FOR SELECT USING (true);



CREATE POLICY "Allow public read access on parts" ON "public"."dim_part" FOR SELECT USING (true);



CREATE POLICY "Allow public read access on suppliers" ON "public"."dim_supplier" FOR SELECT USING (true);



CREATE POLICY "Allow public read access on vehicles" ON "public"."dim_vehicle" FOR SELECT USING (true);



ALTER TABLE "public"."bridge_dtc_part" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_date" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_driver" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_dtc" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_part" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_signal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_supplier" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dim_vehicle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_app_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_batch_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_charging_session" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_data_quality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_dtc_event" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_harsh_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_network_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_part_demand_forecast" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_part_replacement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_telemetry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_trip" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_vehicle_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_vehicle_health" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fact_vehicle_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "telematics_public_read" ON "public"."bridge_dtc_part" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."dim_driver" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."dim_dtc" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."dim_signal" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_charging_session" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_dtc_event" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_harsh_events" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_part_demand_forecast" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_part_replacement" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_telemetry" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_trip" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_vehicle_daily" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_vehicle_health" FOR SELECT USING (true);



CREATE POLICY "telematics_public_read" ON "public"."fact_vehicle_status" FOR SELECT USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."bridge_dtc_part" TO "service_role";
GRANT SELECT ON TABLE "public"."bridge_dtc_part" TO "anon";
GRANT SELECT ON TABLE "public"."bridge_dtc_part" TO "authenticated";



GRANT ALL ON TABLE "public"."dim_application" TO "anon";
GRANT ALL ON TABLE "public"."dim_application" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_application" TO "service_role";



GRANT ALL ON TABLE "public"."dim_customer" TO "anon";
GRANT ALL ON TABLE "public"."dim_customer" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_customer" TO "service_role";



GRANT ALL ON TABLE "public"."dim_date" TO "anon";
GRANT ALL ON TABLE "public"."dim_date" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_date" TO "service_role";



GRANT ALL ON TABLE "public"."dim_dealer" TO "anon";
GRANT ALL ON TABLE "public"."dim_dealer" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_dealer" TO "service_role";



GRANT ALL ON TABLE "public"."dim_driver" TO "service_role";
GRANT SELECT ON TABLE "public"."dim_driver" TO "anon";
GRANT SELECT ON TABLE "public"."dim_driver" TO "authenticated";



GRANT ALL ON TABLE "public"."dim_dtc" TO "service_role";
GRANT SELECT ON TABLE "public"."dim_dtc" TO "anon";
GRANT SELECT ON TABLE "public"."dim_dtc" TO "authenticated";



GRANT ALL ON TABLE "public"."dim_location" TO "anon";
GRANT ALL ON TABLE "public"."dim_location" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_location" TO "service_role";



GRANT ALL ON TABLE "public"."dim_part" TO "anon";
GRANT ALL ON TABLE "public"."dim_part" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_part" TO "service_role";



GRANT ALL ON TABLE "public"."dim_region" TO "anon";
GRANT ALL ON TABLE "public"."dim_region" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_region" TO "service_role";



GRANT ALL ON TABLE "public"."dim_route" TO "anon";
GRANT ALL ON TABLE "public"."dim_route" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_route" TO "service_role";



GRANT ALL ON TABLE "public"."dim_signal" TO "service_role";
GRANT SELECT ON TABLE "public"."dim_signal" TO "anon";
GRANT SELECT ON TABLE "public"."dim_signal" TO "authenticated";



GRANT ALL ON TABLE "public"."dim_standard_repair_times" TO "anon";
GRANT ALL ON TABLE "public"."dim_standard_repair_times" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_standard_repair_times" TO "service_role";



GRANT ALL ON TABLE "public"."dim_supplier" TO "anon";
GRANT ALL ON TABLE "public"."dim_supplier" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_supplier" TO "service_role";



GRANT ALL ON TABLE "public"."dim_v_model" TO "anon";
GRANT ALL ON TABLE "public"."dim_v_model" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_v_model" TO "service_role";



GRANT ALL ON TABLE "public"."dim_vehicle" TO "anon";
GRANT ALL ON TABLE "public"."dim_vehicle" TO "authenticated";
GRANT ALL ON TABLE "public"."dim_vehicle" TO "service_role";



GRANT ALL ON TABLE "public"."fact_alerts" TO "anon";
GRANT ALL ON TABLE "public"."fact_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."fact_app_metrics" TO "anon";
GRANT ALL ON TABLE "public"."fact_app_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_app_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."fact_batch_jobs" TO "anon";
GRANT ALL ON TABLE "public"."fact_batch_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_batch_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."fact_booking" TO "anon";
GRANT ALL ON TABLE "public"."fact_booking" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_booking" TO "service_role";



GRANT ALL ON TABLE "public"."fact_case_status_history" TO "anon";
GRANT ALL ON TABLE "public"."fact_case_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_case_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."fact_charging_session" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_charging_session" TO "anon";
GRANT SELECT ON TABLE "public"."fact_charging_session" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_complaints" TO "anon";
GRANT ALL ON TABLE "public"."fact_complaints" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_complaints" TO "service_role";



GRANT ALL ON TABLE "public"."fact_customer_feedback" TO "anon";
GRANT ALL ON TABLE "public"."fact_customer_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_customer_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."fact_data_quality" TO "anon";
GRANT ALL ON TABLE "public"."fact_data_quality" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_data_quality" TO "service_role";



GRANT ALL ON TABLE "public"."fact_deployments" TO "anon";
GRANT ALL ON TABLE "public"."fact_deployments" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_deployments" TO "service_role";



GRANT ALL ON TABLE "public"."fact_dtc_event" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_dtc_event" TO "anon";
GRANT SELECT ON TABLE "public"."fact_dtc_event" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_harsh_events" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_harsh_events" TO "anon";
GRANT SELECT ON TABLE "public"."fact_harsh_events" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_incidents" TO "anon";
GRANT ALL ON TABLE "public"."fact_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_incidents" TO "service_role";



GRANT ALL ON TABLE "public"."fact_l_vehicle_delivery" TO "anon";
GRANT ALL ON TABLE "public"."fact_l_vehicle_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_l_vehicle_delivery" TO "service_role";



GRANT ALL ON TABLE "public"."fact_logistics_exception" TO "anon";
GRANT ALL ON TABLE "public"."fact_logistics_exception" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_logistics_exception" TO "service_role";



GRANT ALL ON TABLE "public"."fact_network_events" TO "anon";
GRANT ALL ON TABLE "public"."fact_network_events" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_network_events" TO "service_role";



GRANT ALL ON TABLE "public"."fact_nv_vehicle_delivery" TO "anon";
GRANT ALL ON TABLE "public"."fact_nv_vehicle_delivery" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_nv_vehicle_delivery" TO "service_role";



GRANT ALL ON TABLE "public"."fact_part_demand_forecast" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_part_demand_forecast" TO "anon";
GRANT SELECT ON TABLE "public"."fact_part_demand_forecast" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_part_inventory" TO "anon";
GRANT ALL ON TABLE "public"."fact_part_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_part_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."fact_part_replacement" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_part_replacement" TO "anon";
GRANT SELECT ON TABLE "public"."fact_part_replacement" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_repair_orders" TO "anon";
GRANT ALL ON TABLE "public"."fact_repair_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_repair_orders" TO "service_role";



GRANT ALL ON TABLE "public"."fact_sales_target" TO "anon";
GRANT ALL ON TABLE "public"."fact_sales_target" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_sales_target" TO "service_role";



GRANT ALL ON TABLE "public"."fact_sales_transaction" TO "anon";
GRANT ALL ON TABLE "public"."fact_sales_transaction" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_sales_transaction" TO "service_role";



GRANT ALL ON TABLE "public"."fact_service_case" TO "anon";
GRANT ALL ON TABLE "public"."fact_service_case" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_service_case" TO "service_role";



GRANT ALL ON TABLE "public"."fact_telemetry" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_telemetry" TO "anon";
GRANT SELECT ON TABLE "public"."fact_telemetry" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_telemetry_legacy" TO "anon";
GRANT ALL ON TABLE "public"."fact_telemetry_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_telemetry_legacy" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fact_telemetry_telemetry_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fact_telemetry_telemetry_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fact_telemetry_telemetry_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fact_transportation_cost" TO "anon";
GRANT ALL ON TABLE "public"."fact_transportation_cost" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_transportation_cost" TO "service_role";



GRANT ALL ON TABLE "public"."fact_transporter" TO "anon";
GRANT ALL ON TABLE "public"."fact_transporter" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_transporter" TO "service_role";



GRANT ALL ON TABLE "public"."fact_trip" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_trip" TO "anon";
GRANT SELECT ON TABLE "public"."fact_trip" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_vehicle_daily" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_vehicle_daily" TO "anon";
GRANT SELECT ON TABLE "public"."fact_vehicle_daily" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_vehicle_dispatch" TO "anon";
GRANT ALL ON TABLE "public"."fact_vehicle_dispatch" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_vehicle_dispatch" TO "service_role";



GRANT ALL ON TABLE "public"."fact_vehicle_health" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_vehicle_health" TO "anon";
GRANT SELECT ON TABLE "public"."fact_vehicle_health" TO "authenticated";



GRANT ALL ON TABLE "public"."fact_vehicle_health_legacy" TO "anon";
GRANT ALL ON TABLE "public"."fact_vehicle_health_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_vehicle_health_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."fact_vehicle_inventory" TO "anon";
GRANT ALL ON TABLE "public"."fact_vehicle_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_vehicle_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."fact_vehicle_movement_history" TO "anon";
GRANT ALL ON TABLE "public"."fact_vehicle_movement_history" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_vehicle_movement_history" TO "service_role";



GRANT ALL ON TABLE "public"."fact_vehicle_status" TO "service_role";
GRANT SELECT ON TABLE "public"."fact_vehicle_status" TO "anon";
GRANT SELECT ON TABLE "public"."fact_vehicle_status" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."fact_vehicle_status_status_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fact_vehicle_status_status_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fact_vehicle_status_status_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fact_warranty_claims" TO "anon";
GRANT ALL ON TABLE "public"."fact_warranty_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."fact_warranty_claims" TO "service_role";



GRANT ALL ON TABLE "public"."sales_vehicle_reassignment" TO "anon";
GRANT ALL ON TABLE "public"."sales_vehicle_reassignment" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_vehicle_reassignment" TO "service_role";



GRANT ALL ON TABLE "public"."v_vehicle_context" TO "service_role";
GRANT SELECT ON TABLE "public"."v_vehicle_context" TO "anon";
GRANT SELECT ON TABLE "public"."v_vehicle_context" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







