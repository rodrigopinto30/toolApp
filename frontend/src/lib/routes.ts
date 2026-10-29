export const PROTECTED_PATHS = ["/account", "/checkout"];
export const AUTH_PATHS = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
