const SEPARATOR = ":";
const MAX_SPECS = 50;
const MAX_NAME_LENGTH = 80;
const MAX_VALUE_LENGTH = 255;

export function formatSpecs(specs: Record<string, unknown> | null | undefined): string {
  return Object.entries(specs ?? {})
    .map(([name, value]) => `${name}${SEPARATOR} ${String(value)}`)
    .join("\n");
}

function linesOf(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function entryOf(line: string): [string, string] {
  const index = line.indexOf(SEPARATOR);
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}

export function areValidSpecs(value: string): boolean {
  const lines = linesOf(value);
  const names = new Set(lines.map((line) => entryOf(line)[0]));
  return (
    lines.length <= MAX_SPECS &&
    names.size === lines.length &&
    lines.every((line) => {
      const [name, text] = entryOf(line);
      return (
        line.includes(SEPARATOR) &&
        name.length > 0 &&
        name.length <= MAX_NAME_LENGTH &&
        text.length > 0 &&
        text.length <= MAX_VALUE_LENGTH
      );
    })
  );
}

export function parseSpecs(value: string): Record<string, string> | null {
  const lines = linesOf(value);
  return lines.length > 0 ? Object.fromEntries(lines.map(entryOf)) : null;
}
