export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; Path=/; Secure`;
}

export function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Secure; Max-Age=0`;
}
