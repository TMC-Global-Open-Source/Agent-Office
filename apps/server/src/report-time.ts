const formatters = new Map<string, Intl.DateTimeFormat>();

export function reportDate(timestamp: number, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(timestamp);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

export function nextReportDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Find the first instant of a local calendar day without assuming a 24-hour day. */
export function startOfReportDate(date: string, timeZone: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  let left = utc - 2 * 86_400_000;
  let right = utc + 2 * 86_400_000;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (reportDate(middle, timeZone) < date) left = middle + 1;
    else right = middle;
  }
  return left;
}

export function parseUsageTimestamp(value: string): number {
  const normalized = value.replace(" ", "T");
  return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
}
