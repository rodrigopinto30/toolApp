export const PROTECTED_PATHS = ["/account"];

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
