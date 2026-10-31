import { invalidFields } from "@/features/errors/use-error-message";
import { ApiError } from "@/lib/api/errors";

const TAKEN_FIELDS: Record<string, string> = { code_taken: "code", slug_taken: "slug", sku_taken: "sku" };

function takenField(error: unknown): string | undefined {
  return error instanceof ApiError ? TAKEN_FIELDS[error.code] : undefined;
}

export function isTaken(error: unknown): boolean {
  return takenField(error) !== undefined;
}

export function fieldsOf<Field extends string>(error: unknown, fields: readonly Field[]): Field[] {
  const taken = takenField(error);
  const names = taken ? [taken] : invalidFields(error);
  return fields.filter((field) => names.includes(field));
}
