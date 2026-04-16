function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toShiftedDate(input: Date | string, offsetHours: number): Date {
  const base = input instanceof Date ? input : new Date(input);
  return new Date(base.getTime() + offsetHours * 3600 * 1000);
}

export function formatDateTimeAtOffset(input: Date | string, offsetHours: number): string {
  const shifted = toShiftedDate(input, offsetHours);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());
  const seconds = pad2(shifted.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatHourMinuteAtOffset(input: Date | string, offsetHours: number): string {
  const shifted = toShiftedDate(input, offsetHours);
  const hours = pad2(shifted.getUTCHours());
  const minutes = pad2(shifted.getUTCMinutes());
  return `${hours}:${minutes}`;
}
