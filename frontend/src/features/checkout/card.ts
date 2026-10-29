const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/(\d{2})$/;

export function cardDigits(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function luhnValid(digits: string): boolean {
  let total = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    }
    total += digit;
  }
  return total % 10 === 0;
}

export function validCardNumber(value: string): boolean {
  const digits = cardDigits(value);
  return /^\d{13,19}$/.test(digits) && luhnValid(digits);
}

export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = EXPIRY_PATTERN.exec(value.trim());
  return match ? { month: Number(match[1]), year: 2000 + Number(match[2]) } : null;
}

export function isExpired({ month, year }: { month: number; year: number }, now: Date): boolean {
  return year < now.getUTCFullYear() || (year === now.getUTCFullYear() && month < now.getUTCMonth() + 1);
}

export function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
