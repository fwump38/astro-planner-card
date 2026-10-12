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
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
  config: {
    latitude: number;
    longitude: number;
    elevation?: number;
    time_zone: string;
    components?: string[];
    unit_system?: { temperature?: string; wind_speed?: string; length?: string };
  };
  locale?: { language?: string; time_format?: "language" | "system" | "12" | "24" };
  language?: string;
  themes?: { darkMode?: boolean };
}

export type TabId = "ranking" | "chart" | "calendar";
export type SortId = "score" | "distance" | "bortle";

export interface LightDome {
  name: string;
  latitude: number;
  longitude: number;
  population: number;
}

/**
 * The card only displays what the Milky Way Planner integration calculates. Sites, Bortle classes, drive times, light domes,
 * score weights and the sky thresholds are all configured there (Settings → Devices & services → Milky Way Planner).
 */
export interface CardConfig {
  type: string;
  title?: string;
  default_tab?: TabId;
  /** Tabs to show, in order. Defaults to all three. */
  tabs?: TabId[];
  /** Initial sort for the Tonight view. */
  default_sort?: SortId;
  /** Show only these sites (AstroWeather entity ids). Defaults to every site in the integration. */
  sites?: (string | { entity: string })[];
  /** Colour calendar days pink/blue/dark by how good the core window is. */
  calendar_highlight?: boolean;
}

export interface ResolvedConfig extends CardConfig {
  default_tab: TabId;
  tabs: TabId[];
  default_sort: SortId;
  /** Entity ids to show; empty = all of the integration's sites. */
  site_filter: string[];
  calendar_highlight: boolean;
}

/** Thresholds set in the integration that the views describe in their legends. */
export interface PlannerSettings {
  nights: number;
  min_gc_altitude: number;
  max_moon_illumination: number;
  calendar_min_altitude: number;
  calendar_best_minutes: number;
  dome_warning_threshold: number;
}

export interface Observer {
  latitude: number;
  longitude: number;
  elevation?: number;
}

/** A site as the integration reports it. */
export interface Site {
  entity: string;
  name: string;
  bortle: number;
  /** True when the Bortle class was estimated from nearby towns rather than set by the user. */
  bortle_estimated?: boolean;
  drive_minutes?: number | null;
  /** True when `drive_minutes` came from routing/estimation rather than the user's settings. */
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
