import { invalidFields } from "@/features/errors/use-error-message";
import { ApiError } from "@/lib/api/errors";

export function isCodeTaken(error: unknown): boolean {
  return error instanceof ApiError && error.code === "code_taken";
}

export function fieldsOf<Field extends string>(error: unknown, fields: readonly Field[]): Field[] {
  const names = isCodeTaken(error) ? ["code"] : invalidFields(error);
  return fields.filter((field) => names.includes(field));
}
