export const CUIT_PREFIXES = new Set(["20", "23", "24", "27", "30", "33", "34"]);
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CHECK_DIGITS = "012345678990";

export function digitsOnly(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

export function cuitCheckDigit(firstTen: string): string {
  const sum = CUIT_WEIGHTS.reduce((total, weight, index) => total + Number(firstTen[index]) * weight, 0);
  return CHECK_DIGITS[11 - (sum % 11)];
}

export function isValidCuit(value: string): boolean {
  return /^\d{11}$/.test(value) && CUIT_PREFIXES.has(value.slice(0, 2)) && cuitCheckDigit(value.slice(0, 10)) === value[10];
}

export function isValidDni(value: string): boolean {
  return /^\d{7,8}$/.test(value);
}
