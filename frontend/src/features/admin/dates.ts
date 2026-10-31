const MS_PER_MINUTE = 60_000;
const LOCAL_MINUTES_LENGTH = 16;

export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * MS_PER_MINUTE);
  return local.toISOString().slice(0, LOCAL_MINUTES_LENGTH);
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export function startOfDay(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function endOfDay(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
