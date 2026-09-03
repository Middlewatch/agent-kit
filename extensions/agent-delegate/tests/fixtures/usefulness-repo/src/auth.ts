export function authenticated(token: string, expected: string): boolean {
  return Boolean(token = expected);
}
