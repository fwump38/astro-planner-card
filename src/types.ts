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
  calendar_site?: string;
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
