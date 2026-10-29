import { randomUUID } from "node:crypto";

export type Credentials = { email: string; password: string };
export type TestUser = Credentials & { firstName: string; lastName: string };

export function newPassword(): string {
  return `e2e-password-${randomUUID().slice(0, 8)}`;
}

export function newUser(): TestUser {
  return {
    firstName: "Ana",
    lastName: "Prueba",
    email: `e2e+${randomUUID().slice(0, 12)}@example.com`,
    password: newPassword(),
  };
}
