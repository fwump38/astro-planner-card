export interface CivilDate {
  y: number;
  m: number; // 1–12
  d: number;
}

export function civilDateIn(date: Date, timeZone: string): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function addDays(c: CivilDate, n: number): CivilDate {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function dateKey(c: CivilDate): string {
  return `${c.y}-${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
}

/** Day of week (0 = Sunday) for a civil date. */
export function weekday(c: CivilDate): number {
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Approximate local solar noon for a civil date at a longitude, used to anchor "the night starting this evening". */
export function solarNoon(c: CivilDate, longitude: number): Date {
  return new Date(Date.UTC(c.y, c.m - 1, c.d, 12) - (longitude / 15) * 3600e3);
}

export function makeTimeFormatter(timeZone: string, language = "en", timeFormat?: string): (d: Date) => string {
  const hour12 = timeFormat === "12" ? true : timeFormat === "24" ? false : undefined;
  const fmt = new Intl.DateTimeFormat(language, { timeZone, hour: "numeric", minute: "2-digit", hour12 });
  return (d) => fmt.format(d);
}

export function makeHourFormatter(timeZone: string, language = "en", timeFormat?: string): (d: Date) => string {
  const hour12 = timeFormat === "12" ? true : timeFormat === "24" ? false : undefined;
  const fmt = new Intl.DateTimeFormat(language, { timeZone, hour: "numeric", hour12 });
  return (d) => fmt.format(d).replace(/\s?(AM|PM)$/i, (m) => m.trim()[0].toLowerCase());
}

export function makeDayFormatter(timeZone: string, language = "en"): (d: Date) => string {
  const fmt = new Intl.DateTimeFormat(language, { timeZone, weekday: "short", month: "short", day: "numeric" });
  return (d) => fmt.format(d);
}
