import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return zone;
  } catch {
    throw Error("Choose a valid IANA timezone.");
  }
}
export function instant(date: string, time: string, zone: string) {
  validTimezone(zone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw Error("Choose a valid date and time.");
  const result = fromZonedTime(date + "T" + time + ":00", zone);
  if (
    !Number.isFinite(result.getTime()) ||
    formatInTimeZone(result, zone, "yyyy-MM-dd HH:mm") !== date + " " + time
  )
    throw Error(
      "This local date/time does not exist in the selected timezone.",
    );
  return result.toISOString();
}
export function parseInstant(value: string) {
  return new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value + "T00:00:00Z"
        : value.replace(" ", "T") + "Z",
  );
}
export function dateInZone(value: string | Date, zone: string) {
  return formatInTimeZone(
    typeof value === "string" ? parseInstant(value) : value,
    validTimezone(zone),
    "yyyy-MM-dd",
  );
}
export function addDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
