function pad(value: number) {
  return String(value).padStart(2, "0");
}

function coerceDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function buildPhotoSystemTags(value: string | Date) {
  const date = coerceDate(value);
  if (Number.isNaN(date.getTime())) return [] as string[];
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return [`date:${year}`, `date:${year}-${month}`, `date:${year}-${month}-${day}`];
}

export function parseDateTagQuery(raw: string) {
  const normalized = raw.trim().replace(/^date:/i, "").replace(/\//g, "-");
  if (!/^\d{4}(-\d{2}){0,2}$/.test(normalized)) return null;

  const [yearPart, monthPart, dayPart] = normalized.split("-");
  const year = Number(yearPart);
  const month = monthPart ? Number(monthPart) : null;
  const day = dayPart ? Number(dayPart) : null;
  if (!Number.isInteger(year) || year < 1970 || year > 9999) return null;
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) return null;
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return null;

  const start = new Date(year, month ? month - 1 : 0, day ?? 1, 0, 0, 0, 0);
  const end =
    day !== null
      ? new Date(year, (month ?? 1) - 1, day, 23, 59, 59, 999)
      : month !== null
        ? new Date(year, month, 0, 23, 59, 59, 999)
        : new Date(year, 11, 31, 23, 59, 59, 999);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}
