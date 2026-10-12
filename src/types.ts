// Minimal Home Assistant frontend typings (avoids pulling in custom-card-helpers).
export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_updated?: string;
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
}

export interface HassConnection {
  subscribeMessage<T>(callback: (msg: T) => void, msg: Record<string, unknown>): Promise<() => void>;
}

export interface HomeAssistant {
  states: Record<string, HassEntityState>;
  entities?: Record<string, HassEntityRegistryEntry>;
  connection: HassConnection;
  config: {
    latitude: number;
    longitude: number;
    elevation?: number;
    time_zone: string;
    unit_system?: { temperature?: string; wind_speed?: string; length?: string };
  };
  locale?: { language?: string; time_format?: "language" | "system" | "12" | "24" };
  language?: string;
  themes?: { darkMode?: boolean };
}

export type TabId = "ranking" | "chart" | "calendar";

export interface SiteConfig {
  entity: string;
  name?: string;
  /** Bortle class 1–9 (sky quality at zenith). */
  bortle?: number;
  drive_minutes?: number;
  /** Optional manual coordinates; otherwise read from AstroWeather's latitude/longitude sensors. */
  latitude?: number;
  longitude?: number;
}

export interface LightDome {
  name: string;
  latitude: number;
  longitude: number;
  population: number;
}

export interface ScoreWeights {
  cloud: number;
  transparency: number;
  seeing: number;
  calm: number;
}

export interface CardConfig {
  type: string;
  title?: string;
  default_tab?: TabId;
  sites: SiteConfig[];
  light_domes?: LightDome[];
  nights?: number;
  min_gc_altitude?: number;
  max_moon_illumination?: number;
  weights?: Partial<ScoreWeights>;
  /** Look up driving time from the Home Assistant location to each site (unless `drive_minutes` is set). */
  auto_drive_time?: boolean;
  /** Colour calendar days pink/blue/dark by how good the core window is. */
  calendar_highlight?: boolean;
  /** Minimum dark core window (minutes) for a day to count as "best". */
  calendar_best_minutes?: number;
  /** Minimum core altitude for the calendar. Capture the Atlas counts the core from the horizon, so this defaults to 0. */
  calendar_min_altitude?: number;
  dome_radius_km?: number;
  // YAML-only advanced options
  dome_sigma?: number;
  dome_warning_threshold?: number;
}

export interface ResolvedConfig extends CardConfig {
  default_tab: TabId;
  light_domes: LightDome[];
  nights: number;
  min_gc_altitude: number;
  max_moon_illumination: number;
  weights: ScoreWeights;
  dome_radius_km: number;
  auto_drive_time: boolean;
  calendar_highlight: boolean;
  calendar_best_minutes: number;
  calendar_min_altitude: number;
  dome_sigma: number;
  dome_warning_threshold: number;
}

export interface Observer {
  latitude: number;
  longitude: number;
  elevation?: number;
}

/** A site with resolved coordinates, ready for computation. */
export interface Site {
  entity: string;
  name: string;
  bortle: number;
  drive_minutes?: number;
  /** True when `drive_minutes` came from routing/estimation rather than the user's config. */
  drive_estimated?: boolean;
  observer: Observer | null;
}

/** One hourly row from AstroWeather's `weather/subscribe_forecast` (hourly). */
export interface AstroForecastHour {
  datetime: string;
  condition?: number;
  cloudless_percentage?: number;
  cloudcover_percentage?: number;
  cloud_area_fraction?: number;
  cloud_area_fraction_high?: number;
  cloud_area_fraction_medium?: number;
  cloud_area_fraction_low?: number;
  seeing_percentage?: number;
  transparency_percentage?: number;
  calm_percentage?: number;
  lifted_index?: number;
  humidity?: number;
  temperature?: number;
  wind_speed?: number;
  wind_bearing?: number | string;
  precipitation_amount?: number;
  fog_area_fraction?: number;
  fog2m_area_fraction?: number;
}
