import type { HomeAssistant, Observer, Site, SiteConfig } from "../types";
import { DEFAULT_BORTLE } from "./defaults";

const ASTROWEATHER_PREFIX = "weather.astroweather_";

export function isAstroWeatherEntity(hass: HomeAssistant, entityId: string): boolean {
  if (!entityId.startsWith("weather.")) return false;
  const reg = hass.entities?.[entityId];
  if (reg?.platform) return reg.platform === "astroweather";
  return entityId.startsWith(ASTROWEATHER_PREFIX);
}

export function findAstroWeatherEntities(hass: HomeAssistant): string[] {
  return Object.keys(hass.states)
    .filter((id) => isAstroWeatherEntity(hass, id))
    .sort();
}

/** AstroWeather exposes the instance's coordinates as `sensor.*_latitude` / `sensor.*_longitude` on the same device. */
function coordinateFromSensors(hass: HomeAssistant, entityId: string): Observer | null {
  const deviceId = hass.entities?.[entityId]?.device_id;
  const siblings = deviceId
    ? Object.values(hass.entities ?? {}).filter((e) => e.device_id === deviceId).map((e) => e.entity_id)
    : [];
  const stem = entityId.slice("weather.".length);
  const find = (suffix: string) =>
    siblings.find((id) => id.startsWith("sensor.") && id.endsWith(`_${suffix}`)) ??
    (hass.states[`sensor.${stem}_${suffix}`] ? `sensor.${stem}_${suffix}` : undefined);
  const num = (id?: string) => (id ? Number.parseFloat(hass.states[id]?.state ?? "") : NaN);
  const latitude = num(find("latitude"));
  const longitude = num(find("longitude"));
  const elevation = num(find("elevation"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, elevation: Number.isFinite(elevation) ? elevation : undefined };
}

export function siteDisplayName(hass: HomeAssistant | undefined, cfg: SiteConfig): string {
  if (cfg.name) return cfg.name;
  const attrs = hass?.states[cfg.entity]?.attributes;
  if (attrs?.location_name) return String(attrs.location_name);
  const friendly = attrs?.friendly_name as string | undefined;
  if (friendly) return friendly.replace(/^astroweather\s*/i, "") || friendly;
  return cfg.entity.replace(ASTROWEATHER_PREFIX, "").replace(/^weather\./, "").replace(/_/g, " ");
}

// Observers are cached by value so astronomy-engine observer objects (keyed by identity) are reused across renders.
const observerCache = new Map<string, Observer>();
function cachedObserver(o: Observer): Observer {
  const key = `${o.latitude},${o.longitude},${o.elevation ?? 0}`;
  let cached = observerCache.get(key);
  if (!cached) observerCache.set(key, (cached = o));
  return cached;
}

export function resolveSite(hass: HomeAssistant, cfg: SiteConfig): Site {
  const manual =
    cfg.latitude !== undefined && cfg.longitude !== undefined ? { latitude: cfg.latitude, longitude: cfg.longitude } : null;
  const observer = manual ?? coordinateFromSensors(hass, cfg.entity);
  return {
    entity: cfg.entity,
    name: siteDisplayName(hass, cfg),
    bortle: cfg.bortle ?? DEFAULT_BORTLE,
    drive_minutes: cfg.drive_minutes,
    observer: observer ? cachedObserver(observer) : null,
  };
}

export function homeObserver(hass: HomeAssistant): Observer {
  return cachedObserver({
    latitude: hass.config.latitude,
    longitude: hass.config.longitude,
    elevation: hass.config.elevation,
  });
}
